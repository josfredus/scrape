import * as Outcome from './types/Outcome.mjs'
import * as Stamp from './types/Stamp.mjs'

import {LinkCache} from './LinkCache.mjs'
import {ScraperStash} from './ScraperStash.mjs'

export const SubredditValidator = function() {
  this._stamp = Stamp.create()
  this._linkCache = new LinkCache()
  this._scraperStash = new ScraperStash({
    linkCache: this._linkCache,
    expectedConsecutiveBrokenLinks: 5,
    maxConsecutiveBrokenLinks: 20,
  })
  this._numberOfSortings = 0
  this._numberOfInspectedSortings = 0
}

SubredditValidator.prototype.validate = async function(
  {
    listsOfSortings,
    progressBar,
  }
) {
  const stamp = this._stamp.next()
  const listsOfValidSortings = []
  const barrenSubreddits = new Set()
  const validations = await this._inspectListsOfSortings({
    listsOfSortings,
    stamp,
    progressBar,
  })
  if (!this._stamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  for (let i = 0; i < validations.length; i++) {
    const sortingList = listsOfSortings[i]
    const validationsForThisList = validations[i]
    const listOfValidatedSortings = []
    for (let j = 0; j < validationsForThisList.length; j++) {
      const sorting = sortingList[j]
      const validation = validationsForThisList[j]
      if (validation.isSuccess()) {
        listOfValidatedSortings.push(sorting)
      } else if (validation.isFailure()) {
        barrenSubreddits.add(sorting.subreddit)
      }
    }
    if (listOfValidatedSortings.length > 0) {
      listsOfValidSortings.push(listOfValidatedSortings)
    }
  }
  if (listsOfValidSortings.length > 0) {
    return {
      validating: Outcome.Success(listsOfValidSortings),
      barrenSubreddits,
    }
  } else {
    return {
      validating: Outcome.Failure(),
      barrenSubreddits,
    }
  }
}

SubredditValidator.prototype.cancel = function() {
  this._stamp.next()
}

SubredditValidator.prototype.getScraperStash = function() {
  return this._scraperStash
}

SubredditValidator.prototype._inspectListsOfSortings = async function(
  {
    listsOfSortings,
    stamp,
    progressBar,
  }
) {
  this._numberOfSortings = listsOfSortings.reduce((r, cur) => r + cur.length, 0)
  this._numberOfInspectedSortings = 0
  const inspections = []
  for (let i = 0; i < listsOfSortings.length; i++) {
    const sortingList = listsOfSortings[i]
    const inspectionsForThisList = []
    for (let j = 0; j < sortingList.length; j++) {
      const inspection = this._inspectSorting({
        sorting: sortingList[j],
        stamp,
        progressBar,
      })
      inspectionsForThisList.push(inspection)
    }
    inspections.push(Promise.all(inspectionsForThisList))
  }
  return Promise.all(inspections)
}

SubredditValidator.prototype._inspectSorting = async function(
  {
    sorting,
    stamp,
    progressBar,
  }
) {
  const scraper = this._scraperStash.get(sorting)
  const scrapingFirst = await scraper.getArticle(0)
  if (!this._stamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  this._numberOfInspectedSortings += 1
  progressBar.setProgress({
    progress: this._numberOfInspectedSortings / this._numberOfSortings,
  })
  return scrapingFirst
}
