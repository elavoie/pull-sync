#!/usr/bin/env node
// Intended to be used with worker in a separate process
// usage: ./master
//
var pull = require('pull-stream')
// var sync = require('../')
var childProcess = require('child_process')
var split = require('split')
var toPull = require('stream-to-pull-stream')
var log = require('debug')('master')
var sync = require('pull-sync')

var worker = childProcess.spawn('./worker.js', [], { stdio: ['pipe', 'pipe', process.stderr] })

var map = {
  sink: pull(
    pull.map(function (x) {
      log('worker input: ' + x)
      return String(x) + '\n'
    }),
    toPull.sink(worker.stdin)
  ),
  source: pull(
    toPull.source(worker.stdout.pipe(split(undefined, null, { trailing: false }))),
    pull.through(function (x) { log('worker output: ' + x) })
  )
}

pull(
  pull.count(10),
  pull.through(function (x) { log('master source: ' + x) }),
  // pull.map(function (x) { return x * x }),
  sync(map),
  pull.through(function (x) { log('master sink: ' + x) }),
  pull.drain(function (x) {
    process.stdout.write(x + '\n')
  }, function (err) {
    log('terminating: ' + err)
    process.exit(0)
  })
)
