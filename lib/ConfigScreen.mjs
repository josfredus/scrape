import * as Option from './types/Option.mjs'
import * as Outcome from './types/Outcome.mjs'

export const ConfigScreen = function() {
  this._container = document.getElementById('config-screen')
  this._input = document.getElementById('config-input')
  this._inputPadding = Option.None()
  this._input.addEventListener('input', () => {
    this._input.value = this._input.value.replace(/[\n\r]/g, '')
    if (this._inputPadding.isNone()) {
      const style = getComputedStyle(this._input)
      const paddingTop = parseFloat(style.getPropertyValue('padding-top'))
      const paddingBot = parseFloat(style.getPropertyValue('padding-bottom'))
      this._inputPadding = Option.Some(paddingTop + paddingBot)
    }
    this._input.style.height = 'auto'
    const height = this._input.scrollHeight - this._inputPadding.value()
    this._input.style.height = `${height}px`
  })
  this._input.placeholder = 'aww pics / me_irl --skip 5 --shuffle'
  this._errorPanel = document.getElementById('error-panel')
  this._helpPanel = document.getElementById('help-panel')
  this._methods = new Set(['hot', 'new', 'rising', 'top', 'controversial'])
  this._periodLessMethods = new Set(['hot', 'new', 'rising'])
  this._periods = new Set(['hour', 'day', 'week', 'month', 'year', 'all'])
}

ConfigScreen.prototype.show = function() {
  document.body.appendChild(this._container)
}

ConfigScreen.prototype.hide = function() {
  document.body.removeChild(this._container)
}

ConfigScreen.prototype.getConfig = async function() {
  await new Promise(r => setTimeout(r, 0)) // weird backspace into focus bug
  this._input.focus()
  await this._listenForEnter()
  this._input.blur()
  for (const line of this._errorPanel.children) {
    this._errorPanel.removeChild(line)
  }
  return this._parseConfig()
}

ConfigScreen.prototype.notifyBarrenSubreddits = function(barrenSubreddits) {
  for (const subreddit of barrenSubreddits) {
    this._addErrorLine(`r/${subreddit} yielded nothing`)
  }
}

ConfigScreen.prototype._listenForEnter = async function() {
  return new Promise(r => {
    const callback = event => {
      if (event.key === 'Enter') {
        window.removeEventListener('keydown', callback)
        r()
      }
    }
    window.addEventListener('keydown', callback)
  })
}

/* here are the commands:
subredditname > add sorting of subreddit with default sorting config
/ > create a new list of sortings
--shuffle, -sh > enable shuffle
--no-shuffle, -nsh > disable shuffle
--skip 8.15, -sk 8.15 > enable autoskip, default timer is 8.15 seconds
--no-skip, -nsk > disable autoskip
--reverse 13, -r 13 > enable reverse, start at roundIndex 12
--no-reverse, -nr > disable reverse
--hot, -h > set default sorting method to hot
--new, -n > set default sorting method to new
--rising, -rs > set default sorting method to rising
--top, -t >
  set default sorting method to top
  set default sorting period to all
--top period, -t period >
  set default sorting method to top
  set default sorting period to period
--controversial, --contro, -c >
  set default sorting method to controversial
  set default sorting period to all
--controversial period, --contro period, -c period >
  set default sorting method to controversial
  set default sorting period to period
subredditname(method, period),
subredditname (method, period),
subredditname (method,period),
subredditname(method),
subredditname (method) >
  add sorting of subreddit with sorting method and period (defaults to all)
*/

