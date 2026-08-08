#!/usr/bin/env python3
"""Accounts, sessions, and request gating for the idea board.

Unlike the rest of the cyberdeck (one shared WEBHOOK_TOKEN, no users), this
service has real per-user accounts. Passwords are hashed with werkzeug's scrypt
default and sessions ride Flask's signed cookie — no new dependencies.
"""

import functools
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from flask import g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import execute, query, utcnow

# open   — anyone can register
# invite — a valid unused code is required
# closed — registration is off
SIGNUP_MODE = os.environ.get("IDEAS_SIGNUP_MODE", "open").strip().lower()

MIN_PASSWORD_LEN = 8
# This is a public URL on a residential IP, so brute-force protection is not
# optional. Attempts are counted per email+IP so one attacker cannot lock out
# a real user by hammering their address from elsewhere.
MAX_FAILED_ATTEMPTS = 8
LOCKOUT_MINUTES = 15

# Deliberately loose: real validation is "can they receive mail", which we
# don't test. This only rejects obvious junk.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")


# ── Users ────────────────────────────────────────────────
def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_credentials(email: str, password: str):
    """Return an error string, or None if the pair is acceptable."""
    if not EMAIL_RE.match(email or ""):
        return "Enter a valid email address."
    if len(password or "") < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters."
    return None


def create_user(email: str, password: str, display_name: str = ""):
    cur = execute(
        "INSERT INTO users (email, password_hash, display_name, api_token, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (
            normalize_email(email),
            generate_password_hash(password),
            (display_name or "").strip()[:80],
            secrets.token_urlsafe(32),
            utcnow(),
        ),
    )
    return cur.lastrowid


def find_user_by_email(email: str):
    return query(
        "SELECT * FROM users WHERE email = ?", (normalize_email(email),), one=True
    )


def find_user_by_id(user_id: int):
    return query("SELECT * FROM users WHERE id = ?", (user_id,), one=True)


def find_user_by_token(token: str):
    """Constant-time compare, so a bad token can't be recovered by timing.

    The candidate rows are narrowed by an index lookup first; the digest compare
    is what actually decides.
    """
    if not token:
        return None
    row = query("SELECT * FROM users WHERE api_token = ?", (token,), one=True)
    if row is None:
        # Burn a comparison anyway so a miss costs roughly the same as a hit.
        secrets.compare_digest(token, token)
        return None
    return row if secrets.compare_digest(row["api_token"], token) else None


def public_user(row):
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "api_token": row["api_token"],
    }


# ── Login throttle ───────────────────────────────────────
def _ident(email: str) -> str:
    return f"{normalize_email(email)}|{request.remote_addr or '?'}"


def _cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_MINUTES)).isoformat(
        timespec="seconds"
    )


def is_locked_out(email: str) -> bool:
    row = query(
        "SELECT COUNT(*) AS n FROM login_attempts WHERE ident = ? AND attempted_at > ?",
        (_ident(email), _cutoff()),
        one=True,
    )
    return bool(row and row["n"] >= MAX_FAILED_ATTEMPTS)


def record_failure(email: str) -> None:
    execute(
        "INSERT INTO login_attempts (ident, attempted_at) VALUES (?, ?)",
        (_ident(email), utcnow()),
    )
    # Opportunistic prune so the table can't grow without bound.
    execute("DELETE FROM login_attempts WHERE attempted_at < ?", (_cutoff(),))


def clear_failures(email: str) -> None:
    execute("DELETE FROM login_attempts WHERE ident = ?", (_ident(email),))


def verify_password(row, password: str) -> bool:
    return check_password_hash(row["password_hash"], password or "")


def set_password(user_id: int, password: str) -> None:
    execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(password), user_id),
    )


# ── Sessions ─────────────────────────────────────────────
def login_session(user_id: int) -> None:
    session.clear()  # new identity, new session — no fixation
    session["uid"] = user_id
    session.permanent = True


def logout_session() -> None:
    session.clear()


def current_user():
    """Cached per request; None when signed out."""
    if "user" not in g:
        uid = session.get("uid")
        g.user = find_user_by_id(uid) if uid else None
        # Session pointing at a deleted account: drop the cookie.
        if uid and g.user is None:
            session.clear()
    return g.user


def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


def token_required(fn):
    """For POST /api/capture — CLI and automation, no cookie involved."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        token = request.headers.get("X-Api-Token") or request.args.get("token")
        row = find_user_by_token(token)
        if row is None:
            return jsonify({"error": "Unauthorized"}), 401
        g.user = row
        return fn(*args, **kwargs)

    return wrapper
