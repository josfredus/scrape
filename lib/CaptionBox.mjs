export const CaptionBox = function(
  {
    viewport,
  }
) {
  this._viewport = viewport
  this._box = document.createElement('div')
  this._box.classList.add('caption-box')
  this._viewport.appendChild(this._box)
  this._place = document.createElement('div')
  this._place.classList.add('caption-place')
  this._box.appendChild(this._place)
  this._author = document.createElement('div')
  this._author.classList.add('caption-author')
  this._box.appendChild(this._author)
  this._subreddit = document.createElement('div')
  this._subreddit.classList.add('caption-subreddit')
  this._box.appendChild(this._subreddit)
  this._date = document.createElement('div')
  this._date.classList.add('caption-date')
  this._box.appendChild(this._date)
  this._appreciation = document.createElement('div')
  this._appreciation.classList.add('caption-appreciation')
  this._box.appendChild(this._appreciation)
  this._time = document.createElement('div')
  this._time.classList.add('caption-time')
  this._title = document.createElement('div')
  this._title.classList.add('title-box')
  this._boxIsHidden = false
  this._titleIsHidden = true
  this._timeUpdateStopCommandListeners = []
  this._terminationListeners = []
  this._terminated = false
}

CaptionBox.prototype.set = function(
  {
    article,
    roundNumber,
    roundSize,
    indexInRound,
  }
) {
  const titleLink = this._createLink({
    href: article.permalink,
    text: article.title,
  })
  this._title.innerHTML = titleLink
  const placeText = roundSize > 1 ? ` (${indexInRound + 1}/${roundSize})` : ``
  this._place.innerHTML = `#${roundNumber + 1}${placeText}`
  const authorLink = this._createLink({
    href: `https://www.reddit.com/user/${article.author}`,
    text: `/u/${article.author}`,
  })
  const flairText = article.flair ? `<br>${article.flair}` : ``
  this._author.innerHTML = `by ${authorLink}${flairText}`
  const subredditLink = this._createLink({
    href: `https://www.reddit.com/r/${article.subreddit}`,
    text: `r/${article.subreddit}`,
  })
  this._subreddit.innerHTML = `on ${subredditLink}`
  const dateText = this._createDateText(article.date)
  this._date.innerHTML = `${dateText}`
  const upvotesText = `❤${article.upvotes.toLocaleString('en-US')}`
  const awardsText = article.awards.isNone() ? ``
    : ` 🏆${article.awards.value().toLocaleString('en-US')}`
  this._appreciation.innerHTML = `${upvotesText}${awardsText}`
}

CaptionBox.prototype.run = async function() {
  const handlerByAction = new Map()
  handlerByAction.set('show-title', () => this._showTitle())
  handlerByAction.set('hide-all', () => this._hideAll())
  handlerByAction.set('show-box', () => this._showBox())
  while (true) {
    const action = await Promise.race([
      this._listenForAction(),
      this._listenForTermination(),
    ])
    if (this._terminated) {
      break
    }
    this._terminationListeners.splice(0)
    const handler = handlerByAction.get(action)
    handler()
  }
}

CaptionBox.prototype.terminate = function() {
  this._timeUpdateStopCommandListeners.splice(0)
  if (this._time.parentNode) {
    this._box.removeChild(this._time)
  }
  this._time = null
  this._box.removeChild(this._appreciation)
  this._appreciation = null
  this._box.removeChild(this._subreddit)
  this._subreddit = null
  this._box.removeChild(this._date)
  this._date = null
  this._box.removeChild(this._author)
  this._author = null
  this._box.removeChild(this._place)
  this._place = null
  if (!this._boxIsHidden) {
    this._viewport.removeChild(this._box)
  }
  this._box = null
  if (!this._titleIsHidden) {
    this._viewport.removeChild(this._title)
  }
  this._title = null
  this._viewport = null
  this._terminated = true
  this._terminationListeners.splice(0).forEach(resolver => resolver())
}

CaptionBox.prototype.listenForVideoTimeUpdate = async function({mediaDisplay}) {
  const format = seconds => {
    const n = Math.round(seconds)
    const s = `${n % 60}`.padStart(2, '0')
    const m = `${Math.floor(n / 60)}`
    return `${m}:${s}`
  }
  const duration = mediaDisplay.getDisplayedMediaEventualDuration().value()
  this._time.innerHTML = `0:00 / ${format(duration)}`
  this._box.appendChild(this._time)
  while (true) {
    let stopListening = false
    const stopCommand = new Promise(r => {
      this._timeUpdateStopCommandListeners.push(r)
    })
    const currentTime = await Promise.race([
      mediaDisplay.listenForTimeUpdate(),
      stopCommand.then(() => stopListening = true),
      this._listenForTermination(),
    ])
    if (this._terminated || stopListening) {
      break
    }
    this._timeUpdateStopCommandListeners.splice(0)
    this._time.innerHTML = `${format(currentTime)} / ${format(duration)}`
  }
}

CaptionBox.prototype.stopTimeUpdate = function() {
  if (this._time.parentNode) {
    this._box.removeChild(this._time)
  }
  this._timeUpdateStopCommandListeners.splice(0).forEach(resolver => resolver())
}

CaptionBox.prototype._listenForAction = async function() {
  return new Promise(r => {
    const callback = event => {
      if (this._terminated) {
        window.removeEventListener('keydown', callback)
        return r()
      }
      if (event.key === 'Enter') {
        window.removeEventListener('keydown', callback)
        if (this._titleIsHidden && !this._boxIsHidden) {
          r('show-title')
        } else if (!this._titleIsHidden && !this._boxIsHidden) {
          r('hide-all')
        } else if (this._titleIsHidden && this._boxIsHidden) {
          r('show-box')
        }
      }
    }
    window.addEventListener('keydown', callback)
  })
}

CaptionBox.prototype._listenForTermination = async function() {
  return new Promise(r => this._terminationListeners.push(r))
}

CaptionBox.prototype._showTitle = function() {
  this._viewport.appendChild(this._title)
  this._titleIsHidden = false
}

CaptionBox.prototype._hideAll = function() {
  this._viewport.removeChild(this._title)
  this._viewport.removeChild(this._box)
  this._titleIsHidden = true
  this._boxIsHidden = true
}

CaptionBox.prototype._showBox = function() {
  this._viewport.appendChild(this._box)
  this._boxIsHidden = false
}

CaptionBox.prototype._createLink = function(
  {
    href,
    text,
  }
) {
  return `<a target="_blank" href="${href}">${text}</a>`
}

CaptionBox.prototype._createDateText = function(birthday) {
  const now = new Date(Date.now())
  const minutes = (now - birthday) / 60000
  const hours = minutes / 60
  const midnight = now
    - now.getHours() * 60 * 60 * 1000
    - now.getMinutes() * 60 * 1000
    - now.getSeconds() * 1000
    - now.getMilliseconds()
  const days = Math.ceil((midnight - birthday) / 1000 / 3600 / 24);
  if (minutes < 1) {
    return `just now`
  } else if (minutes < 60) {
    return `${Math.round(minutes)} minute${minutes >= 1.5 ? 's' : ''} ago`
  } else if (hours < 24) {
    return `${Math.round(hours)} hour${hours >= 1.5 ? 's' : ''} ago`
  } else if (days <= 1) {
    return `yesterday`
  } else if (days <= 31) {
    return `${days} days ago`
  } else {
    const year = birthday.getFullYear()
    const month = `${birthday.getMonth() + 1}`.padStart(2, '0')
    const day = `${birthday.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
