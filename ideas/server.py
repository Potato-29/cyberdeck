#!/usr/bin/env python3
"""Idea board — ideas.prayas.space

Standalone Flask service on port 2124. Serves both the JSON API and the built
React bundle in web/dist, so there is one process, one port, and no CORS.

Unlike the rest of the cyberdeck this has real per-user accounts and a SQLite
database; it does not use WEBHOOK_TOKEN. See ../CLAUDE.md.

    python3 server.py            # production-ish, secure cookies
    python3 server.py --dev      # allows http:// cookies for local dev
"""

import math
import os
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import (
    Flask,
    g,
    jsonify,
    request,
    send_from_directory,
    session,
)


# ── Env ──────────────────────────────────────────────────
# Copied verbatim from webhook_new.py so this service runs standalone.
def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


_here = Path(__file__).resolve().parent
# The .env lives at the repo root, one level up, alongside every other service's.
load_env_file(_here.parent / ".env")
load_env_file(_here / ".env")

DEV = "--dev" in sys.argv or os.environ.get("IDEAS_DEV") == "1"

# Imported after .env is loaded — db.py reads IDEAS_DB at module level.
import auth  # noqa: E402
from auth import (  # noqa: E402
    SIGNUP_MODE,
    clear_failures,
    create_user,
    current_user,
    find_user_by_email,
    is_locked_out,
    login_required,
    login_session,
    logout_session,
    normalize_email,
    public_user,
    record_failure,
    set_password,
    token_required,
    validate_credentials,
    verify_password,
)
from db import close_db, execute, get_db, init_db, query, utcnow  # noqa: E402

PORT = int(os.environ.get("IDEAS_PORT", "2124"))
DIST = _here / "web" / "dist"

app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=require_env("IDEAS_SESSION_SECRET"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Secure cookies are never sent over http, which would break local dev.
    SESSION_COOKIE_SECURE=not DEV,
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    MAX_CONTENT_LENGTH=1024 * 1024,
    JSON_SORT_KEYS=False,
)
app.teardown_appcontext(close_db)

STATUSES = ("spark", "brewing", "building", "shipped", "parked", "dropped")
TITLE_MAX = 300
BODY_MAX = 100_000
TAG_MAX = 40
TAGS_PER_IDEA_MAX = 20


# ── Request gating ───────────────────────────────────────
@app.before_request
def csrf_guard():
    """Same-origin JSON API: SameSite=Lax plus a header browsers won't send
    cross-origin without a preflight we never answer.

    /api/capture is exempt — it authenticates with an explicit token rather
    than the session cookie, so there is no ambient authority to abuse.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if request.path == "/api/capture":
        return None
    if request.path.startswith("/api/"):
        if request.headers.get("X-Requested-With") != "ideas":
            return jsonify({"error": "Bad request"}), 400
    return None


def body():
    return request.get_json(silent=True) or {}


# ── Serialization ────────────────────────────────────────
def _heat(updated_at: str, note_count: int = 0) -> int:
    """Freshness, 0-100, halving every three weeks since the last touch.

    Computed on read rather than stored, so there is no scheduled job and
    nothing that can drift out of sync.
    """
    try:
        touched = datetime.fromisoformat(updated_at)
    except ValueError:
        return 0
    if touched.tzinfo is None:
        touched = touched.replace(tzinfo=timezone.utc)
    days = max(0.0, (datetime.now(timezone.utc) - touched).total_seconds() / 86400)
    score = 100 * math.pow(0.5, days / 21) + min(note_count, 5) * 3
    return int(max(0, min(100, round(score))))


def idea_json(row, tags=None):
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "status": row["status"],
        "impact": row["impact"],
        "effort": row["effort"],
        "public_slug": row["public_slug"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "archived_at": row["archived_at"],
        "tags": tags if tags is not None else [],
        "heat": _heat(row["updated_at"]),
    }


def tags_for(idea_ids):
    """One query for a whole page of ideas rather than N."""
    if not idea_ids:
        return {}
    marks = ",".join("?" * len(idea_ids))
    rows = query(
        f"SELECT it.idea_id, t.name FROM idea_tags it"
        f" JOIN tags t ON t.id = it.tag_id"
        f" WHERE it.idea_id IN ({marks}) ORDER BY t.name",
        tuple(idea_ids),
    )
    out = {}
    for r in rows:
        out.setdefault(r["idea_id"], []).append(r["name"])
    return out


# ── Tag helpers ──────────────────────────────────────────
def clean_tags(raw):
    if not isinstance(raw, list):
        return []
    seen, out = set(), []
    for item in raw:
        name = re.sub(r"\s+", " ", str(item or "")).strip().lower()[:TAG_MAX]
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= TAGS_PER_IDEA_MAX:
            break
    return out


def set_idea_tags(user_id: int, idea_id: int, names) -> None:
    """Replace an idea's tags in one transaction."""
    db = get_db()
    db.execute("DELETE FROM idea_tags WHERE idea_id = ?", (idea_id,))
    for name in names:
        db.execute(
            "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)", (user_id, name)
        )
        row = db.execute(
            "SELECT id FROM tags WHERE user_id = ? AND name = ?", (user_id, name)
        ).fetchone()
        if row:
            db.execute(
                "INSERT OR IGNORE INTO idea_tags (idea_id, tag_id) VALUES (?, ?)",
                (idea_id, row["id"]),
            )
    # Drop tags that no idea references any more, so the filter list stays honest.
    db.execute(
        "DELETE FROM tags WHERE user_id = ?"
        " AND id NOT IN (SELECT tag_id FROM idea_tags)",
        (user_id,),
    )
    db.commit()


