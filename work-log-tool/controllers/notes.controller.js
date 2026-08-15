const fs = require('node:fs');
const path = require('node:path');
const { query, one, execute, now } = require('../db');
const { expandHome } = require('../lib/env');
const { writeWavFromStream } = require('../lib/wav');
const { transcribe } = require('../lib/groq');

const AUDIO_DIR = expandHome(process.env.WORKLOG_AUDIO || '~/work-log-audio');

const NOTE_COLUMNS = `n.id, n.context_id, n.timestamp, n.source, n.raw_text,
                      n.audio_path, n.status, c.name AS context_name`;

const getNote = (id) => one(
    `SELECT ${NOTE_COLUMNS} FROM notes n
     LEFT JOIN contexts c ON c.id = n.context_id WHERE n.id = ?`, id,
);

function touchContext(contextId) {
    if (contextId) {
        execute('UPDATE contexts SET last_touched = ? WHERE id = ?', now(), contextId);
    }
}

// Falls back to the active context so a note is never silently unfiled just
// because the client forgot to say where it belongs.
function resolveContext(requested) {
    if (requested) return Number(requested);
    const state = one('SELECT active_context_id FROM app_state WHERE id = 1');
    return state?.active_context_id ?? null;
}

// Transcribe out of band, then patch the row. The FTS triggers pick the new
// text up automatically on UPDATE.
async function transcribeInBackground(noteId, wavPath) {
    const text = await transcribe(wavPath);
    if (text) {
        execute('UPDATE notes SET raw_text = ?, status = ? WHERE id = ?', text, 'ok', noteId);
    } else {
        // The WAV stays on disk. Losing audio that cannot be re-recorded is the
        // one unrecoverable failure on this path.
        execute('UPDATE notes SET status = ? WHERE id = ?', 'failed', noteId);
        console.log(`[worklog] note ${noteId} transcription failed; wav kept at ${wavPath}`);
    }
}

async function addAudioNote(req, res) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const wavPath = path.join(AUDIO_DIR, `note-${stamp}.wav`);

    try {
        if (req.is('audio/wav') || req.is('audio/x-wav')) {
            // Already a container — write it through untouched rather than
            // wrapping a WAV inside another WAV header.
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(wavPath);
                req.pipe(out);
                out.on('finish', resolve);
                out.on('error', reject);
                req.on('error', reject);
            });
        } else {
            // Raw PCM from the device (audio/L16), streamed frame by frame.
            await writeWavFromStream(req, wavPath);
        }
    } catch (err) {
        return res.status(500).json({ error: `could not store audio: ${err.message}` });
    }

    const contextId = resolveContext(req.query.context_id);
    const result = execute(
        `INSERT INTO notes (context_id, timestamp, source, raw_text, audio_path, status)
         VALUES (?, ?, ?, '', ?, 'pending')`,
        contextId, now(), req.query.source || 'voice', wavPath,
    );
    touchContext(contextId);

    const note = getNote(result.lastInsertRowid);
    // Answer before transcribing: Whisper takes seconds and the ESP32 is holding
    // the connection open on a few KB of heap waiting for its confirm beep.
    res.status(201).json(note);

    transcribeInBackground(note.id, wavPath).catch((err) => {
        console.log(`[worklog] background transcription crashed: ${err.message}`);
    });
}

module.exports = {
    addNote: async (req, res) => {
        // Same endpoint, different content type, so the device and the tab
        // never diverge.
        if (req.is('audio/*') || req.is('application/octet-stream')) {
            return addAudioNote(req, res);
        }

        const text = (req.body?.text || '').trim();
        if (!text) return res.status(400).json({ error: 'text is required' });

        const contextId = resolveContext(req.body.context_id);
        const result = execute(
            `INSERT INTO notes (context_id, timestamp, source, raw_text, status)
             VALUES (?, ?, ?, ?, 'ok')`,
            contextId, now(), req.body.source || 'deck', text,
        );
        touchContext(contextId);
        return res.status(201).json(getNote(result.lastInsertRowid));
    },

    getFilteredNotes: (req, res) => {
        const where = [];
        const args = [];
        if (req.query.date) {
            where.push('substr(n.timestamp, 1, 10) = ?');
            args.push(req.query.date);
        }
        if (req.query.ctx) {
            where.push('n.context_id = ?');
            args.push(Number(req.query.ctx));
        }
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        const notes = query(
            `SELECT ${NOTE_COLUMNS} FROM notes n
             LEFT JOIN contexts c ON c.id = n.context_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY n.timestamp DESC LIMIT ?`,
            ...args, limit,
        );
        return res.json({ notes });
    },

    editNote: (req, res) => {
        const id = Number(req.params.id);
        if (!getNote(id)) return res.status(404).json({ error: 'Not found' });

        if (typeof req.body?.text === 'string') {
            const text = req.body.text.trim();
            if (!text) return res.status(400).json({ error: 'text cannot be empty' });
            execute('UPDATE notes SET raw_text = ? WHERE id = ?', text, id);
        }
        if (req.body?.context_id !== undefined) {
            execute('UPDATE notes SET context_id = ? WHERE id = ?', Number(req.body.context_id), id);
            touchContext(Number(req.body.context_id));
        }
        return res.json(getNote(id));
    },

    deleteNote: (req, res) => {
        const id = Number(req.params.id);
        const note = getNote(id);
        if (!note) return res.status(404).json({ error: 'Not found' });
        execute('DELETE FROM notes WHERE id = ?', id);
        // The WAV is deliberately left on disk — a mis-tap in the UI should not
        // destroy the only copy of something that was spoken once.
        return res.status(204).end();
    },

    retranscribe: async (req, res) => {
        const id = Number(req.params.id);
        const note = getNote(id);
        if (!note) return res.status(404).json({ error: 'Not found' });
        if (!note.audio_path || !fs.existsSync(note.audio_path)) {
            return res.status(400).json({ error: 'no audio on file for this note' });
        }
        execute('UPDATE notes SET status = ? WHERE id = ?', 'pending', id);
        res.status(202).json(getNote(id));
        transcribeInBackground(id, note.audio_path).catch((err) => {
            console.log(`[worklog] retranscribe crashed: ${err.message}`);
        });
    },
};
