-- Idea board schema.
--
-- Phase 2/3 columns (impact, effort, public_slug, idea_notes, idea_links) are
-- created up front even though the phase-1 UI ignores them, so that adding those
-- features later needs no migration.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    display_name  TEXT    NOT NULL DEFAULT '',
    api_token     TEXT    NOT NULL UNIQUE,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'spark',
    impact      INTEGER,
    effort      INTEGER,
    -- NULL means private. UNIQUE tolerates many NULLs in SQLite.
    public_slug TEXT    UNIQUE,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    archived_at TEXT
);

-- The board's default query is "my ideas, newest touched first, not archived".
CREATE INDEX IF NOT EXISTS idx_ideas_user_updated ON ideas(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_user_status  ON ideas(user_id, status);

CREATE TABLE IF NOT EXISTS tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    TEXT    NOT NULL COLLATE NOCASE,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS idea_tags (
    idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (idea_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_idea_tags_tag ON idea_tags(tag_id);

-- Phase 2: append-only log of how an idea evolved.
CREATE TABLE IF NOT EXISTS idea_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id    INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idea_notes_idea ON idea_notes(idea_id, created_at);

-- Phase 3: [[wiki-style]] links between ideas.
CREATE TABLE IF NOT EXISTS idea_links (
    from_idea INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    to_idea   INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    PRIMARY KEY (from_idea, to_idea)
);

-- Failed login tracking. Rows are pruned on successful login and by age.
CREATE TABLE IF NOT EXISTS login_attempts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ident    TEXT NOT NULL,   -- "<email>|<ip>"
    attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ident, attempted_at);

-- Only consulted when IDEAS_SIGNUP_MODE=invite.
CREATE TABLE IF NOT EXISTS invites (
    code       TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at    TEXT
);
