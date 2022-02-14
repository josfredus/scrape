import * as Option from './types/Option.mjs'
import * as Stamp from './types/Stamp.mjs'

export const ListUpdateTracker = function(
  {
    allSortingLists,
    indexDispenser,
    progressBar,
    navigationHandler,
    lockingHandler,
    autoskipEnabled,
    autoskipDefaultTimer,
    autoskipDirection,
  }
) {
  this._indexDispenser = indexDispenser
  this._progressBar = progressBar
  this._navigationHandler = navigationHandler
  this._lockingHandler = lockingHandler
  this._direction = autoskipDirection
  this._listsToProcess = new Set()
  this._videoDurationByList = new Map()
  this._addListsToProcess(allSortingLists)
  this._listsToWaitFor = new Set()
  this._noMoreListToWaitForListeners = []
  this._autoskipEnabled = autoskipEnabled
  this._autoskipDefaultTimer = autoskipDefaultTimer
  this._autoskipDirection = autoskipDirection
  this._autoskipListeners = []
  this._autoskipStamp = Stamp.create()
  this._autoskipLaunchTime = Option.None()
  this._autoskipElapsedDuration = Option.None()
  this._terminationListeners = []
  this._terminated = false
}

ListUpdateTracker.prototype.run = async function() {
  this._cueAutoskipAfterLoading()
  const handlerByAction = new Map()
  handlerByAction.set('resume-autoskip', () => this._resumeAutoskip())
  handlerByAction.set('pause-autoskip', () => this._pauseAutoskip())
  while (true) {
    const action = await Promise.race([
      this._listenForAutoskipToggle(),
      this._listenForTermination(),
    ])
    if (this._terminated) {
      break
    }
    const handler = handlerByAction.get(action)
    handler()
  }
}

ListUpdateTracker.prototype.terminate = function() {
  this._indexDispenser = null
  this._progressBar = null
  this._navigationHandler = null
  this._lockingHandler = null
  this._listsToProcess.clear()
  this._videoDurationByList.clear()
  this._listsToWaitFor.clear()
  this._noMoreListToWaitForListeners.splice(0)
  this._autoskipListeners.splice(0)
  this._terminated = true
  this._terminationListeners.splice(0).forEach(resolver => resolver())
}

ListUpdateTracker.prototype.waitForUpdate = async function() {
  const event = await Promise.race([
    this._listenForSkipCommand().then(direction => ({
      type: 'manual-skip',
      direction,
    })),
    this._listenForAutoskip().then(direction => ({type: 'autoskip'})),
    this._lockingHandler.listenForUpdateByUnlocking().then(updatedLists => ({
      type: 'update-by-unlocking',
      updatedLists,
    })),
    this._listenForTermination(),
  ])
  if (this._terminated) {
    return
  }
  if (event.type === 'manual-skip') {
    let updatedLists;
    if (this._navigationHandler.isInNavigationMode()) {
      this._lockingHandler.ensureCurrentListIsLocked()
      const currentList = this._navigationHandler.getCurrentList()
      if (event.direction === 'downstream') {
        updatedLists = this._indexDispenser.goDownstreamForList(currentList)
      } else if (event.direction === 'upstream') {
        updatedLists = this._indexDispenser.goUpstreamForList(currentList)
      }
      this._addListsToProcess(updatedLists)
    } else {
      if (event.direction === 'downstream') {
        updatedLists = this._indexDispenser.goDownstreamForAllUnlocked()
      } else if (event.direction === 'upstream') {
        updatedLists = this._indexDispenser.goUpstreamForAllUnlocked()
      }
      this._addListsToProcess(updatedLists)
      this._cueAutoskipAfterLoading()
    }
    this._direction = event.direction
  } else if (event.type === 'autoskip') {
    let updatedLists;
    if (this._autoskipDirection === 'downstream') {
      updatedLists = this._indexDispenser.goDownstreamForAllUnlocked()
    } else if (this._autoskipDirection === 'upstream') {
      updatedLists = this._indexDispenser.goUpstreamForAllUnlocked()
    }
    this._addListsToProcess(updatedLists)
    this._cueAutoskipAfterLoading()
    this._direction = this._autoskipDirection
  } else if (event.type === 'update-by-unlocking') {
    this._addListsToProcess(event.updatedLists)
  }
}

