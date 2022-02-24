import * as Option from './types/Option.mjs'
import * as Outcome from './types/Outcome.mjs'
import * as Stamp from './types/Stamp.mjs'

export const MediaDisplay = function(
  {
    viewport,
  }
) {
  this._viewport = viewport
  this._mediaContainer = document.createElement('div')
  this._mediaContainer.classList.add('viewport-media-container')
  this._viewport.appendChild(this._mediaContainer)
  this._displayedMediaSource = Option.None()
  this._displayedMediaType = Option.None()
  this._displayedImage = document.createElement('img')
  this._displayedVideo = document.createElement('video')
  this._displayedVideo.controls = true
  this._displayedVideo.loop = true
  this._displayedVideo.muted = false
  this._loadedMediaSource = Option.None()
  this._loadedMediaType = Option.None()
  this._loadedImage = document.createElement('img')
  this._loadedVideo = document.createElement('video')
  this._loadedVideo.controls = true
  this._loadedVideo.loop = true
  this._loadedVideo.muted = false
  this._isLoading = false
  this._loadingStamp = Stamp.create()
  this._loadingMediaSource = Option.None()
  this._mediaLoadingOutcome = Option.None()
  this._terminationListeners = []
  this._terminated = false
}

MediaDisplay.prototype.terminate = function() {
  this._terminated = true
  this._terminationListeners.splice(0).forEach(resolver => resolver())
  this._mediaLoadingOutcome = null
  this._loadingMediaSource = null
  this._loadedMediaSource = null
  this._loadedImage.src = ''
  this._loadedImage = null
  this._loadedVideo.src = ''
  this._loadedVideo.load()
  this._loadedVideo = null
  this._loadedMediaType = null
  this._displayedMediaSource = null
  if (this._displayedMediaType.isSome()) {
    if (this._displayedMediaType.value() === 'image') {
      this._mediaContainer.removeChild(this._displayedImage)
    } else if (this._displayedMediaType.value() === 'video') {
      this._mediaContainer.removeChild(this._displayedVideo)
    }
  }
  this._displayedImage.src = ''
  this._displayedImage = null
  this._displayedVideo.src = ''
  this._displayedVideo.load()
  this._displayedVideo = null
  this._displayedMediaType = null
  this._viewport.removeChild(this._mediaContainer)
  this._mediaContainer = null
  this._viewport = null
}

MediaDisplay.prototype.displayLoadedMedia = async function() {
  if (this._loadedMediaType.isNone()) {
    return Outcome.Failure()
  }
  if (this._displayedMediaType.isSome()) {
    if (this._displayedMediaType.value() === 'image') {
      this._mediaContainer.removeChild(this._displayedImage)
    } else if (this._displayedMediaType.value() === 'video') {
      this._displayedVideo.pause()
      this._mediaContainer.removeChild(this._displayedVideo)
    }
  }
  ;[
    this._displayedMediaSource, this._displayedMediaType,
      this._displayedImage, this._displayedVideo,
    this._loadedMediaSource, this._loadedMediaType,
      this._loadedImage, this._loadedVideo,
  ] = [
    this._loadedMediaSource, this._loadedMediaType,
      this._loadedImage, this._loadedVideo,
    this._displayedMediaSource, this._displayedMediaType,
      this._displayedImage, this._displayedVideo,
  ]
  if (this._displayedMediaType.value() === 'image') {
    this._mediaContainer.appendChild(this._displayedImage)
  } else if (this._displayedMediaType.value() === 'video') {
    this._mediaContainer.appendChild(this._displayedVideo)
    this._displayedVideo.currentTime = 0
    let playbackFailed = false
    await this._displayedVideo.play().catch(() => playbackFailed = true)
    if (this._terminated) {
      return Outcome.Interrupted()
    }
    if (playbackFailed) {
      return Outcome.Failure()
    }
  }
  return Outcome.Success()
}

MediaDisplay.prototype.preload = async function(
  {
    source,
    mediaType,
  }
) {
  if (
    (this._isLoading && this._loadingMediaSource.value() !== source)
    || (!this._isLoading && this._loadedMediaSource.isNone())
    || (!this._isLoading && this._loadedMediaSource.value() !== source)
  ) {
    this._mediaLoadingOutcome = Option.Some(this._load({source, mediaType}))
  }
  return this._mediaLoadingOutcome.value()
}

MediaDisplay.prototype.isDisplayedMediaVideo = function() {
  return (
    this._displayedMediaType.isSome()
    && this._displayedMediaType.value() === 'video'
  )
}

MediaDisplay.prototype.getDisplayedMediaEventualDuration = function() {
  if (
    this._displayedMediaType.isSome()
    && this._displayedMediaType.value() === 'video'
    && this._displayedVideo.duration
  ) {
    return Option.Some(this._displayedVideo.duration)
  } else {
    return Option.None()
  }
}

MediaDisplay.prototype.listenForTimeUpdate = async function() {
  return new Promise(r => {
    const cb = () => {
      if (!this._terminated) {
        r(this._displayedVideo.currentTime)
      }
    }
    this._displayedVideo.addEventListener('timeupdate', cb, {once: true})
  })
}

MediaDisplay.prototype._load = async function(
  {
    source,
    mediaType,
  }
) {
  const stamp = this._loadingStamp.next()
  this._loadedMediaSource = Option.None()
  this._loadedMediaType = Option.None()
  this._loadedImage.src = ''
  this._loadedVideo.src = ''
  this._loadedVideo.load()
  this._isLoading = true
  this._loadingMediaSource = Option.Some(source)
  if (mediaType === 'image') {
    this._loadedImage.src = source
    this._loadedMediaType = Option.Some('image')
  } else if (mediaType === 'video') {
    const success = this._waitForLoadedVideoEvent('canplaythrough')
    const failure = this._waitForLoadedVideoEvent('error')
    const timeout = new Promise(r => setTimeout(r, 5000))
    this._loadedVideo.src = source
    const videoLoading = await Promise.race([
      success.then(() => Outcome.Success()),
      failure.then(() => Outcome.Failure()),
      timeout.then(() => Outcome.Failure()),
      this._listenForTermination(),
    ])
    if (!this._loadingStamp.is(stamp) || this._terminated) {
      return Outcome.Interrupted()
    }
    this._terminationListeners.splice(0)
    if (videoLoading.isFailure()) {
      this._isLoading = false
      this._loadedMediaSource = this._loadingMediaSource
      this._loadingMediaSource = Option.None()
      return Outcome.Failure()
    }
    this._loadedMediaType = Option.Some('video')
  }
  this._isLoading = false
  this._loadedMediaSource = this._loadingMediaSource
  this._loadingMediaSource = Option.None()
  return Outcome.Success()
}

MediaDisplay.prototype._waitForLoadedVideoEvent = function(event) {
  return new Promise(r => {
    const callback = () => {
      if (this._terminated) {
        return r()
      }
      this._loadedVideo.removeEventListener(event, callback)
      r()
    }
    this._loadedVideo.addEventListener(event, callback)
  })
}

MediaDisplay.prototype._listenForTermination = function() {
  return new Promise(r => this._terminationListeners.push(r))
}
