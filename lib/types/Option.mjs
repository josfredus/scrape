const Option = function (isNone, value) {
  this._isNone = isNone
  this._value = value
}

Option.prototype.isNone = function() {
  return this._isNone
}

Option.prototype.isSome = function() {
  return !this._isNone
}

Option.prototype.value = function() {
  return this._value
}

Option.prototype.valueOrElse = function(defaultValue) {
  return this._isNone ? defaultValue : this._value
}

export const None = () => new Option(true, null)
export const Some = value => new Option(false, value)
