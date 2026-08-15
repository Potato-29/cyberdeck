-- Work log schema. Applied on every boot by db.js — every statement is
-- IF NOT EXISTS so it is idempotent, and there is no migration framework.
-- Same posture as ideas/schema.sql: provision forward, add columns up front.
--
-- Timestamps are ISO-8601 with a LOCAL offset ("2026-08-15T14:02:03+05:30"),
-- following standup.py rather than ideas/db.py's UTC. A work log is read in
-- terms of "today" and "this week" as a human experiences them; storing UTC
-- would push late-evening notes onto the next day. The offset is constant for
-- a single user in one timezone, so these still sort lexicographically.

CREATE TABLE IF NOT EXISTS contexts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    created      TEXT NOT NULL,
    is_archived  INTEGER NOT NULL DEFAULT 0,
    last_touched TEXT
);

CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    context_id INTEGER REFERENCES contexts(id),
    timestamp  TEXT NOT NULL,
    source     TEXT NOT NULL,               -- voice | deck | device
    raw_text   TEXT NOT NULL DEFAULT '',
    audio_path TEXT,
    -- pending: audio landed, transcription in flight. failed: Groq refused and
    -- the WAV is still on disk, retryable. Not in the original spec; the audio
    -- path needs it and adding it later would mean a migration.
    status     TEXT NOT NULL DEFAULT 'ok'   -- ok | pending | failed
);

-- Separate from notes on purpose: notes are "what happened", breadcrumbs are
-- "where I stopped". Overloading one table makes the "where was I" lookup messy.
CREATE TABLE IF NOT EXISTS breadcrumbs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    context_id INTEGER REFERENCES contexts(id),
    text       TEXT NOT NULL,
    timestamp  TEXT NOT NULL
);

-- Active context is explicit state, not derived from contexts.last_touched:
-- writing a note into context B must not silently move you off context A.
CREATE TABLE IF NOT EXISTS app_state (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    active_context_id INTEGER REFERENCES contexts(id),
    switched_at       TEXT
);
INSERT OR IGNORE INTO app_state (id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_notes_ts      ON notes(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notes_ctx_ts  ON notes(context_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notes_status  ON notes(status);
CREATE INDEX IF NOT EXISTS idx_crumbs_ctx_ts ON breadcrumbs(context_id, timestamp DESC);

-- External-content FTS5: the text lives in notes, not duplicated here.
-- The triggers are mandatory, not an optimisation — notes get edited and
-- deleted, and without them search silently returns notes you removed weeks ago.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
    USING fts5(raw_text, content='notes', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, raw_text)
        VALUES ('delete', old.id, old.raw_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, raw_text)
        VALUES ('delete', old.id, old.raw_text);
    INSERT INTO notes_fts(rowid, raw_text) VALUES (new.id, new.raw_text);
END;
