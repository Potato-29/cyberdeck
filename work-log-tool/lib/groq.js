// Groq calls. Node 24/26 has global fetch, FormData and Blob, so this needs no
// dependency. Shapes are ported from the existing Python services so the whole
// deck talks to Groq the same way:
//   - transcribe() mirrors deskbuddy/broker.py:155-173
//   - chatJson()   mirrors standup.py:423-448
//
// Both reuse GROQ_API_KEY. There is one Groq key for the whole repo — see the
// note at .env.example:50-51 — so do not add a second.

const fs = require('node:fs');

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE = process.env.GROQ_BASE || 'https://api.groq.com/openai/v1';
const STT_MODEL = process.env.WORKLOG_STT_MODEL || 'whisper-large-v3-turbo';
const LLM_MODEL = process.env.WORKLOG_MODEL || 'llama-3.3-70b-versatile';

const hasKey = () => Boolean(GROQ_KEY);

// Returns transcribed text, or '' on any failure. Never throws: a failed
// transcription must leave the WAV on disk and the note retryable, not crash
// the request that is already long since answered.
async function transcribe(wavPath) {
    if (!GROQ_KEY) return '';
    try {
        const buf = await fs.promises.readFile(wavPath);
        const form = new FormData();
        form.append('file', new Blob([buf], { type: 'audio/wav' }), 'note.wav');
        form.append('model', STT_MODEL);
        form.append('language', 'en');
        form.append('response_format', 'json');

        const resp = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
            method: 'POST',
            // Authorization only. Setting Content-Type here would clobber the
            // multipart boundary that fetch generates.
            headers: { Authorization: `Bearer ${GROQ_KEY}` },
            body: form,
            signal: AbortSignal.timeout(60000),
        });
        if (!resp.ok) {
            console.log(`[worklog] stt ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
            return '';
        }
        const data = await resp.json();
        return (data.text || '').trim();
    } catch (err) {
        console.log(`[worklog] stt failed: ${err.message}`);
        return '';
    }
}

// Pulls the JSON object out of a reply that came back fenced or with a preamble.
// Ported from standup.py:372-380.
function extractJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

// Returns a parsed object, or null on any failure. Every null path is expected
// to land in a template fallback — a mediocre draft beats a 500.
async function chatJson(prompt, { temperature = 0.3, maxTokens = 2000 } = {}) {
    if (!GROQ_KEY) return null;
    try {
        const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
                temperature,
                max_tokens: maxTokens,
            }),
            signal: AbortSignal.timeout(60000),
        });
        if (!resp.ok) {
            console.log(`[worklog] groq ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
            return null;
        }
        const data = await resp.json();
        return extractJson(data.choices?.[0]?.message?.content);
    } catch (err) {
        console.log(`[worklog] groq failed: ${err.message}`);
        return null;
    }
}

module.exports = { transcribe, chatJson, extractJson, hasKey, LLM_MODEL, STT_MODEL };