ListUpdateTracker.prototype.getListsToProcess = function() {
  return this._listsToProcess
}

ListUpdateTracker.prototype.getDirectionOfLastUpdate = function() {
  return this._direction
}

ListUpdateTracker.prototype.signalSuccessfulProcess = function(
  {
    sortingList,
    eventualVideoDuration,
  }
) {
  this._listsToProcess.delete(sortingList)
  if (eventualVideoDuration.isSome()) {
    this._videoDurationByList.set(sortingList, eventualVideoDuration.value())
  }
  this._stopWaitingForList(sortingList)
}

ListUpdateTracker.prototype.signalFailedProcess = function(sortingList) {
  this._listsToProcess.delete(sortingList)
  this._stopWaitingForList(sortingList)
}

ListUpdateTracker.prototype.createLockSignaler = function() {
  return sortingList => {
    if (!this._isAutoskipPossible()) {
      this._cancelAutoskip()
    }
    this._stopWaitingForList(sortingList)
  }
}

ListUpdateTracker.prototype._addListsToProcess = function(updatedLists) {
  updatedLists.forEach(sortingList => {
    this._listsToProcess.add(sortingList)
    this._videoDurationByList.delete(sortingList)
  })
}

ListUpdateTracker.prototype._canGoUpstream = function() {
  if (this._navigationHandler.isInNavigationMode()) {
    const currentList = this._navigationHandler.getCurrentList()
    return this._indexDispenser.canGoUpstreamForList(currentList)
  } else {
    return this._indexDispenser.canGoUpstreamForAllUnlocked()
  }
}

ListUpdateTracker.prototype._isDownstreamInput = function(key) {
  return this._navigationHandler.isInNavigationMode()
    ? (key === 'ArrowDown')
    : (key === 'ArrowDown' || key === 'ArrowRight')
}

ListUpdateTracker.prototype._isUpstreamInput = function(key) {
  return this._navigationHandler.isInNavigationMode()
    ? (key === 'ArrowUp')
    : (key === 'ArrowUp' || key === 'ArrowLeft')
}

ListUpdateTracker.prototype._listenForSkipCommand = async function() {
  return new Promise(r => {
    const callback = event => {
      if (this._terminated) {
        window.removeEventListener('keydown', callback)
        return r()
      }
      if (this._indexDispenser.allLocked()) {
        return
      }
      if (this._isDownstreamInput(event.key)) {
        window.removeEventListener('keydown', callback)
        r('downstream')
      } else if (this._isUpstreamInput(event.key) && this._canGoUpstream()) {
        window.removeEventListener('keydown', callback)
        r('upstream')
      }
    }
    window.addEventListener('keydown', callback)
  })
}

ListUpdateTracker.prototype._listenForAutoskip = async function() {
  return new Promise(r => this._autoskipListeners.push(r))
}

ListUpdateTracker.prototype._listenForAutoskipToggle = async function() {
  while (true) {
    const key = await new Promise(r => {
      const callback = event => {
        window.removeEventListener('keydown', callback)
        r(event.key)
      }
      window.addEventListener('keydown', callback)
    })
    if (this._terminated) {
      break
    }
    if (key === ' ') {
      return this._autoskipEnabled ? 'pause-autoskip' : 'resume-autoskip'
    }
  }
}

ListUpdateTracker.prototype._listenForTermination = async function() {
  return new Promise(r => this._terminationListeners.push(r))
}