# ── Auth routes ──────────────────────────────────────────
@app.post("/api/auth/register")
def register():
    if SIGNUP_MODE == "closed":
        return jsonify({"error": "Registration is closed."}), 403

    data = body()
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""
    problem = validate_credentials(email, password)
    if problem:
        return jsonify({"error": problem}), 400

    if SIGNUP_MODE == "invite":
        code = (data.get("invite") or "").strip()
        invite = query(
            "SELECT code FROM invites WHERE code = ? AND used_by IS NULL",
            (code,),
            one=True,
        )
        if invite is None:
            return jsonify({"error": "That invite code isn't valid."}), 403

    if find_user_by_email(email) is not None:
        return jsonify({"error": "That email is already registered."}), 409

    user_id = create_user(email, password, data.get("display_name") or "")

    if SIGNUP_MODE == "invite":
        execute(
            "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?",
            (user_id, utcnow(), (data.get("invite") or "").strip()),
        )

    login_session(user_id)
    return jsonify({"user": public_user(auth.find_user_by_id(user_id))}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""

    if is_locked_out(email):
        return jsonify({"error": "Too many attempts. Try again in a few minutes."}), 429

    row = find_user_by_email(email)
    # Same message and same shape whether the email or the password was wrong,
    # so this endpoint can't be used to enumerate accounts.
    if row is None or not verify_password(row, password):
        record_failure(email)
        return jsonify({"error": "Incorrect email or password."}), 401

    clear_failures(email)
    login_session(row["id"])
    return jsonify({"user": public_user(row)}), 200


@app.post("/api/auth/logout")
def logout():
    logout_session()
    return jsonify({"ok": True}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    return jsonify(
        {
            "user": public_user(user) if user else None,
            "signup_mode": SIGNUP_MODE,
        }
    ), 200


@app.post("/api/auth/password")
@login_required
def change_password():
    data = body()
    user = current_user()
    if not verify_password(user, data.get("current") or ""):
        return jsonify({"error": "Current password is incorrect."}), 403

    new = data.get("new") or ""
    problem = validate_credentials(user["email"], new)
    if problem:
        return jsonify({"error": problem}), 400

    set_password(user["id"], new)
    return jsonify({"ok": True}), 200


# ── Ideas ────────────────────────────────────────────────
@app.get("/api/ideas")
@login_required
def list_ideas():
    user = current_user()
    sql = ["SELECT * FROM ideas WHERE user_id = ?"]
    args = [user["id"]]

    if request.args.get("archived") == "1":
        sql.append("AND archived_at IS NOT NULL")
    else:
        sql.append("AND archived_at IS NULL")

    status = (request.args.get("status") or "").strip().lower()
    if status in STATUSES:
        sql.append("AND status = ?")
        args.append(status)

    q = (request.args.get("q") or "").strip()
    if q:
        # ESCAPE binds to each LIKE, not to the parenthesised group. Without the
        # escaping a search for "%" or "_" would match every idea.
        sql.append(r"AND (title LIKE ? ESCAPE '\' OR body LIKE ? ESCAPE '\')")
        like = "%" + q.replace("\\", r"\\").replace("%", r"\%").replace("_", r"\_") + "%"
        args.extend([like, like])

    tag = (request.args.get("tag") or "").strip().lower()
    if tag:
        sql.append(
            "AND id IN (SELECT it.idea_id FROM idea_tags it JOIN tags t ON t.id = it.tag_id"
            " WHERE t.user_id = ? AND t.name = ?)"
        )
        args.extend([user["id"], tag])

    sql.append("ORDER BY updated_at DESC LIMIT 500")
    rows = query(" ".join(sql), tuple(args))
    tag_map = tags_for([r["id"] for r in rows])
    return jsonify({"ideas": [idea_json(r, tag_map.get(r["id"], [])) for r in rows]}), 200


def _create_idea(user_id, title, body_text="", status="spark", tags=None):
    title = (title or "").strip()[:TITLE_MAX]
    if not title:
        return None, "An idea needs a title."
    if status not in STATUSES:
        status = "spark"
    now = utcnow()
    cur = execute(
        "INSERT INTO ideas (user_id, title, body, status, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, title, (body_text or "")[:BODY_MAX], status, now, now),
    )
    idea_id = cur.lastrowid
    if tags:
        set_idea_tags(user_id, idea_id, tags)
    return idea_id, None


@app.post("/api/ideas")
@login_required
def create_idea():
    data = body()
    user = current_user()
    idea_id, problem = _create_idea(
        user["id"],
        data.get("title"),
        data.get("body") or "",
        (data.get("status") or "spark").lower(),
        clean_tags(data.get("tags")),
    )
    if problem:
        return jsonify({"error": problem}), 400
    row = query("SELECT * FROM ideas WHERE id = ?", (idea_id,), one=True)
    return jsonify({"idea": idea_json(row, tags_for([idea_id]).get(idea_id, []))}), 201


def owned_idea(idea_id):
    """Ownership is part of the WHERE clause, never a check after the fetch."""
    return query(
        "SELECT * FROM ideas WHERE id = ? AND user_id = ?",
        (idea_id, current_user()["id"]),
        one=True,
    )


@app.get("/api/ideas/<int:idea_id>")
@login_required
def get_idea(idea_id):
    row = owned_idea(idea_id)
    if row is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"idea": idea_json(row, tags_for([idea_id]).get(idea_id, []))}), 200


