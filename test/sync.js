var tape = require('tape')
var sync = require('../src')
var pull = require('pull-stream')
var toObject = require('../src/to-object')
var debug = require('debug')

// Eager queue that reads (enqueue) as much data
// as possible before dequeuing
function queue () {
  var log = debug('queue')
  log('creating eager queue')
  var buffer = []
  var closed = false
  var _cb = null

  function dequeue () {
    if (_cb && buffer.length < 1 && closed) {
      log('closing')
      return _cb(buffer.length < 1 && closed)
    }
    if (_cb && buffer.length >= 1) {
      var cb = _cb
      _cb = null
      log('dequeue ' + buffer[0])
      return cb(null, buffer.shift())
    }
    log('waiting')
  }

  return {
    source: function (abort, cb) {
      _cb = cb
      if (abort) closed = abort
      dequeue()
    },
    sink: function (read) {
      log('reading data')
      read(closed, function next (err, data) {
        if (err) {
          log('error: ' + err)
          closed = err
          return dequeue()
        }

        log('enqueue ' + data)
        buffer.push(data)
        dequeue()

        log('reading data')
        read(err, next)
      })
    }
  }
}

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

tape('half-duplex synchronization', function (t) {
  var expectedTrace = [
    'a->b: 1',
    'b->a: 0A',
    'A',
    'a->b: 1',
    'b->a: 0B',
    'B',
    'a->b: 1',
    'b->a: 0C',
    'C',
    'a->b: 1'
  ]
  var actualTrace = []

  var aToB = toObject(pull.through((x) => actualTrace.push('a->b: ' + x)))
  var bToA = toObject(pull.through((x) => actualTrace.push('b->a: ' + x)))

  var a = sync({
    sink: aToB.sink,
    source: bToA.source
  })

  var b = sync({
    sink: bToA.sink,
    source: aToB.source
  })

  pull(
    pull.values(['A', 'B', 'C']),
    b
  )

  pull(
    a,
    pull.through(function (x) { actualTrace.push(x) }),
    pull.drain(null, function () {
      t.deepEqual(actualTrace, expectedTrace)
      t.end()
    })
  )
})

tape('duplex synchronization', function (t) {
  var expectedTrace = [
    'a->b: 1',
    'b->a: 1',
    'a->b: 0A',
    'b: A',
    'b->a: 0A',
    'A',
    'a->b: 1',
    'b->a: 1',
    'a->b: 0B',
    'b: B',
    'b->a: 0B',
    'B',
    'a->b: 1',
    'b->a: 1',
    'a->b: 0C',
    'b: C',
    'b->a: 0C',
    'C',
    'a->b: 1',
    'b->a: 1'
  ]
  var actualTrace = []

  var aToB = toObject(pull.through((x) => actualTrace.push('a->b: ' + x)))
  var bToA = toObject(pull.through((x) => actualTrace.push('b->a: ' + x)))

  var a = sync({
    sink: aToB.sink,
    source: bToA.source
  })

  var b = sync({
    sink: bToA.sink,
    source: aToB.source
  })

  pull(
    b,
    pull.through((x) => actualTrace.push('b: ' + x)),
    b
  )

  pull(
    pull.values(['A', 'B', 'C']),
    a,
    pull.through(function (x) { actualTrace.push(x) }),
    pull.drain(null, function () {
      t.deepEqual(actualTrace, expectedTrace)
      t.end()
    })
  )
})
