const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const pcm_file = 'audio/16bit-8000.pcm';
const repeat_file = 'audio/repeat.wav';
const test_file = 'audio/woman_4.wav';
let interval = 0,
    sampleRate = 44100,
    bytePerSample = 2,
    channels = 2,
    bytesChunk = (sampleRate * bytePerSample * channels),
    offset = 0,
    pcmData;
wss = new WebSocket.Server({ port: 8000, path: '/server/ws' });
const clients = new Map();
const servers = new Map();
console.log('Server ready...');

wss.on('connection', function connection(ws, req) {
    console.log("url: ", req.url);
    const q = url.parse(req.url, true);
    const clientType = q.query.clientType || "player"
    console.log("🚀 ~ file: index.js:11 ~ connection ~ clientType:", clientType)

    if (clientType == "player") {
        clients.set(ws, clientType);
    } else if (clientType == "server") {
        servers.set(ws, clientType);
    }
    ws.on('error', function (error) {
        console.log('disconnected with error: %s', error);
    })

    ws.on('close', function () {
        console.log('disconnected')
        if (clientType == "server") {
            const message = JSON.stringify({
                "event": "close",
            })
            sendPayloadToClients(message);
        }
    })

    console.log('Socket connected. sending data...');
    ws.on('message', function message(message, isBinary) {
        if (!isBinary) {
            if (message == "test") {
                message = JSON.stringify({
                    "call_id": "test",
                    "channel": "stereo"
                })
                sendPayloadToClients(message);
                fs.readFile(pcm_file, (err, data) => {
                    if (err) throw err;
                    pcmData = data;
                    sendData()
                });
                return
            } else if (message == "stream_repeat") {
                fs.readFile(repeat_file, (err, data) => {
                    if (err) throw err;
                    message = JSON.stringify({
                        "event": "media",
                        "media": {
                            "payload": data.toString("base64"),
                        }
                    })
                    sendPayloadToServers(message)
                    return
                });
                return
            } else if (message == "stream_repeat_sync") {
                fs.readFile(repeat_file, (err, data) => {
                    if (err) throw err;
                    message = JSON.stringify({
                        "event": "media",
                        "media": {
                            "payload": data.toString("base64"),
                            "is_sync": true
                        }
                    })
                    sendPayloadToServers(message)
                    return
                });
                return
            } else if (message == "hangup") {
                message = JSON.stringify({
                    "event": "hangup",
                })
                sendPayloadToServers(message);
                return
            } else {
                let msg = tryParseJSONObject(message.toString());
                if (msg) {
                    if (msg.event == "media") {
                        if (msg.media?.payload?.length > 0) {
                            sendPayloadToClients(base64ToArrayBuffer(msg.media.payload))
                            return
                        }
                    } else if (msg.event == "connected") {
                        console.log("start new call")
                        // play test file
                        fs.readFile(test_file, (err, data) => {
                            if (err) {
                                console.error(err)
                                throw err;
                            }
                            message = JSON.stringify({
                                "event": "media",
                                "media": {
                                    "payload": data.toString("base64"),
                                    "is_sync": true
                                }
                            })
                            
                            sendPayloadToClients(message);
                        })
                    }
                }
            }
        }

        // sendPayloadToClients(message);
    });
});


function sendData() {
    let payload;
    if (!pcmData) return;
    if (offset >= pcmData.length) {
        clearInterval(interval);
        offset = 0;
        return;
    }
    payload = pcmData.subarray(offset, (offset + bytesChunk));
    offset += bytesChunk;
    sendPayloadToClients(payload);
}

function sendPayloadToClients(payload) {
    [...clients.keys()].forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function sendPayloadToServers(payload) {
    [...servers.keys()].forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function tryParseJSONObject(jsonString) {
    try {
        var o = JSON.parse(jsonString);
        if (o && typeof o === "object") {
            return o;
        }
    }
    catch (e) { }

    return false;
};

function base64ToArrayBuffer(base64) {
    var binaryString = atob(base64);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
