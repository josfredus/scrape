export const IndexDispenser = function(
  {
    listsOfSortings,
    shuffle,
    reverseConfig,
  }
) {
  this._locks = new Map()
  this._orderingByRoundByList = new Map()
  this._listsOfSortings = listsOfSortings
  this._listsOfSortings.forEach(sortingList => {
    this._orderingByRoundByList.set(sortingList, new Map())
  })
  const roundSizes = listsOfSortings.map(sortingList => sortingList.length)
  this._globalRoundSize = Math.max(...roundSizes)
  this._globalIndex = reverseConfig.enabled
    ? (reverseConfig.startRound + 1) * this._globalRoundSize - 1
    : reverseConfig.startRound * this._globalRoundSize
  this._shuffle = shuffle
}

IndexDispenser.prototype.terminate = function() {
  this._locks.clear()
  this._orderingByRoundByList.clear()
  this._listsOfSortings = null
}

IndexDispenser.prototype.getCurrentLoadoutOfList = function(sortingList) {
  const index = this._computeIndexForList(sortingList)
  return this._computeLoadout({index, sortingList})
}

IndexDispenser.prototype.getSubsequentLoadoutsOfList = function(
  {
    sortingList,
    expectedDirection,
    depth,
  }
) {
  const index = this._computeIndexForList(sortingList)
  const range = [...Array(Math.max(depth, 1)).keys()]
  const forward = range.map(n => index + n + 1)
  const backward = range.map(n => index - n - 1).filter(i => i >= 0)
  const futureIndexes = (expectedDirection === 'downstream')
    ? forward.concat(backward)
    : backward.concat(forward)
  return futureIndexes.map(index => this._computeLoadout({index, sortingList}))
}

IndexDispenser.prototype.goDownstreamForList = function(sortingList) {
  if (!this._locks.has(sortingList)) {
    return new Set()
  }
  const index = this._locks.get(sortingList)
  this._locks.set(sortingList, index + 1)
  return [sortingList]
}

IndexDispenser.prototype.goDownstreamForAllUnlocked = function() {
  const rememberIndexes = new Map()
  for (const sortingList of this._listsOfSortings) {
    if (!this._locks.has(sortingList)) {
      rememberIndexes.set(sortingList, this._computeIndexForList(sortingList))
    }
  }
  if (rememberIndexes.size === 0) {
    return []
  }
  while (true) {
    this._globalIndex += 1
    const updatedLists = []
    for (const [sortingList, previousIndex] of rememberIndexes) {
      if (this._computeIndexForList(sortingList) !== previousIndex) {
        updatedLists.push(sortingList)
      }
    }
    if (updatedLists.length > 0) {
      return updatedLists
    }
  }
}

IndexDispenser.prototype.goUpstreamForList = function(sortingList) {
  if (!this._locks.has(sortingList)) {
    return []
  }
  const index = this._locks.get(sortingList)
  if (index > 0) {
    this._locks.set(sortingList, index - 1)
    return [sortingList]
  } else {
    return []
  }
}

IndexDispenser.prototype.goUpstreamForAllUnlocked = function() {
  const rememberIndexes = new Map()
  for (const sortingList of this._listsOfSortings) {
    if (!this._locks.has(sortingList)) {
      rememberIndexes.set(sortingList, this._computeIndexForList(sortingList))
    }
  }
  if (
    rememberIndexes.size === 0
    || [...rememberIndexes.values()].every(index => index === 0)
  ) {
    return []
  }
  while (true) {
    this._globalIndex -= 1
    const updatedLists = []
    for (const [sortingList, previousIndex] of rememberIndexes) {
      if (this._computeIndexForList(sortingList) !== previousIndex) {
        updatedLists.push(sortingList)
      }
    }
    if (updatedLists.length > 0) {
      return updatedLists
    }
  }
}

IndexDispenser.prototype.canGoUpstreamForList = function(sortingList) {
  return this._computeIndexForList(sortingList) > 0
}

IndexDispenser.prototype.canGoUpstreamForAllUnlocked = function() {
  return this._listsOfSortings
    .filter(sortingList => !this._locks.has(sortingList))
    .some(sortingList => this._computeIndexForList(sortingList) > 0)
}

IndexDispenser.prototype.isListLocked = function(sortingList) {
  return this._locks.has(sortingList)
}

IndexDispenser.prototype.allLocked = function() {
  return this._locks.size === this._listsOfSortings.length
}

IndexDispenser.prototype.lock = function(sortingList) {
  if (!this._locks.has(sortingList)) {
    const currentIndex = this._computeIndexForList(sortingList)
    this._locks.set(sortingList, currentIndex)
  }
}

IndexDispenser.prototype.unlock = function(sortingList) {
  const eventuallyLockedIndex = this._computeIndexForList(sortingList)
  this._locks.delete(sortingList)
  return this._computeIndexForList(sortingList) !== eventuallyLockedIndex
}

IndexDispenser.prototype._computeIndexForList = function(sortingList) {
  if (this._locks.has(sortingList)) {
    return this._locks.get(sortingList)
  }
  const roundNumber = Math.floor(this._globalIndex / this._globalRoundSize)
  const globalIndexInGlobalRound = this._globalIndex % this._globalRoundSize
  const roundProgression = globalIndexInGlobalRound / this._globalRoundSize
  const roundSize = sortingList.length
  const indexInRound = Math.floor(roundProgression * roundSize)
  return roundNumber * roundSize + indexInRound
}

IndexDispenser.prototype._computeLoadout = function(
  {
    sortingList,
    index,
  }
) {
  const roundSize = sortingList.length
  const roundNumber = Math.floor(index / roundSize)
  const indexInRound = index % roundSize
  if (!this._orderingByRoundByList.get(sortingList).has(roundNumber)) {
    const newOrdering = this._generateOrdering({sortingList, roundNumber})
    this._orderingByRoundByList.get(sortingList).set(roundNumber, newOrdering)
  }
  const ordering = this._orderingByRoundByList.get(sortingList).get(roundNumber)
  return {
    sorting: ordering[indexInRound],
    indexInSorting: roundNumber,
    roundNumber,
    roundSize,
    indexInRound,
  }
}

IndexDispenser.prototype._generateOrdering = function(
  {
    sortingList,
    roundNumber,
  }
) {
  const newOrdering = []
  if (this._shuffle) {
    const range = [...Array(sortingList.length).keys()]
    while (newOrdering.length < sortingList.length) {
      const n = range.splice(Math.floor(Math.random() * range.length), 1)[0]
      newOrdering.push(sortingList[n])
    }
  } else {
    for (let n = 0; n < sortingList.length; n++) {
      newOrdering.push(sortingList[n])
    }
  }
  return newOrdering
}