ConfigScreen.prototype._parseConfig = function() {
  const input = this._input.value
  const args = input.split(/\s+(?![^\(]*\))/)
  const listsOfSortings = []
  const currentSortingList = []
  let defaultMethod = 'hot'
  let defaultPeriod = ''
  let shuffle = true
  const autoskip = {enabled: false, timer: 10}
  const reverse = {enabled: false, startRound: 0}
  let argIndex = 0
  while (argIndex < args.length) {
    const arg = args[argIndex]
    if (arg === '--shuffle' || arg === '-sh') {
      shuffle = true
    } else if (arg === '--no-shuffle' || arg === '-nsh') {
      shuffle = false
    } else if (arg === '--skip' || arg === '-sk') {
      let defaultTimer = Option.None()
      if (argIndex + 1 < args.length) {
        const nextArg = args[argIndex + 1]
        if (/^(?:\d*[,.])?\d+$/.test(nextArg)) {
          defaultTimer = Option.Some(parseFloat(nextArg))
          argIndex += 1
        }
      }
      autoskip.enabled = true
      autoskip.timer = defaultTimer.valueOrElse(10)
    } else if (arg === '--no-skip' || arg === '-nsk') {
      autoskip.enabled = false
      autoskip.timer = 10
    } else if (arg === '--reverse' || arg === '-r') {
      let startRound = Option.None()
      if (argIndex + 1 < args.length) {
        const nextArg = args[argIndex + 1]
        if (/^\d+$/.test(nextArg)) {
          const n = Math.max(1, Math.min(100, parseInt(nextArg)))
          startRound = Option.Some(n - 1)
          argIndex += 1
        }
      }
      reverse.enabled = true
      reverse.startRound = startRound.valueOrElse(4)
    } else if (arg === '--no-reverse' || arg === 'nr') {
      reverse.enabled = false
      reverse.startRound = 0
    } else if (arg === '--hot' || arg === '-h') {
      defaultMethod = 'hot'
      defaultPeriod = ''
    } else if (arg === '--new' || arg === '-n') {
      defaultMethod = 'new'
      defaultPeriod = ''
    } else if (arg === '--rising' || arg === '-rs') {
      defaultMethod = 'rising'
      defaultPeriod = ''
    } else if (
      arg === '--top' || arg === '-t' || arg === '--controversial'
      || arg === '--contro' || arg === '-c'
    ) {
      let period = Option.None()
      if (argIndex + 1 < args.length) {
        const nextArg = args[argIndex + 1]
        if (this._periods.has(nextArg)) {
          period = Option.Some(nextArg)
          argIndex += 1
        }
      }
      defaultMethod = arg === '--top' || arg === '-t' ? 'top' : 'controversial'
      defaultPeriod = period.valueOrElse('all')
    } else if (/^\w+(?:\([\w\s,]*\))?$/.test(arg)) {
      const subreddit = arg.match(/^\w+\b/)[0]
      let method = Option.None()
      let period = Option.None()
      if (/^\w+\([\w\s,]*\)$/.test(arg)) {
        const inside = arg.match(/(?<=\()[\w\s,]*(?=\))/)[0]
        const parsing = this._parseSorting(inside)
        if (parsing.isSuccess()) {
          method = parsing.result().method
          period = parsing.result().period
        }
      }
      if (method.isNone() && argIndex + 1 < args.length) {
        const nextArg = args[argIndex + 1]
        if (/^\([\w\s,]*\)$/.test(nextArg)) {
          const inside = nextArg.match(/(?<=\()[\w\s,]*(?=\))/)[0]
          const parsingAgain = this._parseSorting(inside)
          if (parsingAgain.isSuccess()) {
            method = parsingAgain.result().method
            period = parsingAgain.result().period
            argIndex += 1
          }
        }
      }
      currentSortingList.push({subreddit, method, period})
    } else if (arg === '/') {
      if (currentSortingList.length > 0) {
        listsOfSortings.push(currentSortingList.splice(0))
      }
    } else if (arg !== '') {
      this._addErrorLine(`invalid argument: ${arg}`)
    }
    argIndex += 1
  }
  if (currentSortingList.length > 0) {
    listsOfSortings.push(currentSortingList.splice(0))
  }
  for (const sortingList of listsOfSortings) {
    for (const sorting of sortingList) {
      sorting.method = sorting.method.valueOrElse(defaultMethod)
      sorting.period = sorting.period.valueOrElse(defaultPeriod)
    }
  }
  if (listsOfSortings.length === 0) {
    this._addErrorLine('didn\'t input any subreddit')
  }
  return {
    listsOfSortings,
    preFetchingDepth: 5,
    shuffle,
    autoskip,
    reverse,
  }
}

ConfigScreen.prototype._parseSorting = function(inside) {
  let method = Option.None()
  let period = Option.None()
  if (/^\s*\w+\s*$/.test(inside) && this._methods.has(inside.trim())) {
    method = Option.Some(inside.trim())
  } else if (/^\s*\w+\s*,\s*\w+\s*$/.test(inside)) {
    const match = inside.match(/^\s*(\w+)\s*,\s*(\w+)\s*$/)
    if (this._methods.has(match[1])) {
      method = Option.Some(match[1])
      if (!this._periodLessMethods.has(match[1])) {
        if (this._periods.has(match[2])) {
          period = Option.Some(match[2])
        } else {
          period = Option.Some('all')
        }
      }
    }
  }
  if (method.isSome()) {
    if (this._periodLessMethods.has(method.value())) {
      period = Option.Some('')
    }
    return Outcome.Success({method, period})
  } else {
    return Outcome.Failure()
  }
}

ConfigScreen.prototype._addErrorLine = function(text) {
  const line = document.createElement('div')
  line.innerHTML = text
  this._errorPanel.appendChild(line)
}
