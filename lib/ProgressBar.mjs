export const ProgressBar = function() {
  this._isAnimating = false
  this._container = document.getElementById('progress-bar-container')
  this._canvas = document.getElementById('progress-bar')
  const style = getComputedStyle(this._canvas)
  this._widthRatio = parseFloat(style.getPropertyValue('--width-ratio'))
  this._heightRatio = parseFloat(style.getPropertyValue('--height-ratio'))
  this._completeColor = style.getPropertyValue('--complete-bar-color')
  this._pendingColor = style.getPropertyValue('--pending-bar-color')
  this._ctx = this._canvas.getContext('2d')
  const observer = new ResizeObserver(entries => this._resizeCanvas(entries))
  observer.observe(document.body)
  this._progress = 0
  this._displayingProgress = false
  this._displayingCountdown = false
}

ProgressBar.prototype.setProgress = function(
  {
    progress,
  }
) {
  this._displayingProgress = true
  this._displayingCountdown = false
  this._progress = Math.min(progress, 1)
  this._draw()
}

ProgressBar.prototype.startCountdown = async function(
  {
    duration,
    headStart,
  }
) {
  this._displayingCountdown = true
  this._displayingProgress = false
  const launchTime = performance.now()
  while (true) {
    const t = await new Promise(r => window.requestAnimationFrame(r))
    if (!this._displayingCountdown) {
      break
    }
    const elapsedTime = (t - launchTime) / 1000
    this._progress = Math.min((headStart + elapsedTime) / duration, 1)
    this._draw()
  }
}

ProgressBar.prototype.stopCountdown = function() {
  this._displayingCountdown = false
}

ProgressBar.prototype.hide = function() {
  this._ctx.clearRect(0, 0, this._width, this._height)
  this._displayingCountdown = false
  this._displayingProgress = false
  this._progress = 0
}

ProgressBar.prototype._resizeCanvas = function(entries) {
  const {width, height} = entries[0].contentRect
  const cssWidth = Math.max(1, Math.round(this._widthRatio * width))
  const cssHeight = Math.max(1, Math.round(this._heightRatio * height))
  this._canvas.style.width = `${cssWidth}px`
  this._canvas.style.height = `${cssHeight}px`
  this._width = Math.max(1, Math.floor(cssWidth * window.devicePixelRatio))
  this._height = Math.max(1, Math.floor(cssHeight * window.devicePixelRatio))
  this._canvas.width = this._width
  this._canvas.height = this._height
  this._completeWidth = this._height
  this._pendingWidth = Math.max(1, Math.round(this._height / 3))
  if (this._displayingCountdown || this._displayingProgress) {
    this._draw()
  }
}

ProgressBar.prototype._draw = function() {
  this._ctx.clearRect(0, 0, this._width, this._height)
  this._drawPendingLine()
  this._drawCompletedLine()
}

ProgressBar.prototype._drawCompletedLine = function() {
  this._drawLine({
    start: 0,
    end: this._progress,
    width: this._completeWidth,
    color: this._completeColor,
  })
}

ProgressBar.prototype._drawPendingLine = function() {
  this._drawLine({
    start: this._progress,
    end: 1,
    width: this._pendingWidth,
    color: this._pendingColor,
  })
}

ProgressBar.prototype._drawLine = function(
  {
    start,
    end,
    width,
    color,
  }
) {
  const xOffset = this._completeWidth
  const xLength = this._width - 2 * xOffset
  const xStart = xOffset + start * xLength
  const xEnd = xOffset + end * xLength
  const xStartOff = xStart - width
  const xEndOff = xEnd + width
  const yHigh = this._height / 2 - width / 2
  const yMid = this._height / 2
  const yLow = this._height / 2 + width / 2
  this._ctx.fillStyle = color
  this._ctx.beginPath()
  this._ctx.moveTo(xStart, yHigh)
  this._ctx.lineTo(xEnd, yHigh)
  this._ctx.lineTo(xEndOff, yMid)
  this._ctx.lineTo(xEnd, yLow)
  this._ctx.lineTo(xStart, yLow)
  this._ctx.lineTo(xStartOff, yMid)
  this._ctx.closePath()
  this._ctx.fill()
}
