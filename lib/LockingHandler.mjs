import * as Option from './types/Option.mjs'

export const LockingHandler = function(
  {
    listsOfSortings,
    viewportByList,
    indexDispenser,
    navigationHandler,
  }
) {
  this._listsOfSortings = listsOfSortings
  this._viewportByList = viewportByList
  this._indexDispenser = indexDispenser
  this._navigationHandler = navigationHandler
  this._unlockListeners = []
  this._lockSignaler = () => {}
  this._terminationListeners = []
  this._terminated = false
}

LockingHandler.prototype.run = async function(
  {
    lockSignaler,
  }
) {
  this._lockSignaler = lockSignaler
  const handlerByAction = new Map()
  handlerByAction.set('lock', () => this._lockCurrentList())
  handlerByAction.set('unlock', () => this._unlockCurrentList())
  handlerByAction.set('unlock-all', () => this._unlockAll())
  while (true) {
    const action = await Promise.race([
      this._listenForAction(),
      this._listenForTermination(),
    ])
    if (this._terminated) {
      break
    }
    const handler = handlerByAction.get(action)
    handler()
  }
}

LockingHandler.prototype.terminate = function() {
  this._listsOfSortings = null
  this._viewportByList = null
  this._indexDispenser = null
  this._navigationHandler = null
  this._unlockListeners.splice(0)
  this._lockSignaler = null
  this._terminated = true
  this._terminationListeners.splice(0).forEach(resolver => resolver())
}

LockingHandler.prototype.ensureCurrentListIsLocked = function() {
  this._lockCurrentList()
}

LockingHandler.prototype.listenForUpdateByUnlocking = function() {
  return new Promise(r => {
    this._unlockListeners.push(r)
  })
}

LockingHandler.prototype._listenForAction = async function () {
  while (true) {
    const key = await Promise.race([
      this._listenForKeydown(),
      this._listenForTermination(),
    ])
    if (this._terminated) {
      break
    }
    if (key === 'Control') {
      if (this._navigationHandler.isInNavigationMode()) {
        const currentList = this._navigationHandler.getCurrentList()
        const locked = this._indexDispenser.isListLocked(currentList)
        return locked ? 'unlock' : 'lock'
      } else {
        return 'unlock-all'
      }
    }
  }
}

LockingHandler.prototype._listenForTermination = async function() {
  return new Promise(r => this._terminationListeners.push(r))
}

LockingHandler.prototype._lockCurrentList = function() {
  const currentList = this._navigationHandler.getCurrentList()
  if (!this._indexDispenser.isListLocked(currentList)) {
    this._indexDispenser.lock(currentList)
    this._lockListUI(currentList)
    this._lockSignaler(currentList)
  }
}

LockingHandler.prototype._unlockCurrentList = function() {
  const currentList = this._navigationHandler.getCurrentList()
  this._unlockListUI(currentList)
  if (this._indexDispenser.unlock(currentList)) {
    this._signalUpdateByUnlocking([currentList])
  }
}

LockingHandler.prototype._unlockAll = function() {
  const updatedLists = []
  for (const sortingList of this._listsOfSortings) {
    if (this._indexDispenser.isListLocked(sortingList)) {
      if (this._indexDispenser.unlock(sortingList)) {
        updatedLists.push(sortingList)
      }
      this._unlockListUI(sortingList)
    }
  }
  if (updatedLists.length > 0) {
    this._signalUpdateByUnlocking(updatedLists)
  }
}

LockingHandler.prototype._listenForKeydown = function () {
  return new Promise(r => {
    const callback = event => {
      window.removeEventListener('keydown', callback)
      r(event.key)
    }
    window.addEventListener('keydown', callback)
  })
}

LockingHandler.prototype._lockListUI = function(sortingList) {
  const viewport = this._viewportByList.get(sortingList)
  viewport.classList.add('viewport-locked')
}

LockingHandler.prototype._unlockListUI = function(sortingList) {
  const viewport = this._viewportByList.get(sortingList)
  viewport.classList.remove('viewport-locked')
}

LockingHandler.prototype._signalUpdateByUnlocking = function(updatedLists) {
  this._unlockListeners.splice(0).forEach(resolver => {
    resolver(updatedLists)
  })
}
