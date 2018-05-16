#!/usr/bin/env node
// Intended to be started by master in a different process
// usage: ./worker
//
var pull = require('pull-stream')
var sync = require('../')
var toPull = require('stream-to-pull-stream')
var split = require('split')
var log = require('debug')('worker')

log('worker started')

var duplex = sync({
  source: toPull.source(process.stdin.pipe(split(undefined, null, { trailing: false }))),
  sink: pull(
    pull.map(function (x) { return x + '\n' }),
    toPull.sink(process.stdout)
  )
})

pull(
  duplex,
  pull.through(function (x) { log('worker input: ' + x) }),
  pull.map(function (x) { return x * x }),
  pull.through(function (x) { log('worker output: ' + x) }),
  duplex
)
