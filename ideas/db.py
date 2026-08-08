#!/usr/bin/env python3
"""SQLite access for the idea board.

One connection per request, stashed on flask.g and closed on teardown. Flask is
threaded and a single shared sqlite3 connection across threads is a data race,
so nothing here caches a module-level connection.
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import g

_here = Path(__file__).resolve().parent
SCHEMA_PATH = _here / "schema.sql"

# Kept outside the repo: this file holds other people's password hashes.
DB_PATH = Path(os.path.expanduser(os.environ.get("IDEAS_DB", "~/ideas.db")))


def utcnow() -> str:
    """Timestamps are ISO-8601 UTC strings so they sort lexicographically."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    # WAL lets the board keep reading while a write is in flight; without it a
    # slow write on phone-grade storage blocks every concurrent request.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    """Create the database and apply schema.sql. Safe to run on every boot."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()
    # 0600: the DB sits in $HOME on a device with other apps on it.
    try:
        os.chmod(DB_PATH, 0o600)
    except OSError:
        pass  # best-effort; Android/FAT-backed storage may not support it


def query(sql: str, args=(), one: bool = False):
    cur = get_db().execute(sql, args)
    rows = cur.fetchall()
    cur.close()
    if one:
        return rows[0] if rows else None
    return rows


def execute(sql: str, args=()) -> sqlite3.Cursor:
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur
