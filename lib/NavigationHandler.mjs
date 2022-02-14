export const NavigationHandler = function(
  {
    listsOfSortings,
    viewportByList,
  }
) {
  this._listsOfSortings = listsOfSortings
  this._viewportByList = viewportByList
  this._isOn = false
  this._currentListIndex = 0
  this._terminationListeners = []
  this._terminated = false
}

NavigationHandler.prototype.run = async function() {
  const handlerByAction = new Map()
  handlerByAction.set('activate', () => this._activate())
  handlerByAction.set('deactivate', () => this._deactivate())
  handlerByAction.set('nav-right', () => this._navRight())
  handlerByAction.set('nav-left', () => this._navLeft())
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

NavigationHandler.prototype.terminate = function() {
  this._listsOfSortings = null
  this._viewportByList = null
  this._terminated = true
  this._terminationListeners.splice(0).forEach(resolver => resolver())
}

NavigationHandler.prototype.isInNavigationMode = function() {
  return this._isOn
}

NavigationHandler.prototype.getCurrentList = function() {
  return this._listsOfSortings[this._currentListIndex]
}

NavigationHandler.prototype._listenForAction = async function() {
  while (true) {
    const key = await this._listenForKeydown()
    if (this._terminated) {
      break
    }
    if (key === 'Shift') {
      return this._isOn ? 'deactivate' : 'activate'
    } else if (this._isOn && key === 'ArrowRight') {
      return 'nav-right'
    } else if (this._isOn && key === 'ArrowLeft') {
      return 'nav-left'
    }
  }
}

NavigationHandler.prototype._listenForTermination = async function() {
  return new Promise(r => this._terminationListeners.push(r))
}

NavigationHandler.prototype._activate = function() {
  this._isOn = true
  this._highlight()
}

NavigationHandler.prototype._deactivate = function() {
  this._isOn = false
  this._unlight()
}

NavigationHandler.prototype._navRight = function() {
  this._unlight()
  this._currentListIndex += 1
  this._boundCurrentListIndex()
  this._highlight()
}

NavigationHandler.prototype._navLeft = function() {
  this._unlight()
  this._currentListIndex -= 1
  this._boundCurrentListIndex()
  this._highlight()
}

NavigationHandler.prototype._listenForKeydown = function () {
  return new Promise(r => {
    const callback = event => {
      window.removeEventListener('keydown', callback)
      r(event.key)
    }
    window.addEventListener('keydown', callback)
  })
}

NavigationHandler.prototype._highlight = function() {
  const viewport = this._viewportByList.get(this.getCurrentList())
  viewport.classList.add('viewport-highlighted')
}

NavigationHandler.prototype._unlight = function() {
  const viewport = this._viewportByList.get(this.getCurrentList())
  viewport.classList.remove('viewport-highlighted')
}

NavigationHandler.prototype._boundCurrentListIndex = function() {
  const n = this._listsOfSortings.length
  this._currentListIndex = ((this._currentListIndex % n) + n) % n
}
