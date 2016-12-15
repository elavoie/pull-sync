[![Build Status](https://travis-ci.org/elavoie/pull-sync.svg?branch=master)](https://travis-ci.org/elavoie/pull-sync)

# pull-sync

Synchronizes pull-streams that are connected by an unsynchronized transport, one
value at a time.

* Provides transparent back-pressure even if the transport does not provide it. 
* Works with WebSockets when used with pull-ws.

Useful for working with infinite streams and for transparently splitting the
processing of a stream between server and client.

Both the client and the server need to be synchronized. Otherwise, if only one
end is synchronized, the other end will receive messages it does not
understand.

For a different solution that may provide better throughput, see
[pull-credit](https://github.com/dominictarr/pull-credit).


# Quick Example
    
    var ws = require('pull-ws')
    var pull = require('pull-stream')
    var sync = require('../src/')

    function delay (ms) {
        return pull.asyncMap(function (data, cb) {
            setTimeout(function () { cb(null, data) }, ms)
        })
    }

    var server = ws.createServer(function (stream) {
    stream = sync(stream)
    pull(
        stream,
        pull.map(function (x) {
        return Number.parseInt(x) * 2
        }),
        pull.map(String),
        stream
    )
    }).listen(5000)
    .on('listening', function () {
        ws.connect('ws://localhost:5000', function (err, stream) {
        if (err) throw err

        stream = sync(stream)

        // Prints 0,0,1,2,2,4,3,6 regardless of the relative
        // speed of client and server and the transportation delay
        pull(
            pull.count(3),
            pull.map(String),
            pull.through(console.log),
            stream,
            pull.through(console.log),
            delay(500),
            pull.drain(null, function () { server.close() })
        )
        })
    })

Signature
=========

The following signature follows the [js module signature
syntax](https://github.com/elavoie/js-module-signature-syntax) and conventions.
All callbacks ('cb') have the '(err, value)' signature.

    sync: (stream: {
        source: (abort, cb),
        sink: (read: (abort, cb)),
        ?...
    }) =>
    syncStream: {
        sink: (read: (abort, cb)),
        source: (abort, cb),
        ?...
    }

Properties
==========

1. If *stream.source* or *stream.sink:read* aborts, *syncStream.sink* aborts and *syncStream.source:cb* always returns closed (err === true).
2. Extra methods on *stream* are also on *syncStream*.
3. Every event on syncStream has an equivalent message that will eventually be sent on *stream.sink* (see below in Approach).
4. Every message received from *stream.source* will eventually be converted into an event on *syncStream*.
5. No action on *syncStream* is initiated before receiving the corresponding message.


Approach
========

Events on *syncStream* are sinked in the *stream* as one of these messages.
Events are named with the 'object.property' and 'function:argument' syntax,
with the 'object.property' having higher precedence. Names refer to the
signature above.

| SyncStream event                     | Message sent                 |
| ------------------------------------ | ---------------------------- |
| syncStream.sink:read:cb:value        | '0' + JSON.stringify(value)  |
| syncStream.sink:read:cb:err          | '1' + (err.message \|\| true)|
| syncStream.source:null (value asked) | '2'                          |
| syncStream.source:abort              | '3'                          |
| syncStream.sink:read assigned        | '4'                          |
| initialization                       | '5 pull-sync: missing sync'  |

When receiving one of the messages, the following actions are invoked. The
'function(argument)' syntax is used for denoting the function being called with
what argument. Names refer to the signature above.

| Message received              | Action                              
| ----------------------------- | --------------------------------------------- |
| '0' + value                   | syncStream.source:cb(null, JSON.parse(value)) |
| '1' + (err.message \|\| true) | syncStream.source:cb(err)                     |
| '2'                           | syncStream.sink:read(null, ...)               |
| '3'                           | syncStream.sink:read(abort)                   |
| '4'                           | internally set remote status to ready         |
| '5 pull-sync: missing sync'   | internally set remote status to connected     |

In addition to establishing the connection, the '5...' message helps detecting a
missing sync because it won't be consumed if the other end does not use sync().

The behavior when two syncStreams are connected through a duplex stream, such
as a WebSocket, is equivalent to: 

    // Machine 1
    var syncStream1 = {
      sink: function (read) {
        syncStream1.read = read
      },
      source: function (abort, cb) {
        syncStream2.read(abort, cb)
      }
    }

    // duplex stream (ex: WebSocket)

    // Machine 2
    var syncStream2 = {
      sink: function (read) {
        syncStream2.read = read
      },
      source: function (abort, cb) {
        syncStream1.read(abort, cb)
      }
    }

Therefore values are flowing from *syncStream1.read* to *syncStream2.source*,
and from *syncStream2.read* to *syncStream1.source*.

A stream may flow transparently between two differents computers by inverting
the order of the sink and the source on one end:

    // Machine 1
    pull(
      pull.count(),
      syncStream1,
      pull.drain()
    )

    // duplex stream (ex: WebSocket)

    // Machine 2
    pull(
      syncStream2.source,
      pull.through(),
      syncStream2.sink 
    )