ListUpdateTracker.prototype._cueAutoskipAfterLoading = async function() {
  if (!this._isAutoskipPossible()) {
    return this._cancelAutoskip()
  }
  this._listsToWaitFor.clear()
  for (const sortingList of this._listsToProcess) {
    if (!this._indexDispenser.isListLocked(sortingList)) {
      this._listsToWaitFor.add(sortingList)
    }
  }
  this._progressBar.stopCountdown()
  this._autoskipLaunchTime = Option.None()
  this._autoskipElapsedDuration = Option.None()
  const stamp = this._autoskipStamp.next()
  if (this._listsToWaitFor.size > 0) {
    const waiting = await Promise.race([
      new Promise(r => this._noMoreListToWaitForListeners.push(r)),
      this._listenForTermination(),
    ])
    if (!this._autoskipStamp.is(stamp) || this._terminated) {
      return
    }
  }
  this._startAutoskip()
}

ListUpdateTracker.prototype._stopWaitingForList = function(sortingList) {
  if (this._listsToWaitFor.has(sortingList)) {
    this._listsToWaitFor.delete(sortingList)
    if (this._listsToWaitFor.size === 0) {
      this._noMoreListToWaitForListeners.splice(0).forEach(r => r())
    }
  }
}

ListUpdateTracker.prototype._startAutoskip = async function() {
  const stamp = this._autoskipStamp.next()
  if (!this._isAutoskipPossible()) {
    return this._cancelAutoskip()
  }
  const duration = this._computeAutoskipDuration()
  const headStart = this._autoskipElapsedDuration.valueOrElse(0)
  const autoskipDuration = (duration - headStart)
  this._autoskipLaunchTime = Option.Some(performance.now())
  this._progressBar.startCountdown({duration, headStart})
  const waiting = await Promise.race([
    new Promise(r => setTimeout(r, autoskipDuration * 1000)),
    this._listenForTermination(),
  ])
  if (!this._autoskipStamp.is(stamp) || this._terminated) {
    return
  }
  this._progressBar.stopCountdown()
  this._autoskipLaunchTime = Option.None()
  this._autoskipElapsedDuration = Option.None()
  this._autoskipListeners.splice(0).forEach(resolver => resolver())
}

ListUpdateTracker.prototype._cancelAutoskip = function() {
  this._autoskipEnabled = false
  this._autoskipStamp.next()
  this._progressBar.stopCountdown()
  this._progressBar.hide()
  this._autoskipLaunchTime = Option.None()
  this._autoskipElapsedDuration = Option.None()
}

ListUpdateTracker.prototype._pauseAutoskip = function() {
  this._autoskipEnabled = false
  this._autoskipStamp.next()
  this._progressBar.stopCountdown()
  if (this._autoskipLaunchTime.isSome()) {
    let elapsed = this._autoskipElapsedDuration.valueOrElse(0)
    elapsed += (performance.now() - this._autoskipLaunchTime.value()) / 1000
    this._autoskipElapsedDuration = Option.Some(elapsed)
  } else {
    this._progressBar.hide()
    this._autoskipElapsedDuration = Option.None()
  }
}

ListUpdateTracker.prototype._resumeAutoskip = function() {
  this._autoskipEnabled = true
  if (!this._isAutoskipPossible()) {
    return this._cancelAutoskip()
  }
  if (this._autoskipElapsedDuration.isSome()) {
    this._startAutoskip()
  } else {
    this._cueAutoskipAfterLoading()
  }
}

ListUpdateTracker.prototype._isAutoskipPossible = function() {
  return (
    this._autoskipEnabled
    && !this._indexDispenser.allLocked()
    && !(
      this._autoskipDirection === 'upstream'
      && !this._indexDispenser.canGoUpstreamForAllUnlocked()
    )
  )
}

ListUpdateTracker.prototype._computeAutoskipDuration = function() {
  let maxDuration = 0
  for (const [sortingList, duration] of this._videoDurationByList) {
    if (!this._indexDispenser.isListLocked(sortingList)) {
      maxDuration = Math.max(maxDuration, duration)
    }
  }
  return maxDuration > 0 ? maxDuration : this._autoskipDefaultTimer
}
