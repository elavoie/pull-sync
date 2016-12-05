var ws = require('pull-ws')
var pull = require('pull-stream')
var sync = require('../src/')

function delay (ms) {
  return pull.asyncMap(function (data, cb) {
    setTimeout(function () { cb(null, data) }, ms)
  })
}

var server = ws.createServer(function (stream) {
  stream = sync(stream)
  pull(
    stream,
    pull.map(function (x) {
      return Number.parseInt(x) * 2
    }),
    pull.map(String),
    stream
  )
}).listen(5000)
  .on('listening', function () {
    ws.connect('ws://localhost:5000', function (err, stream) {
      if (err) throw err

      stream = sync(stream)

      // Prints 0,0,1,2,2,4,3,6 regardless of the relative
      // speed of client and server and the transportation delay
      pull(
        pull.count(3),
        pull.map(String),
        pull.through(console.log),
        stream,
        pull.through(console.log),
        delay(500),
        pull.drain(null, function () { server.close() })
      )
    })
  })
