var tape = require('tape')
var sync = require('../src')
var pull = require('pull-stream')
var queue = require('pull-eager-buffer')
var toObject = require('pull-stream-function-to-object')
var debug = require('debug')
var log = debug('test')

tape('through transparency', function (t) {
  var values = ['A', 'B', 'C']
  pull(
    pull.values(values),
    sync(pull.through()),
    pull.collect(function (err, result) {
      if (err) throw err
      t.deepEqual(result, values)
      t.end()
    })
  )
})

tape('synchronization through an eager queue', function (t) {
  var values = ['A', 'B', 'C']
  var withoutSync = ['A', 'B', 'C', 'A', 'B', 'C']
  var withSync = ['A', 'A', 'B', 'B', 'C', 'C']
  var actualWithoutSync = []
  var actualWithSync = []
  pull(
    pull.values(values),
    pull.through(function (x) { actualWithoutSync.push(x) }),
    queue(),
    pull.through(function (x) { actualWithoutSync.push(x) }),
    pull.through(function (x) { actualWithSync.push(x) }),
    sync(queue()),
    pull.through(function (x) { actualWithSync.push(x) }),
    pull.collect(function (err, _values) {
      if (err) throw err
      t.deepEqual(_values, values)
      t.deepEqual(actualWithoutSync, withoutSync)
      t.deepEqual(actualWithSync, withSync)
      t.end()
    })
  )
})

function channel () {
  var _cb = null
  var buffer = []
  var ended = false

  function channel (abort, value) {
    if (arguments.length >= 1) {
      if (abort) {
        ended = true
      }
      buffer.push([abort, value])
    }

    if (_cb && buffer.length > 0) {
      var cb = _cb
      _cb = null
      var call = buffer.shift()
      cb(call[0], call[1])
    }

    if (!_cb && buffer.length === 0 && ended) {
      channel.closed = true
    }
  }

  channel.setCb = function (cb) {
    if (channel.closed) cb(channel.closed)
    else if (!cb) channel.closed = true
    else _cb = cb
  }

  channel.closed = false

  return channel
}

function setup (t, stream, syncStream) {
  var streamSink = channel()
  var syncStreamSink = channel()

  stream.sink(function (abort, cb) {
    if (abort) {
      streamSink.closed = true
      log('stream.sink(' + abort + ',' + (typeof cb) + ')')
      cb(abort)
      return
    }
    streamSink.setCb(cb)
  })
  syncStream.sink(function (abort, cb) {
    if (abort) {
      syncStreamSink.closed = true
      log('syncStream.sink(' + abort + ',' + (typeof cb) + ')')
      cb(abort)
      return
    }
    syncStreamSink.setCb(cb)
  })

  return {
    source: {
      stream: stream.source,
      syncStream: syncStream.source
    },
    sink: {
      stream: streamSink,
      syncStream: syncStreamSink
    }
  }
}

function duplex () {
  var link1 = toObject(pull.through(function (x) { log('duplex a->b: ' + x) }))
  var link2 = toObject(pull.through(function (x) { log('duplex b->a: ' + x) }))

  return {
    A: {
      sink: link1.sink,
      source: function (abort, cb) {
        if (abort) {
          log('duplex A.source(' + abort + '), closing other link')
          link1.source(abort, function () {})
        }
        link2.source(abort, cb)
      }
    },
    B: {
      sink: link2.sink,
      source: function (abort, cb) {
        if (abort) {
          log('duplex B.source(' + abort + '), closing other link')
          link2.source(abort, function () {})
        }
        link1.source(abort, cb)
      }
    }
  }
}

tape('Property 1', function (t) {
  function expect (err, value, cb) {
    return function (_err, _value) {
      if (err) t.true(_err)
      else t.equal(_value, value)

      if (cb) cb()
    }
  }

  log('Closing the stream from the sink')
  var side = duplex()
  var syncStream = sync(side.A)
  var s = setup(t, side.B, syncStream)

  t.false(s.sink.stream.closed)
  t.false(s.sink.syncStream.closed)
  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.sink.stream(true) // close stream
  t.true(s.sink.stream.closed)
  t.true(s.sink.syncStream.closed)
  s.source.syncStream(null, expect(true))

  log('Closing the stream from the source')
  side = duplex()
  syncStream = sync(side.A)
  s = setup(t, side.B, syncStream)

  t.false(s.sink.stream.closed)
  t.false(s.sink.syncStream.closed)
  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.source.stream(true, expect(true)) // close stream
  t.true(s.sink.stream.closed)
  t.true(s.sink.syncStream.closed)
  s.source.syncStream(null, expect(true))

  t.end()
})

