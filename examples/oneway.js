var ws = require('pull-ws')
var pull = require('pull-stream')
var sync = require('..')

function delay (ms) {
  return pull.asyncMap(function (data, cb) {
    setTimeout(function () { cb(null, data) }, ms)
  })
}

var server = ws.createServer(function (stream) {
  pull(
    pull.count(3),
    pull.map(String),
    pull.through(console.log),
    sync(stream)
  )
}).listen(5000)
  .on('listening', function () {
    ws.connect('ws://localhost:5000', function (err, stream) {
      if (err) throw err

      // Prints 0,0,1,1,2,2,3,3 regardless of the relative
      // speed of client and server and the transportation delay
      pull(
        sync(stream),
        pull.through(console.log),
        delay(500),
        pull.drain(null, function () { server.close() })
      )
    })
  })
