var ws = require('pull-ws')
var pull = require('pull-stream')
var sync = require('../src/')

function delay (ms) {
  return pull.asyncMap(function (data, cb) {
    setTimeout(function () { cb(null, data) }, ms)
  })
}

ws.connect('ws://localhost:8080', function (err, stream) {
  if (err) throw err

  stream = sync(stream)

  // Prints 0,0,1,2,2,4,3,6 regardless of the relative
  // speed of client and server and the transportation delay
  pull(
    pull.count(3),
    pull.map(String),
    pull.through(function (x) { console.log('sending: ' + x) }),
    stream,
    pull.through(function (x) { console.log('received: ' + x) }),
    delay(500),
    pull.drain()
  )
})
