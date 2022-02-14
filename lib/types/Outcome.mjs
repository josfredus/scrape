import * as Option from './Option.mjs'

export const Outcome = function(success, failure, interrupted, result) {
  this._success = success
  this._failure = failure
  this._interrupted = interrupted
  this._result = result
}

Outcome.prototype.isSuccess = function() {
  return this._success
}

Outcome.prototype.isFailure = function() {
  return this._failure
}

Outcome.prototype.isInterrupted = function() {
  return this._interrupted
}

Outcome.prototype.result = function() {
  return this._result.value()
}

export const Success = result => new Outcome(
  true,
  false,
  false,
  Option.Some(result),
)

export const Failure = () => new Outcome(
  false,
  true,
  false,
  Option.None(),
)

export const Interrupted = () => new Outcome(
  false,
  false,
  true,
  Option.None(),
)
