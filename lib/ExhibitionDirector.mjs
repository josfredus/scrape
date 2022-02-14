import * as Outcome from './types/Outcome.mjs'
import * as Stamp from './types/Stamp.mjs'

import {CaptionBox} from './CaptionBox.mjs'
import {IndexDispenser} from './IndexDispenser.mjs'
import {ListUpdateTracker} from './ListUpdateTracker.mjs'
import {LockingHandler} from './LockingHandler.mjs'
import {MediaDisplay} from './MediaDisplay.mjs'
import {NavigationHandler} from './NavigationHandler.mjs'
import {ViewportAlloter} from './ViewportAlloter.mjs'

export const ExhibitionDirector = function(
  {
    listsOfSortings,
    scraperStash,
    config,
    progressBar,
    viewport,
  }
) {
  this._listsOfSortings = listsOfSortings
  this._scraperStash = scraperStash
  this._config = config
  this._progressBar = progressBar
  this._viewportAlloter = new ViewportAlloter({mainViewport: viewport})
  this._viewportByList = this._viewportAlloter.allot(this._listsOfSortings)
  this._loadingStampByList = new Map()
  this._mediaDisplayByList = new Map()
  this._captionBoxByList = new Map()
  this._listsOfSortings.forEach(sortingList => {
    this._loadingStampByList.set(sortingList, Stamp.create())
    this._mediaDisplayByList.set(sortingList, new MediaDisplay({
      viewport: this._viewportByList.get(sortingList),
    }))
    this._captionBoxByList.set(sortingList, new CaptionBox({
      viewport: this._viewportByList.get(sortingList),
    }))
  })
  this._indexDispenser = new IndexDispenser({
    listsOfSortings,
    shuffle: config.shuffle,
    reverseConfig: config.reverse,
  })
  this._navigationHandler = new NavigationHandler({
    listsOfSortings,
    viewportByList: this._viewportByList,
  })
  this._lockingHandler = new LockingHandler({
    listsOfSortings,
    viewportByList: this._viewportByList,
    indexDispenser: this._indexDispenser,
    navigationHandler: this._navigationHandler,
  })
  this._updateTracker = new ListUpdateTracker({
    allSortingLists: listsOfSortings,
    indexDispenser: this._indexDispenser,
    progressBar,
    navigationHandler: this._navigationHandler,
    lockingHandler: this._lockingHandler,
    autoskipEnabled: config.autoskip.enabled,
    autoskipDefaultTimer: config.autoskip.timer,
    autoskipDirection: config.reverse.enabled ? 'upstream' : 'downstream',
  })
  this._terminated = false
  this._terminationListeners = []
}

ExhibitionDirector.prototype.run = async function() {
  this._captionBoxByList.forEach(captionBox => captionBox.run())
  this._navigationHandler.run()
  this._lockingHandler.run({
    lockSignaler: this._updateTracker.createLockSignaler(),
  })
  this._updateTracker.run()
  while (true) {
    const listsToProcess = this._updateTracker.getListsToProcess()
    listsToProcess.forEach(sortingList => this._processListUpdate(sortingList))
    await Promise.race([
      this._updateTracker.waitForUpdate(),
      this._listenForTermination(),
    ])
    if (this._terminated) {
      break
    }
    this._terminationListeners.splice(0)
  }
}

ExhibitionDirector.prototype.terminate = function() {
  this._terminated = true
  this._updateTracker.terminate()
  this._updateTracker = null
  this._lockingHandler.terminate()
  this._lockingHandler = null
  this._navigationHandler.terminate()
  this._navigationHandler = null
  this._indexDispenser.terminate()
  this._indexDispenser = null
  this._captionBoxByList.forEach(captionBox => captionBox.terminate())
  this._captionBoxByList.clear()
  this._mediaDisplayByList.forEach(mediaDisplay => mediaDisplay.terminate())
  this._mediaDisplayByList.clear()
  this._loadingStampByList.clear()
  this._viewportByList = null
  this._viewportAlloter.terminate()
  this._viewportAlloter = null
  this._progressBar.stopCountdown()
  this._progressBar.hide()
  this._progressBar = null
  this._config = null
  this._scraperStash = null
  this._listsOfSortings = null
  this._terminationListeners.splice(0).forEach(resolver => resolver())
}

ExhibitionDirector.prototype._listenForTermination = async function() {
  return new Promise(r => this._terminationListeners.push(r))
}

ExhibitionDirector.prototype._processListUpdate = async function(sortingList) {
  const loadingStamp = this._loadingStampByList.get(sortingList)
  const stamp = loadingStamp.next()
  const {sorting, indexInSorting, roundNumber, roundSize, indexInRound} =
    this._indexDispenser.getCurrentLoadoutOfList(sortingList)
  const scraper = this._scraperStash.get(sorting)
  const scraping = await scraper.getArticle(indexInSorting)
  if (!loadingStamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  if (scraping.isFailure()) {
    this._updateTracker.signalFailedProcess(sortingList)
    return Outcome.Failure()
  }
  const {article, source} = scraping.result()
  const mediaType = article._type === 'image' ? 'image' : 'video'
  const mediaDisplay = this._mediaDisplayByList.get(sortingList)
  const mediaLoading = await mediaDisplay.preload({source, mediaType})
  if (!loadingStamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  if (mediaLoading.isFailure()) {
    this._updateTracker.signalFailedProcess(sortingList)
    return Outcome.Failure()
  }
  this._captionBoxByList.get(sortingList).set({
    article,
    roundNumber,
    roundSize,
    indexInRound,
  })
  await mediaDisplay.displayLoadedMedia()
  if (!loadingStamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  this._updateTracker.signalSuccessfulProcess({
    sortingList,
    eventualVideoDuration: mediaDisplay.getDisplayedMediaEventualDuration(),
  })
  const subsequentLoadouts = this._indexDispenser.getSubsequentLoadoutsOfList({
    sortingList,
    expectedDirection: this._updateTracker.getDirectionOfLastUpdate(),
    depth: this._config.preFetchingDepth,
  })
  const preloadSorting = subsequentLoadouts[0].sorting
  const indexInPreloadSorting = subsequentLoadouts[0].indexInSorting
  const preloadScraper = this._scraperStash.get(preloadSorting)
  const preloadScraping = await preloadScraper.getArticle(indexInPreloadSorting)
  if (!loadingStamp.is(stamp)) {
    return Outcome.Interrupted()
  }
  if (preloadScraping.isSuccess()) {
    const preloadArticle = preloadScraping.result().article
    const preloadSource = preloadScraping.result().source
    await mediaDisplay.preload({
      source: preloadSource,
      mediaType: preloadArticle._type === 'image' ? 'image' : 'video',
    })
    if (!loadingStamp.is(stamp)) {
      return Outcome.Interrupted()
    }
  }
  subsequentLoadouts.forEach((prefetchLoadout, priority) => {
    if (priority > 0) {
      this._scraperStash.get(prefetchLoadout.sorting).prefetch({
        index: prefetchLoadout.indexInSorting,
        priority,
      })
    }
  })
  return Outcome.Success()
}
