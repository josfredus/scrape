export const ViewportAlloter = function(
  {
    mainViewport,
  }
) {
  this._mainViewport = mainViewport
  this._viewportByList = new Map()
  this._lines = new Set()
}

ViewportAlloter.prototype.allot = function(listsOfSortings) {
  const n = listsOfSortings.length
  const bodyRect = document.body.getBoundingClientRect()
  const isLandscape = bodyRect.width >= bodyRect.height
  let nRows = 0
  let nCols = 0
  while (nRows * nCols < n) {
    if (nRows > nCols) {
      nCols += 1
    } else if (nCols > nRows) {
      nRows += 1
    } else if (nCols === nRows) {
      if (isLandscape) {
        nCols += 1
      } else {
        nRows += 1
      }
    }
  }
  const nLines = isLandscape ? nCols : nRows
  const fullLineLength = isLandscape ? nRows : nCols
  const lineLengths = [...Array(nLines).keys()].map(_ => fullLineLength)
  const nLinesToCripple = nRows * nCols - n
  /*
  nLines = 8
  nLinesToCripple = 2
  [ ------ * ------ * ----- ]
  0   1  2   3   4   5  6   7
  .       p=0      p=1
  |--------| = 7 / 3 = (nLines - 1) / (nLinesToCripple + 1)
  .        ^ = 1 * (7 / 3) = (p + 1) * (nLines - 1) / (nLinesToCripple + 1)
  */
  const linesToCripple = [...Array(nLinesToCripple).keys()]
    .map(p => (p + 1) * (nLines - 1) / (nLinesToCripple + 1))
    .map(x => x <= (nLines - 1) / 2 ? Math.floor(x) : Math.ceil(x))
  linesToCripple.forEach(lineIndex => {
    lineLengths[lineIndex] -= 1
  })
  if (isLandscape) {
    this._mainViewport.classList.remove('main-viewport-column')
    this._mainViewport.classList.add('main-viewport-row')
  } else {
    this._mainViewport.classList.remove('main-viewport-row')
    this._mainViewport.classList.add('main-viewport-column')
  }
  let listIndex = 0
  for (let lineIndex = 0; lineIndex < lineLengths.length; lineIndex += 1) {
    const line = document.createElement('div')
    line.classList.add('viewport-line')
    line.classList.add(isLandscape ? 'viewport-column' : 'viewport-row')
    this._mainViewport.appendChild(line)
    this._lines.add(line)
    const lineLength = lineLengths[lineIndex]
    for (let indexInLine = 0; indexInLine < lineLength; indexInLine += 1) {
      const listOfSortings = listsOfSortings[listIndex]
      const viewport = document.createElement('div')
      viewport.classList.add('viewport')
      line.appendChild(viewport)
      this._viewportByList.set(listOfSortings, viewport)
      listIndex += 1
    }
  }
  return this._viewportByList
}

ViewportAlloter.prototype.terminate = function() {
  this._viewportByList.forEach(viewport => {
    viewport.parentNode.removeChild(viewport)
  })
  this._viewportByList.clear()
  this._lines.forEach(line => {
    this._mainViewport.removeChild(line)
  })
  this._lines.clear()
  this._mainViewport = null
}
