import * as Outcome from './lib/types/Outcome.mjs'

import {ConfigScreen} from './lib/ConfigScreen.mjs'
import {ProgressBar} from './lib/ProgressBar.mjs'
import {SubredditValidator} from './lib/SubredditValidator.mjs'
import {ExhibitionDirector} from './lib/ExhibitionDirector.mjs'

;(async () => {

await new Promise(r => document.addEventListener('DOMContentLoaded', r))

const listenForEscape = () => new Promise(r => {
  const callback = event => {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      window.removeEventListener('keydown', callback)
      r({validating: Outcome.Interrupted()})
    }
  }
  window.addEventListener('keydown', callback)
})

const configScreen = new ConfigScreen()
const progressBar = new ProgressBar()
const validator = new SubredditValidator()
const exhibitionViewport = document.getElementById('exhibition-viewport')
document.body.removeChild(exhibitionViewport)

while (true) {
  const config = await configScreen.getConfig()
  const {validating, barrenSubreddits} = await Promise.race([
    validator.validate({
      listsOfSortings: config.listsOfSortings,
      progressBar,
    }),
    listenForEscape(),
  ])
  if (validating.isSuccess()) {
    configScreen.hide()
    configScreen.notifyBarrenSubreddits(barrenSubreddits)
    document.body.appendChild(exhibitionViewport)
    const director = new ExhibitionDirector({
      listsOfSortings: validating.result(),
      scraperStash: validator.getScraperStash(),
      config,
      progressBar,
      viewport: exhibitionViewport,
    })
    director.run()
    await listenForEscape()
    director.terminate()
    document.body.removeChild(exhibitionViewport)
    configScreen.show()
  } else if (validating.isFailure()) {
    configScreen.notifyBarrenSubreddits(barrenSubreddits)
    progressBar.hide()
  } else if (validating.isInterrupted()) {
    validator.cancel()
    progressBar.hide()
  }
}

})()
