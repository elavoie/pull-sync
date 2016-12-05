Synchronize pull-streams that are connected by an unsynchronized transport. Provides transparent back-pressure even if the transport does not provide it. Works with WebSockets when used with pull-ws.

Amongst other things, it enables working with infinite streams and transparently splitting the processing of the stream between server and client.

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

A single element is emitted by the source for each element read by the sink.
Synchronization is done through an 'ask' token between the two ends of the
synced stream. When one end of the synced stream is read, it sends an ask
token.  The other end replies to the token with the data from a single read of
its source.

Therefore, as in the previous example, when the stream goes to and comes back
from the server, an 'ask' token needs to go to and come back from the server
for each element of the stream. The roundtrip latency between each element may
(or may not) be an issue for your application.

If the stream has a 'close' method, it is called once either end of the synced
stream aborts or produces an error.

Synchronization also works with half-duplex (one-way) streams both finite and
infinite.  However for most (all?) finite streams it is unnecessary because the
opening and closing of the stream serve as synchronization points and the
underlying transport protocol performs flow-control.

Finally, both the client and the server need to be synchronized (or both should
not be). The behaviour when only one of the two is synchronized is unspecified.
