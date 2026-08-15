// SQLite access for the work log.
//
// node:sqlite (builtin, Node >= 22) rather than the sqlite3 npm package: it
// removes the only native dependency, so the service installs on the phone
// with nothing to compile. Verified on-device — Termux node v26.2.0 and proot
// node v22.22.2 both have it, both with FTS5 compiled in.
//
// The API is SYNCHRONOUS. That is fine for the request handlers here (SQLite
// on local storage is microseconds and it removes a class of callback bugs),
// but it is exactly why transcription must never run inline on the audio path
// — see lib/groq.js.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { expandHome } = require('./lib/env');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DB_PATH = expandHome(process.env.WORKLOG_DB || '~/work-logs.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// WAL lets the tab keep reading while a write is in flight; without it a slow
// write on phone-grade storage blocks every concurrent request.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Idempotent: every statement is IF NOT EXISTS, so this runs on every boot and
// additive schema changes need no migration step.
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// 0600: the DB sits in $HOME on a device with other apps on it.
try {
    fs.chmodSync(DB_PATH, 0o600);
} catch {
    // Best-effort; Android/FAT-backed storage may not support it.
}

const query = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args) ?? null;
const execute = (sql, ...args) => db.prepare(sql).run(...args);

// ISO-8601 with the local offset. See the note at the top of schema.sql for why
// this is local rather than UTC.
function now() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const oh = pad(Math.floor(Math.abs(off) / 60));
    const om = pad(Math.abs(off) % 60);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
        `${sign}${oh}:${om}`;
}

// Seeded only when the table is empty, so renaming or deleting a context does
// not resurrect it on the next restart.
function seedContexts() {
    const { n } = one('SELECT COUNT(*) AS n FROM contexts');
    if (n > 0) return;
    const ts = now();
    for (const name of ['ruby', 'platform', 'misc']) {
        execute(
            'INSERT INTO contexts (name, created, is_archived, last_touched) VALUES (?, ?, 0, ?)',
            name, ts, ts,
        );
    }
    execute('UPDATE app_state SET active_context_id = 1, switched_at = ? WHERE id = 1', ts);
}

seedContexts();

process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});

module.exports = { db, query, one, execute, now, DB_PATH };
