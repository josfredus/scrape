import {EventDirector} from './lib/EventDirector.mjs'

(async () => {

const events = new EventDirector([
  'entry-submit',
  'entry-input',
  'loading-success',
  'loading-error',
  'terminate-exhibition',
])

events.connectEvent({
  destinationEvent: 'entry-submit',
  baseEventTarget: window,
  baseEventName: 'keydown',
  conditionnal: event => ['a', 'A'].includes(event.key),
})

events.connectEvent({
  destinationEvent: 'entry-input',
  baseEventTarget: window,
  baseEventName: 'keydown',
  conditionnal: event => ['z', 'Z'].includes(event.key),
})

events.connectEvent({
  destinationEvent: 'loading-success',
  baseEventTarget: window,
  baseEventName: 'keydown',
  conditionnal: event => ['e', 'E'].includes(event.key),
})

events.connectEvent({
  destinationEvent: 'loading-error',
  baseEventTarget: window,
  baseEventName: 'keydown',
  conditionnal: event => ['r', 'R'].includes(event.key),
})

events.connectEvent({
  destinationEvent: 'terminate-exhibition',
  baseEventTarget: window,
  baseEventName: 'keydown',
  conditionnal: event => ['t', 'T'].includes(event.key),
})

while (true) {
  await events.waitFor({relevantEvents: ['entry-submit']})
  console.log('entry submitted')
  switch (
    await events.waitFor({relevantEvents: [
      'entry-input',
      'loading-success',
      'loading-error',
    ]})
  ) {
  case 'entry-input':
    console.log('input detected before loading completion')
    break;
  case 'loading-success':
    console.log('loaded successfully')
    await events.waitFor({relevantEvents: ['terminate-exhibition']})
    console.log('asked to go back to entry state')
    break;
  case 'loading-error':
    console.log('failed to load')
    break;
  }
}

events.disconnectEvents()

})()

/*

main algorithm:
build up entry ui
while true
  wait for entry
  start progress indicator (make it faux-finite with request timeout limit max)
  create loaders for entry
  wait for first media to be loadable or input on entry
  if input on entry occurs before loading ends
    cancel loaders
    do cancel animation for loading progress indicator and terminate it
    loop over
  if we have a first media to load
    terminate entry ui (remember entry line)
    do success animation for loading progress indicator
    build up exhibition ui
    launch exhibition (morph loading progress indicator into timer indicator)
    wait for go-back signal (it's not the exhibition's concern to detect that)
    terminate exhibition and exhibition ui
    build up entry ui (recover entry line)
  otherwise
    do failure animation for loading progress indicator and terminate it
    notify failure to user in ui
  loop over

application flow:
start -> entry state -A-> loading state -B-> exhibition state
.         <--------------C-------
.         <----------------------------D-------------
A: entry entered from entry ui
B: first media succesfully loaded
C: entry changed in entry ui (not necessarily entered)
D: go-back event (backspace or escape key for example)

*/
