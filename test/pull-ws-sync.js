var tape = require('tape')
var ws = require('pull-ws')
var debug = require('debug')
var sync = require('../src')
var pull = require('pull-stream')

tape('synchronized duplex pull-ws', function (t) {
  var expected = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C']
  var actual = []
  var serverLog = debug('server')
  var clientLog = debug('client')

  var values = ['A', 'B', 'C']

  var server = ws.createServer(function (stream) {
    stream = sync(stream)
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
          stream = sync(stream)
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
              // The stream closes automatically once there are
              // no values anymore
              // pull.take(3),
              pull.collect(function (err, _values) {
                clientLog(_values)
                t.equal(err, null)
                t.deepEqual(_values, values)
                t.deepEqual(actual, expected)
                t.end()
                server.close()
              })
            )
          }, 200)
        }})
    })
})

tape('synchronized half-duplex pull-ws', function (t) {
  var serverLog = debug('server')
  var clientLog = debug('client')

  var actual = []
  var expected = ['0', '0', '1', '1', '2', '2', '3', '3', '4', '4']

  var server = ws.createServer(function (stream) {
    serverLog('server connected')
    pull(
      sync(stream),
      pull.through(function (x) { serverLog('received ' + x) }),
      pull.take(5),
      pull.through(function (x) { actual.push(x) }),
      pull.drain(null, function () {
        t.end()
        t.deepEqual(actual, expected)
        server.close()
      })
    )
  }).listen(5000)
    .on('listening', function () {
      ws.connect('ws://localhost:5000', {
        onConnect: function (err, stream) {
          clientLog('client connected')
          t.equal(err, null)

          pull(
            pull.count(),
            pull.through(function (x) { clientLog('sending ' + x) }),
            pull.map(String),
            pull.through(function (x) { actual.push(x) }),
            sync(stream)
          )
        }})
    })
})