@app.patch("/api/ideas/<int:idea_id>")
@login_required
def update_idea(idea_id):
    row = owned_idea(idea_id)
    if row is None:
        return jsonify({"error": "Not found"}), 404

    data = body()
    fields, args = [], []

    if "title" in data:
        title = (data.get("title") or "").strip()[:TITLE_MAX]
        if not title:
            return jsonify({"error": "An idea needs a title."}), 400
        fields.append("title = ?")
        args.append(title)

    if "body" in data:
        fields.append("body = ?")
        args.append((data.get("body") or "")[:BODY_MAX])

    if "status" in data:
        status = (data.get("status") or "").lower()
        if status not in STATUSES:
            return jsonify({"error": "Unknown status."}), 400
        fields.append("status = ?")
        args.append(status)

    for key in ("impact", "effort"):
        if key in data:
            val = data.get(key)
            if val is not None:
                try:
                    val = max(1, min(5, int(val)))
                except (TypeError, ValueError):
                    return jsonify({"error": f"{key} must be 1-5."}), 400
            fields.append(f"{key} = ?")
            args.append(val)

    if "archived" in data:
        fields.append("archived_at = ?")
        args.append(utcnow() if data.get("archived") else None)

    if fields:
        fields.append("updated_at = ?")
        args.append(utcnow())
        args.extend([idea_id, current_user()["id"]])
        execute(
            f"UPDATE ideas SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            tuple(args),
        )

    if "tags" in data:
        set_idea_tags(current_user()["id"], idea_id, clean_tags(data.get("tags")))

    row = query("SELECT * FROM ideas WHERE id = ?", (idea_id,), one=True)
    return jsonify({"idea": idea_json(row, tags_for([idea_id]).get(idea_id, []))}), 200


