var ws = require('pull-ws')
var pull = require('pull-stream')
var sync = require('..')
var express = require('express')
var path = require('path')
var http = require('http')

var app = express()
app.use(express.static(path.join(__dirname, '..', 'public')))

var httpServer = http.createServer(app)
httpServer.listen(8080, function (server) {
  console.log('server waiting for connection')
})

ws.createServer({server: httpServer}, function (stream) {
  console.log('client connected')
  stream = sync(stream)
  pull(
    stream,
    pull.through(function (x) { console.log('processing: ' + x) }),
    pull.map(function (x) {
      return Number.parseInt(x) * 2
    }),
    pull.map(String),
    pull.through(function (x) { console.log('produced: ' + x) }),
    stream
  )
})
