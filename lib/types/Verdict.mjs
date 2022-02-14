const Verdict = function({bless, curse}) {
  this._bless = bless
  this._curse = curse
}

Verdict.prototype.isBlessing = function() {
  return this._bless
}

Verdict.prototype.isCurse = function() {
  return this._curse
}

export const Blessing = () => new Verdict({bless: true, curse: false})

export const Curse = () => new Verdict({bless: false, curse: true})
