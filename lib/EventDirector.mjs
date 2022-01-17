export const EventDirector = function({eventList = []}) {
  this._events = eventList
  this._callbacks = []
  this._listenCallback = null
}

EventDirector.prototype.trigger = function({eventName}) {
  if (this._listenCallback) {
    this._listenCallback(eventName)
    this._listenCallback = null
  }
}

EventDirector.prototype.connectEvent = function(
  {
    destinationEvent,
    baseEventTarget,
    baseEventName,
    conditionnal = event => true,
  }
) {
  const callback = event => conditionnal(event)
    ? void this.trigger({eventName: destinationEvent})
    : null
  baseEventTarget.addEventListener(baseEventName, callback)
  this._callbacks.push(
    {
      callback,
      target: baseEventTarget,
      event: baseEventName,
    }
  )
}

EventDirector.prototype.disconnectEvents = function() {
  for (const {callback, target, event} of this._callbacks.splice(0)) {
    target.removeEventListener(event, callback)
  }
}

EventDirector.prototype.listen = function() {
  return new Promise((r, rj) => {
    this._listenCallback = event => void r(event)
  })
}

EventDirector.prototype.waitFor = async function({relevantEvents = []}) {
  while (true) {
    const event = await this.listen()
    if (relevantEvents.includes(event)) return event
  }
}