@app.delete("/api/ideas/<int:idea_id>")
@login_required
def delete_idea(idea_id):
    row = owned_idea(idea_id)
    if row is None:
        return jsonify({"error": "Not found"}), 404
    user_id = current_user()["id"]
    execute("DELETE FROM ideas WHERE id = ? AND user_id = ?", (idea_id, user_id))
    execute(
        "DELETE FROM tags WHERE user_id = ? AND id NOT IN (SELECT tag_id FROM idea_tags)",
        (user_id,),
    )
    return jsonify({"ok": True}), 200


@app.post("/api/ideas/<int:idea_id>/share")
@login_required
def share_idea(idea_id):
    row = owned_idea(idea_id)
    if row is None:
        return jsonify({"error": "Not found"}), 404

    if body().get("public"):
        slug = row["public_slug"] or secrets.token_urlsafe(9)
    else:
        slug = None
    execute(
        "UPDATE ideas SET public_slug = ? WHERE id = ? AND user_id = ?",
        (slug, idea_id, current_user()["id"]),
    )
    return jsonify({"public_slug": slug}), 200


@app.get("/api/tags")
@login_required
def list_tags():
    rows = query(
        "SELECT t.name, COUNT(it.idea_id) AS n FROM tags t"
        " JOIN idea_tags it ON it.tag_id = t.id"
        " JOIN ideas i ON i.id = it.idea_id AND i.archived_at IS NULL"
        " WHERE t.user_id = ? GROUP BY t.id ORDER BY n DESC, t.name",
        (current_user()["id"],),
    )
    return jsonify({"tags": [{"name": r["name"], "count": r["n"]} for r in rows]}), 200


@app.post("/api/capture")
@token_required
def capture():
    """Token-authed quick capture for CLI, ntfy, or the deck dashboard."""
    data = body()
    if not data and request.data:
        data = {"title": request.data.decode("utf-8", "replace")}
    idea_id, problem = _create_idea(
        g.user["id"],
        data.get("title"),
        data.get("body") or "",
        (data.get("status") or "spark").lower(),
        clean_tags(data.get("tags")),
    )
    if problem:
        return jsonify({"error": problem}), 400
    return jsonify({"ok": True, "id": idea_id}), 201


# ── Public share view ────────────────────────────────────
@app.get("/api/public/<slug>")
def public_idea(slug):
    """No auth. Returns one idea and nothing that identifies the owner's board."""
    row = query(
        "SELECT * FROM ideas WHERE public_slug = ? AND archived_at IS NULL",
        (slug,),
        one=True,
    )
    if row is None:
        return jsonify({"error": "Not found"}), 404
    owner = query(
        "SELECT display_name FROM users WHERE id = ?", (row["user_id"],), one=True
    )
    return jsonify(
        {
            "idea": {
                "title": row["title"],
                "body": row["body"],
                "status": row["status"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "tags": tags_for([row["id"]]).get(row["id"], []),
            },
            "author": (owner["display_name"] if owner else "") or "",
        }
    ), 200


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "ideas"}), 200


# ── SPA ──────────────────────────────────────────────────
@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path):
    """Serve built assets; fall back to index.html so deep links survive reload."""
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404

    candidate = (DIST / path).resolve()
    # Containment check — never serve outside dist/ via a crafted path.
    if path and str(candidate).startswith(str(DIST.resolve())) and candidate.is_file():
        return send_from_directory(DIST, path)

    index = DIST / "index.html"
    if not index.is_file():
        return (
            "<pre>Frontend not built.\n\n"
            "  cd ideas/web\n  npm install\n  npm run build</pre>",
            503,
        )
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    init_db()
    print(f"ideas: db={os.environ.get('IDEAS_DB', '~/ideas.db')} signup={SIGNUP_MODE} dev={DEV}")
    app.run(host="0.0.0.0", port=PORT, debug=DEV)
