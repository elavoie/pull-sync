var tape = require('tape')
var ws = require('pull-ws')
var debug = require('debug')
var pull = require('pull-stream')

tape('default unsynchronized pull-ws', function (t) {
  var expected = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']
  var actual = []
  var serverLog = debug('server')
  var clientLog = debug('client')

  var values = ['A', 'B', 'C']

  var server = ws.createServer(function (stream) {
    serverLog('server connected')
    setTimeout(function () {
      pull(
        stream,
        pull.through(function (x) { serverLog('received ' + x) }),
        pull.through(function (x) { actual.push(x) }),
        pull.through(function (x) { serverLog('sending ' + x) }),
        stream
      )
    }, 100)
  }).listen(5000)
    .on('listening', function () {
      ws.connect('ws://localhost:5000', {
        closeOnEnd: false,
        onConnect: function (err, stream) {
          clientLog('client connected')
          t.equal(err, null)

          pull(
            pull.values(values),
            pull.through(function (x) { clientLog('sending ' + x) }),
            pull.through(function (x) { actual.push(x) }),
            stream
          )

          setTimeout(function () {
            pull(
              stream,
              pull.through(function (x) { clientLog('received ' + x) }),
              pull.through(function (x) { actual.push(x) }),
              // We need to explicitly close after reading 3 values
              // because otherwise the stream never sends the close
              // signal, so we use the take(3) through stream
              pull.take(3),
              pull.collect(function (err, _values) {
                clientLog(_values)
                t.equal(err, null)
                t.deepEqual(_values, values)
                t.deepEqual(actual, expected)
                t.end()
                server.close()
                stream.close()
              })
            )
          }, 200)
        }})
    })
})
