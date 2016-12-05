module.exports = function (through) {
  var stream = { }
  var _stream = null
  var args = null

  stream.sink = function (read) {
    _stream = through(read) 

    if (args) {
      _stream(args[0], args[1])
    }
  }

  stream.source = function (abort, cb) {
    if (_stream) {
      _stream(abort, cb)
    } else {
      args = [abort, cb]
    }
  }

  return stream
}
