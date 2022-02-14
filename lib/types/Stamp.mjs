const Stamp = function() {
  this._stamp = 0
}

Stamp.prototype.next = function() {
  this._stamp += 1
  return this._stamp
}

Stamp.prototype.is = function(stamp) {
  return stamp === this._stamp
}

export const create = () => new Stamp()
