var toObject = require('./to-object')

function createSyncStream (stream) {
  var log = require('debug')('pull-sync')
  var syncStream = null
  var closed = false
  var _sink = null
  var source = null
  var buffer = []
  var __send = null
  var listeningOnStream = false

  if (typeof stream === 'function') {
    stream = toObject(stream)
  }

  function send (abort, data) {
    var send = null
    if (abort) {
      if (__send) {
        send = __send
        __send = null

        log('send aborting')
        send(abort)
      }

      return
    }

    if (arguments.length > 1) {
      log('queueing data: ' + data)
      buffer.push(data)
    }

    if (__send && buffer.length > 0) {
      send = __send
      __send = null

      data = buffer.shift()
      log('sending data: ' + data)
      send(null, data)
    } else {
      if (!__send) {
        log('stream did not request data yet, waiting')
      }
      if (buffer.length === 0) {
        log('no data to send yet, waiting')
      }
    }
    listenOnStream(null)
  }

  function sink (err, data) {
    var sink = _sink
    _sink = null

    if (sink) {
      if (err) return sink(err)

      log('sinking data: ' + data)
      sink(null, data)
    } else {
      if (!err) {
        throw new Error('received data without prior ask')
      }
    }
  }

  function close (abort, cb) {
    if (!closed) {
      closed = abort
      if (source) {
        source(abort, function () {})
      }
      listenOnStream(abort)
      send(abort)
      sink(abort)
      if (stream.hasOwnProperty('close') &&
        typeof stream.close === 'function') {
        stream.close()
      }
    }

    if (cb) cb(abort)
  }

  stream.sink(function (abort, _send) {
    log('stream requesting data')

    if (closed) return _send(closed)
    if (abort) return close(abort, _send)

    __send = _send
    send(null)
  })

  function next (err, data) {
    log('received event from source')

    if (closed) return
    if (err) return close(err)

    if (typeof data !== 'string') {
      throw new Error('Expected a string rather than ' + data)
    }

    log('received data from source, sending on stream')
    send(null, '0' + data)
  }

  function listenOnStream (abort) {
    if (listeningOnStream) return

    listeningOnStream = true
    if (abort) log('aborting stream')
    else log('listening on stream')

    stream.source(abort, function (err, data) {
      listeningOnStream = false

      log('received event from stream')

      if (closed) return
      if (err) return close(err)

      if (data[0] === '0') { // Received data
        log('received data from stream, sinking')
        sink(null, data.slice(1))
      } else if (data[0] === '1') { // Received ask
        log('received ask, reading from source')
        source(null, next)
      } else {
        throw new Error('Invalid data ' + data)
      }
    })
  }

  function listenOnSink (abort, cb) {
    log('sink asking for data')

    if (closed) return cb(closed)
    if (abort) return close(abort, cb)

    _sink = cb
    send(abort, '1')
  }

  syncStream = {
    'sink': function (read) {
      source = read

      log('waiting')
      listenOnStream(null)
    },
    'source': listenOnSink
  }

  // Pass on other properties of the stream
  for (var p in stream) {
    if (stream.hasOwnProperty(p) && !syncStream.hasOwnProperty(p)) {
      syncStream[p] = stream[p]
    }
  }

  return syncStream
}

module.exports = createSyncStream
