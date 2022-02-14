import * as Option from './types/Option.mjs'
import * as Outcome from './types/Outcome.mjs'

export const LinkCache = function() {
  this._sources = new Map()
  this._dismissals = new Set()
  this._queueByPriority = new Map()
  this._queueByPriority.set(0, new Set())
}

LinkCache.prototype.fetchSource = async function({article, priority}) {
  if (this._sources.has(article.url)) {
    return this._sources.get(article.url)
  }
  const queueTicket = this._getQueueTicket(priority)
  await queueTicket.waitForStartOfService
  if (!this._sources.has(article.url)) {
    this._sources.set(article.url, this._extractSource(article))
  }
  const fetching = await this._sources.get(article.url)
  queueTicket.signalEndOfService()
  return fetching
}

LinkCache.prototype.isLinkDismissed = function(article) {
  return this._dismissals.has(article.url)
}

LinkCache.prototype.dismissLink = function(article) {
  this._dismissals.add(article.url)
}

LinkCache.prototype._extractSource = async function(article) {
  const extractor = this._extractorByType.get(article._type)
  const extracting = await extractor(article)
  if (extracting.isFailure()) {
    this.dismissLink(article)
  }
  return extracting
}

LinkCache.prototype._extractorByType = new Map()
LinkCache.prototype._extractorByType.set('image', async article =>
  Outcome.Success(LinkCache._https(article.url))
)
LinkCache.prototype._extractorByType.set('imgur-gifv', async article =>
  Outcome.Success(LinkCache._https(article.url.replace(/\.\w+$/, '.mp4')))
)
LinkCache.prototype._extractorByType.set('vreddit', async article =>
  Outcome.Success(LinkCache._https(article._vredditSrc))
)
LinkCache.prototype._extractorByType.set('gfycat', async article => {
  const id = article.url.match(/\/([A-Za-z]+)$/)[1]
  const url = `https://api.gfycat.com/v1/gfycats/${id}`
  let requestFailed = false
  const response = await fetch(url).catch(_ => requestFailed = true)
  if (requestFailed || !response.ok) {
    return Outcome.Failure()
  }
  const json = await response.json()
  if (!json.gfyItem || !json.gfyItem.mp4Url) {
    return Outcome.Failure()
  }
  return Outcome.Success(json.gfyItem.mp4Url)
})
LinkCache.prototype._extractorByType.set('redgifs', async article => {
  const id = article.url.match(/\/([A-Za-z]+)$/)[1]
  const url = `https://api.redgifs.com/v2/gifs/${id}`
  let requestFailed = false
  const response = await fetch(url).catch(_ => requestFailed = true)
  if (requestFailed || !response.ok) {
    return Outcome.Failure()
  }
  const json = await response.json()
  if (!json.gif || !json.gif.urls) {
    return Outcome.Failure()
  }
  if (json.gif.urls.hd) {
    return Outcome.Success(json.gif.urls.hd)
  }
  if (json.gif.urls.sd) {
    return Outcome.Success(json.gif.urls.sd)
  }
  return Outcome.Failure()
})

LinkCache._https = function(url) {
  return url.slice(0, 5) === "http:" ? "https" + url.slice(4) : url
}

LinkCache.prototype._getQueueTicket = function(priority) {
  let signalEndOfService
  const waitForEndSignal = new Promise(r => signalEndOfService = r)
  if (priority === 0) {
    const waitForStartOfService = (async () => {})()
    const waitForEndOfService = (async () => {
      await waitForEndSignal
      this._queueByPriority.get(0).delete(waitForEndOfService)
    })()
    this._queueByPriority.get(0).add(waitForEndOfService)
    return {waitForStartOfService, signalEndOfService}
  }
  if (!this._queueByPriority.has(priority)) {
    this._queueByPriority.set(priority, [])
  }
  const samePriorityQueue = this._queueByPriority.get(priority)
  const initialPlaceInQueue = samePriorityQueue.length
  const waitForStartOfService = (async () => {
    if (initialPlaceInQueue > 0) {
      await samePriorityQueue[initialPlaceInQueue - 1]
    }
    let moreImportantQueuesLeft = true
    while (moreImportantQueuesLeft) {
      let lastInQueue = Option.None()
      for (const n of [...Array(priority).keys()].reverse()) {
        if (n === 0) {
          const highestPrioritySet = this._queueByPriority.get(0)
          if (highestPrioritySet.size > 0) {
            lastInQueue = Option.Some([...highestPrioritySet][0])
          }
          break
        }
        if (this._queueByPriority.has(n)) {
          const queue = this._queueByPriority.get(n)
          lastInQueue = Option.Some(queue[queue.length - 1])
          break
        }
      }
      if (lastInQueue.isNone()) {
        moreImportantQueuesLeft = false
      } else {
        await lastInQueue.value()
      }
    }
  })()
  const waitForEndOfService = (async () => {
    await waitForEndSignal
    samePriorityQueue.shift()
    if (!samePriorityQueue.length) {
      this._queueByPriority.delete(priority)
    }
  })()
  samePriorityQueue.push(waitForEndOfService)
  return {waitForStartOfService, signalEndOfService}
}