tape('Property 2', function (t) {
  var through = pull.through()
  through.foo = function () { return 'foo' }
  var syncThrough = sync(through)

  t.equal(syncThrough.foo(), 'foo')
  t.end()
})

tape('Property 3', function (t) {
  var pending = 0
  function expect (err, value, cb) {
    pending++
    return function (_err, _value) {
      pending--
      if (err) t.true(_err)
      else t.equal(_value, value)

      if (cb) cb()
    }
  }

  var side = duplex()
  var syncStream = sync(side.A)
  var s = setup(t, side.B, syncStream)

  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.source.syncStream(null, expect(null, 'hello'))
  s.source.stream(null, expect(null, '2'))
  s.sink.stream(null, '0' + JSON.stringify('hello'))

  s.sink.stream(null, '2')
  s.sink.syncStream(null, 'hello2')
  s.source.stream(null, expect(null, '0' + JSON.stringify('hello2')))

  s.source.syncStream(true, expect(true))
  s.source.stream(null, expect(null, '3'))
  s.sink.stream(null, '1' + JSON.stringify(true))

  // Read abort
  side = duplex()
  syncStream = sync(side.A)
  s = setup(t, side.B, syncStream)

  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.sink.stream(null, '2')
  s.sink.syncStream(true)
  s.source.stream(null, expect(null, '1' + JSON.stringify(true)))

  // Read error with error object

  side = duplex()
  syncStream = sync(side.A)
  s = setup(t, side.B, syncStream)

  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.sink.stream(null, '2')
  s.sink.syncStream(new Error('error'))
  s.source.stream(null, expect(null, '1' + JSON.stringify('error')))

  t.equal(pending, 0)
  t.end()
})

tape('Property 4', function (t) {
  var pending = 0
  function expect (err, value, cb) {
    pending++
    return function (_err, _value) {
      pending--
      if (err) t.true(_err)
      else t.equal(_value, value)

      if (cb) cb()
    }
  }

  // syncStream.source:cb
  var side = duplex()
  var syncStream = sync(side.A)
  var s = setup(t, side.B, syncStream)

  s.source.syncStream(null, expect(null, 'hello'))
  s.sink.stream(null, '0' + JSON.stringify('hello'))

  s.source.syncStream(null, expect(true))
  s.sink.stream(null, '1' + JSON.stringify(true))

  // syncStream.sink:read
  side = duplex()
  syncStream = sync(side.A)
  s = setup(t, side.B, syncStream)

  s.source.stream(null, expect(null, '5 pull-sync: missing sync'))
  s.source.stream(null, expect(null, '4'))

  s.sink.stream(null, '2')
  s.sink.syncStream(null, 'hello')
  s.source.stream(null, expect(null, '0' + JSON.stringify('hello')))
  t.false(s.sink.syncStream.closed)

  s.sink.stream(null, '3')
  s.sink.syncStream(null, 'hello')
  s.source.stream(null, expect(null, '1' + JSON.stringify(true)))
  t.true(s.sink.syncStream.closed)

  // Actions for message '4' and '5' are unobservable

  t.equal(pending, 0)
  t.end()
})

// Property 5 is unprovable using tests

tape('Transparency through an echo duplex channel', function (t) {
  var side = duplex()
  var syncStream1 = sync(side.A)
  var syncStream2 = sync(side.B)

  var values = ['A', 'B', 'C']

  pull(syncStream2, syncStream2)

  pull(
    pull.values(values),
    syncStream1,
    pull.collect(function (err, results) {
      t.false(err)
      t.deepEqual(results, values)
      t.end()
    })
  )
})
