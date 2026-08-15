// Streaming WAV writer for the audio capture path.
//
// The ESP32 opens a chunked POST when a touch pad goes down and closes it on
// release, so the total length is unknown when the file is created. Without
// PSRAM there is roughly four seconds of heap on the device, which is not a
// voice note — buffering the whole thing on either end is not an option.
//
// So: write a 44-byte header with placeholder sizes, stream PCM frames straight
// to disk as they arrive, then patch the two size fields on close.

const fs = require('node:fs');

const SAMPLE_RATE = 16000;   // matches deskbuddy/broker.py:89-98
const BITS = 16;
const CHANNELS = 1;

function header(dataBytes) {
    const buf = Buffer.alloc(44);
    const byteRate = SAMPLE_RATE * CHANNELS * (BITS / 8);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataBytes, 4);      // ChunkSize
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
    buf.writeUInt16LE(1, 20);                  // AudioFormat = PCM
    buf.writeUInt16LE(CHANNELS, 22);
    buf.writeUInt32LE(SAMPLE_RATE, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);  // BlockAlign
    buf.writeUInt16LE(BITS, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataBytes, 40);          // Subchunk2Size
    return buf;
}

// Consumes a readable stream of raw little-endian 16-bit mono PCM and writes a
// playable WAV. Resolves with the byte count of the audio payload.
function writeWavFromStream(stream, filePath) {
    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(filePath);
        let dataBytes = 0;

        out.on('error', reject);
        stream.on('error', reject);

        out.write(header(0));                  // placeholder, patched below
        stream.on('data', (chunk) => {
            dataBytes += chunk.length;
            out.write(chunk);
        });

        stream.on('end', () => {
            out.end(async () => {
                try {
                    // Patch ChunkSize (offset 4) and Subchunk2Size (offset 40)
                    // now that the real length is known.
                    const fh = await fs.promises.open(filePath, 'r+');
                    try {
                        const sizes = Buffer.alloc(4);
                        sizes.writeUInt32LE(36 + dataBytes, 0);
                        await fh.write(sizes, 0, 4, 4);
                        sizes.writeUInt32LE(dataBytes, 0);
                        await fh.write(sizes, 0, 4, 40);
                    } finally {
                        await fh.close();
                    }
                    resolve(dataBytes);
                } catch (err) {
                    reject(err);
                }
            });
        });
    });
}

// A client may also POST a complete WAV (curl --data-binary @sample.wav, or the
// browser's MediaRecorder). Detect that and pass it through untouched rather
// than wrapping a WAV inside another WAV header.
function looksLikeWav(buf) {
    return buf.length >= 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WAVE';
}

module.exports = { writeWavFromStream, looksLikeWav, header, SAMPLE_RATE };
