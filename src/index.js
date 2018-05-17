var toObject = require('pull-stream-function-to-object')

module.exports = function (stream) {
  var log = require('debug')('pull-sync')
  var syncStream = null
  var read = null
  var remoteConnected = false // connection established
  var remoteReady = false // remote is ready to send values
  var remoteEnded = false // remote has no more values
  var ready = false // we are ready so send values
  var ended = false // we have no more values
  var closed = false // we can close the stream
  var listening = false // we have started listening for messages

  var sinkReadCbValuePrefix = '0'
  var sinkReadCbErrPrefix = '1'
  var sourceValueAsk = '2'
  var sourceAbort = '3'
  var sinkReadAssigned = '4'
  var initMsg = '5 pull-sync: missing sync'

  if (typeof stream === 'function') {
    stream = toObject(stream)
  }

  // An output needs both values/errors
  // and a callback to output but
  // each are supplied from a different source.
  // The output here provides a convenient synchronization
  // abstraction.
  function createOutput () {
    var buffer = []
    var _cb

    // Interface:
    //
    // output(): drain remaining values
    // output(err, value): stores value to send
    // output.setCb(cb): set the next callback
    //
    function output (err, value) {
      // Buffer err and value for
      // sending in case we do not have
      // a callback yet
      if (arguments.length >= 1) {
        buffer.push([err, value])
      }

      // We have something to output
      // and a callback, do it
      if (_cb && buffer.length > 0) {
        var cb = _cb
        _cb = null
        var call = buffer.shift()
        cb(call[0], call[1])
      }
    }

    output.setCb = function (cb) {
      _cb = cb
    }

    return output
  }

  var output = createOutput()
  var send = createOutput()

  // First, send the initialization message
  send(null, initMsg)

  function next (err, value) {
    if (err) {
      ended = err
      var suffix = JSON.stringify(err.message || err)
      send(null, sinkReadCbErrPrefix + suffix)
    } else {
      send(null, sinkReadCbValuePrefix + JSON.stringify(value))
    }
    drain()
  }

  function parse (msg) {
    if (msg instanceof Buffer) {
      msg = msg.toString()
    }

    if (msg[0] === sinkReadCbValuePrefix) {
      output(null, JSON.parse(msg.slice(1)))
    } else if (msg[0] === sinkReadCbErrPrefix) {
      remoteEnded = JSON.parse(msg.slice(1))
      if ((typeof remoteEnded) === 'string') {
        output(new Error('Remote error: ' + remoteEnded))
      } else {
        output(remoteEnded)
      }
    } else if (msg[0] === sourceAbort) {
      read(true, next)
    } else if (msg[0] === sourceValueAsk) {
      read(null, next)
    } else if (msg[0] === sinkReadAssigned) {
      log('remoteReady')
      remoteReady = true
    } else if (msg === initMsg) {
      log('remoteConnected')
      remoteConnected = true
    } else {
      log('Ignoring invalid message: ' + msg)
    }
  }

  function drain () {
    send()
    output()
    if (remoteConnected) {
      var done = true
      if (remoteReady) {
        done = done && remoteEnded
      }
      if (ready) {
        done = done && ended
      }

      if (remoteReady || ready) {
        if (done) log('drain(): closing')
        closed = done
      }
    }
  }

  // Prop 1
  stream.sink(function (abort, cb) {
    if (abort) {
      log('stream.sink(' + abort + ')')
      if (read) {
        log('syncStream.sink:read(' + abort + ')')
        read(abort, function (err) {
          log('syncStream.sink:read:cb(' + err + ')')
          output(closed = err)
          cb(err)
        })
      } else {
        output(closed = abort)
        cb(closed)
      }
      return
    }

    send.setCb(cb)
    drain()
  })

  function listen () {
    function next (err, msg) {
      if (err) {
        log('stream.source:cb(' + err + ')')
        if (read) {
          log('syncStream.sink:read(' + err + ')')
          read(err, function (err) {
            log('syncStream.sink:read:cb(' + err + ')')
            output(closed = err)
            drain()
          })
        } else {
          output(closed = err)
          drain()
        }
        return
      }

      parse(msg)
      drain()
      stream.source(closed, next)
    }
    stream.source(closed, next)
  }

  syncStream = {
    sink: function (_read) {
      ready = read = _read
      send(closed, sinkReadAssigned)
      if (!listening) {
        listening = true
        listen()
      }
    },
    source: function (abort, cb) {
      if (closed) {
        log('syncStream.source(' + abort + ',' + (typeof cb) + ')')
        cb(closed)
        drain()
        return
      }

      if (!listening) {
        listening = true
        listen()
      }

      output.setCb(cb)
      if (abort) send(null, sourceAbort)
      else send(null, sourceValueAsk)
      drain()
    }
  }

  // Pass on other properties of the stream
  for (var p in stream) {
    if (stream.hasOwnProperty(p) &&
      (typeof stream[p]) === 'function' &&
      !syncStream.hasOwnProperty(p)) {
      syncStream[p] = stream[p].bind(stream)
    }
  }

  return syncStream
}
