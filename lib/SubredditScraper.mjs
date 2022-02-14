import * as Option from './types/Option.mjs'
import * as Outcome from './types/Outcome.mjs'
import * as Verdict from './types/Verdict.mjs'

import {SubredditCrawler} from './SubredditCrawler.mjs'

export const SubredditScraper = function(
  {
    subreddit,
    method,
    period,
    linkCache,
    expectedConsecutiveBrokenLinks,
    maxConsecutiveBrokenLinks,
  }
) {
  this._crawler = new SubredditCrawler({subreddit, method, period})
  this._links = linkCache
  this._expectedConsecutiveBrokenLinks = expectedConsecutiveBrokenLinks
  this._maxConsecutiveBrokenLinks = maxConsecutiveBrokenLinks
  this._inspections = []
  this._articleByIndex = new Map()
  this._sourceByIndex = new Map()
  this._verdictChain = []
  this._blessedChain = []
  this._blessedIndexes = new Set()
  this._cursedIndexes = new Set()
  this._blessedChainSizeBySignal = new Map()
  this._allInspectedSignals = new Set()
  this._cycleIndex = Option.None()
}

SubredditScraper.prototype.getArticle = async function(index) {
  if (index >= this._blessedChain.length) {
    await this._waitForBlessedChainToGrow(index)
  }
  if (this._cycleIndex.isSome() && this._cycleIndex.value() === 0) {
    return Outcome.Failure()
  }
  const blessedIndex = this._blessedChain[
    this._cycleIndex.isNone() ? index : index % this._blessedChain.length
  ]
  return Outcome.Success({
    article: this._articleByIndex.get(blessedIndex),
    source: this._sourceByIndex.get(blessedIndex),
  })
}

SubredditScraper.prototype.prefetch = async function({index, priority}) {
  if (this._cycleIndex.isNone() || index < this._cycleIndex.value()) {
    const crawling = await this._crawler.getArticle(index)
    if (crawling.isSuccess()) {
      this._links.fetchSource({
        article: crawling.result(),
        priority,
      })
    }
  }
}

SubredditScraper.prototype._waitForBlessedChainToGrow = async function(index) {
  while (true) {
    if (
      this._cycleIndex.isSome()
      && this._cycleIndex.value() === this._verdictChain.length
    ) {
      return Outcome.Failure()
    }
    let signalBlessedChainGrowth;
    const waitForGrowth = new Promise(r => signalBlessedChainGrowth = r)
    this._blessedChainSizeBySignal.set(signalBlessedChainGrowth, index + 1)
    let signalAllInspected;
    const waitForAllInspected = new Promise(r => signalAllInspected = r)
    this._allInspectedSignals.add(signalAllInspected)
    const missing =
      (index + 1)
      - this._blessedChain.length
      + this._expectedConsecutiveBrokenLinks
    const unchained =
      this._inspections.length
      - this._verdictChain.length
    const inspectionsToAdd = missing - unchained
    for (let _ = 0; _ < inspectionsToAdd; _ += 1) {
      const nextInnerIndex = this._inspections.length
      const asyncNextInspection = async () => {
        const inspecting = await this._inspectArticle(nextInnerIndex)
        if (inspecting.isFailure()) {
          if (this._cycleIndex.isNone()) {
            this._cycleIndex = Option.Some(nextInnerIndex)
          }
          this._refreshChains()
        }
      }
      this._inspections.push(asyncNextInspection())
    }
    const batchFetching = await Promise.race([
      waitForGrowth.then(() => Outcome.Success()),
      waitForAllInspected.then(() => Outcome.Failure()),
    ])
    if (batchFetching.isSuccess()) {
      return Outcome.Success()
    }
  }
}

SubredditScraper.prototype._inspectArticle = async function(innerIndex) {
  const crawling = await this._crawler.getArticle(innerIndex)
  if (crawling.isFailure()) {
    return Outcome.Failure()
  }
  const article = crawling.result()
  this._articleByIndex.set(innerIndex, article)
  const sourceFetching = await this._links.fetchSource({article, priority: 0})
  if (sourceFetching.isSuccess()) {
    this._blessedIndexes.add(innerIndex)
    this._sourceByIndex.set(innerIndex, sourceFetching.result())
  } else if (sourceFetching.isFailure()) {
    this._cursedIndexes.add(innerIndex)
  }
  this._refreshChains()
  return Outcome.Success()
}

SubredditScraper.prototype._refreshChains = function() {
  const initialBlessedChainLength = this._blessedChain.length
  while (true) {
    const nextIndex = this._verdictChain.length
    if (this._cycleIndex.isSome() && nextIndex === this._cycleIndex.value()) {
      break
    }
    if (this._blessedIndexes.has(nextIndex)) {
      this._verdictChain.push(Verdict.Blessing())
      this._blessedChain.push(nextIndex)
    } else if (this._cursedIndexes.has(nextIndex)) {
      this._verdictChain.push(Verdict.Curse())
      const tail = this._verdictChain.length - this._maxConsecutiveBrokenLinks
      if (
        this._maxConsecutiveBrokenLinks > 0
        && tail >= 0
        && this._verdictChain.slice(tail).every(verdict => verdict.isCurse())
      ) {
        this._cycleIndex = Option.Some(tail)
        this._verdictChain.splice(tail)
        break
      }
    } else {
      break
    }
  }
  if (this._blessedChain.length > initialBlessedChainLength) {
    this._signalBlessedChainGrowth()
  }
  if (
    this._verdictChain.length === this._inspections.length
    || (
      this._cycleIndex.isSome()
      && this._verdictChain.length === this._cycleIndex.value()
    )
  ) {
    this._signalAllInspected()
  }
}

SubredditScraper.prototype._signalBlessedChainGrowth = function() {
  for (const [callToSignal, requiredSize] of this._blessedChainSizeBySignal) {
    if (this._blessedChain.length >= requiredSize) {
      this._blessedChainSizeBySignal.delete(callToSignal)
      callToSignal()
    }
  }
}

SubredditScraper.prototype._signalAllInspected = function() {
  for (const callToSignal of this._allInspectedSignals) {
    this._allInspectedSignals.delete(callToSignal)
    callToSignal()
  }
}
