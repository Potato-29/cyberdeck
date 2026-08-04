#!/usr/bin/env python3
"""
Cyberdeck Weekly Standup
Daily "what did you do?" nudge, append-only log, Friday draft generator.

Registered as a Flask blueprint by webhook_new.py. Can also run standalone
on port 2123 for local testing:  python3 standup.py
"""

import json
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path

import requests
from flask import Blueprint, jsonify, request, send_file

bp = Blueprint("standup", __name__)


# ── Env ──────────────────────────────────────────────────
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


_here = Path(__file__).resolve().parent
load_env_file(_here / ".env")

SECRET = os.environ.get("WEBHOOK_TOKEN", "")
LOG_FILE = Path(os.path.expanduser(
    os.environ.get("STANDUP_FILE", "~/standup-log.jsonl")
))
CACHE_FILE = LOG_FILE.with_name("standup-weekly-cache.json")
RESTART_URL = os.environ.get("RESTART_URL", "").rstrip("/")
COMPANY_VALUES = os.environ.get("STANDUP_VALUES", "")

# Groq's free tier, via its OpenAI-compatible endpoint — no SDK to install.
# Model IDs get retired periodically; STANDUP_MODEL lets you swap without a redeploy.
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL = os.environ.get(
    "GROQ_URL", "https://api.groq.com/openai/v1/chat/completions"
)
STANDUP_MODEL = os.environ.get("STANDUP_MODEL", "llama-3.3-70b-versatile")

# JSON publishing posts to the server root with the topic in the body, so the
# base and topic are kept apart rather than joined into one URL.
NTFY_BASE = os.environ.get("NTFY_URL", "").rstrip("/")
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
NTFY_USER = os.environ.get("NTFY_USER", "")
NTFY_PASS = os.environ.get("NTFY_PASS", "")

# The five sections of the Friday thread reply, in order.
SECTIONS = [
    ("progress", "The Progress",
     "What did you work on this week - any key wins or learnings?"),
    ("ai_edge", "The AI Edge",
     "How did you use AI (automated, optimized, researched) this week? "
     "Anything that you learnt?"),
    ("automation_gap", "The Automation Gap",
     "What part of your workflow still feels \"manual\" and should be automated? "
     "(Where do you need help/tools?)"),
    ("values", "Values in Action",
     "Which company value did you see in action this week (in yourself or a peer)?"),
    ("horizon", "The Horizon", "What are the big rocks for next week?"),
]

# Tag a note as you write it so Friday's draft lands it in the right section.
TAGS = {
    "progress": "progress",
    "ai": "ai_edge",
    "gap": "automation_gap",
    "values": "values",
    "next": "horizon",
}


# ── Storage ──────────────────────────────────────────────
def _now():
    return datetime.now().astimezone()


def week_start(when=None):
    """Monday 00:00 of the week containing `when` (local time)."""
    when = when or _now()
    monday = when - timedelta(days=when.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def read_entries(since=None):
    if not LOG_FILE.is_file():
        return []
    entries = []
    with LOG_FILE.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entry["_dt"] = datetime.fromisoformat(entry["ts"])
            except (ValueError, KeyError):
                continue  # skip a corrupt line rather than lose the log
            if since and entry["_dt"] < since:
                continue
            entries.append(entry)
    entries.sort(key=lambda e: e["_dt"])
    return entries


def append_entry(text, tag):
    entry = {
        "id": secrets.token_hex(4),
        "ts": _now().isoformat(timespec="seconds"),
        "tag": tag if tag in TAGS else "progress",
        "text": text.strip(),
    }
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def delete_entry(entry_id):
    if not LOG_FILE.is_file():
        return False
    kept, removed = [], False
    with LOG_FILE.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                if json.loads(line).get("id") == entry_id:
                    removed = True
                    continue
            except ValueError:
                pass
            kept.append(line if line.endswith("\n") else line + "\n")
    if removed:
        LOG_FILE.write_text("".join(kept), encoding="utf-8")
    return removed


def _public(entry):
    return {k: v for k, v in entry.items() if not k.startswith("_")}


# ── ntfy ─────────────────────────────────────────────────
# ntfy's JSON priorities are 1-5; the header API uses these names.
PRIORITIES = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5, "urgent": 5}


def push(message, title, priority="default", click=None, action_label=None):
    """Publish via ntfy's JSON endpoint.

    Everything travels in the body rather than in headers: HTTP headers are
    latin-1 only, so an emoji in the title raises UnicodeEncodeError before the
    request ever leaves the process.
    """
    if not NTFY_BASE or not NTFY_TOPIC:
        return False

    payload = {
        "topic": NTFY_TOPIC,
        "title": title,
        "message": message,
        "priority": PRIORITIES.get(priority, 3),
    }
    if click:
        payload["click"] = click
        payload["actions"] = [{
            "action": "view",
            "label": action_label or "Open",
            "url": click,
            "clear": True,
        }]

    try:
        resp = requests.post(
            NTFY_BASE,
            json=payload,
            auth=(NTFY_USER, NTFY_PASS),
            timeout=5,
        )
        if resp.status_code >= 400:
            print(f"[standup] ntfy {resp.status_code}: {resp.text[:200]}")
            return False
        return True
    except Exception as exc:  # never let a failed notification 500 the caller
        print(f"[standup] ntfy failed: {exc}")
        return False


def standup_link(path="/standup", fragment=""):
    # The fragment has to trail the query string, or the browser swallows the token.
    if not RESTART_URL:
        return ""
    suffix = f"#{fragment}" if fragment else ""
    return f"{RESTART_URL}{path}?token={SECRET}{suffix}"


# ── Draft generation ─────────────────────────────────────
def format_entries(entries):
    """Entries as a day-grouped markdown list — the model's only input."""
    if not entries:
        return "(no entries logged)"
    lines, current_day = [], None
    for entry in entries:
        day = entry["_dt"].strftime("%A %Y-%m-%d")
        if day != current_day:
            lines.append(f"\n## {day}")
            current_day = day
        lines.append(f"- [{entry['tag']}] {entry['text']}")
    return "\n".join(lines).strip()


def _bulletize(text):
    """Normalize a section's answer into one '- ' bullet per line.

    Handles plain sentences, text the model already bulleted (possibly with a
    different marker), and empty answers alike, so every section renders the
    same way regardless of where its text came from.
    """
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return "- —"
    out = []
    for ln in lines:
        for marker in ("- ", "* ", "• "):
            if ln.startswith(marker):
                ln = ln[len(marker):].strip()
                break
        out.append(f"- {ln}")
    return "\n".join(out)


def render(sections):
    """Assemble the final Slack-ready message from the five answers."""
    out = []
    for idx, (key, label, _) in enumerate(SECTIONS, start=1):
        out.append(f"{idx}. {label}:\n{_bulletize(sections.get(key))}")
    return "\n\n".join(out)


def generate_fallback(entries):
    """No API key / SDK — group the raw notes under their sections."""
    buckets = {key: [] for key, _, _ in SECTIONS}
    for entry in entries:
        buckets[TAGS.get(entry["tag"], "progress")].append(entry["text"])
    sections = {key: "\n".join(items) for key, items in buckets.items()}
    return render(sections)


def _extract_json(raw):
    """Pull the JSON object out of a reply that may be fenced or prefaced."""
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except ValueError:
        return None


def generate_with_groq(entries):
    """Synthesize the week's notes into the five answers. Returns None on failure."""
    if not GROQ_KEY:
        return None

    questions = "\n".join(
        f"{i}. {label}: {q}" for i, (_, label, q) in enumerate(SECTIONS, start=1)
    )
    values_note = (
        f"The company values are: {COMPANY_VALUES}. Name one of them exactly."
        if COMPANY_VALUES else
        "The company values were not provided, so describe the value you saw in "
        "action in plain words rather than naming an official one."
    )

    prompt = f"""Here are my raw work notes from this week, logged day by day:

{format_entries(entries)}

Turn them into my weekly update for the team Slack thread. The five questions are:

{questions}

Rules:
- Write in first person, the way I'd type it into Slack. Plain language, no
  corporate filler, no emoji, no bold.
- Format every answer as bullet points, not paragraphs: one line per point, each
  starting with "- ". One item logged means one bullet; several related items can
  be one bullet each or combined into one if they're genuinely the same thing.
- Ground every bullet in the notes above. Do not invent work I didn't log.
- The [tag] on each note says which section I meant it for, but use your judgement
  if a note clearly fits somewhere else too.
- {values_note}
- If a section has nothing to draw on, say so in a single honest bullet rather
  than padding it out.

Reply with a JSON object and nothing else. It must have exactly these five string
keys, each holding that question's answer as newline-separated "- " bullet points:
{", ".join(key for key, _, _ in SECTIONS)}"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": STANDUP_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                # JSON mode is supported across Groq's chat models; the key names
                # are pinned by the prompt since it enforces syntax, not shape.
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
                "max_tokens": 2000,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[standup] groq {resp.status_code}: {resp.text[:300]}")
            return None
        content = resp.json()["choices"][0]["message"]["content"]
    except (requests.exceptions.RequestException, ValueError, KeyError,
            IndexError) as exc:
        print(f"[standup] groq request failed: {exc}")
        return None

    sections = _extract_json(content)
    if not isinstance(sections, dict):
        print(f"[standup] unparseable reply: {content[:300]}")
        return None
    if not any(str(sections.get(k, "")).strip() for k, _, _ in SECTIONS):
        print("[standup] reply had none of the expected keys")
        return None
    return render({k: str(sections.get(k, "")) for k, _, _ in SECTIONS})


def _load_draft_cache():
    """Drafts keyed by ISO week ("2026-W05"), so past weeks survive the rollover."""
    if not CACHE_FILE.is_file():
        return {}
    try:
        data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    if "week" in data:  # migrate the old single-draft cache format
        return {data["week"]: data}
    return data


def _save_draft_cache(cache):
    try:
        CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
    except OSError:
        pass


def build_draft(refresh=False):
    """Draft for the current week, cached so re-opening the page is free.

    A fresh week starts with zero entries, so opening the page right after the
    week rolls over (e.g. the weekend after Friday's push) must not blow away
    the last completed week's draft with an empty one - fall back to the most
    recently cached week until this one actually has notes in it.
    """
    start = week_start()
    key = start.strftime("%G-W%V")
    cache = _load_draft_cache()

    if not refresh and key in cache:
        return cache[key]

    entries = read_entries(since=start)

    if not refresh and not entries and cache:
        latest_key = max(cache)
        if latest_key != key:
            return cache[latest_key]

    text = generate_with_groq(entries)
    result = {
        "week": key,
        "week_start": start.date().isoformat(),
        "entry_count": len(entries),
        "generated_by": STANDUP_MODEL if text else "template",
        "generated_at": _now().isoformat(timespec="seconds"),
        "text": text or generate_fallback(entries),
    }
    cache[key] = result
    _save_draft_cache(cache)
    return result


# ── Routes ───────────────────────────────────────────────
def _authorized(req):
    token = req.args.get("token") or req.headers.get("X-Token")
    return bool(SECRET) and token == SECRET


def _guard():
    if not _authorized(request):
        return jsonify({"error": "Unauthorized"}), 401
    return None


@bp.route("/standup", methods=["GET"])
def standup_page():
    denied = _guard()
    if denied:
        return denied
    html_path = _here / "standup.html"
    if html_path.exists():
        return send_file(str(html_path))
    return jsonify({"error": "standup.html not found"}), 404


@bp.route("/standup/entries", methods=["GET"])
def standup_entries():
    denied = _guard()
    if denied:
        return denied
    try:
        days = int(request.args.get("days", "0"))
    except ValueError:
        days = 0
    since = _now() - timedelta(days=days) if days > 0 else week_start()
    entries = read_entries(since=since)
    return jsonify({
        "week_start": week_start().date().isoformat(),
        "today": _now().date().isoformat(),
        "tags": list(TAGS),
        "entries": [_public(e) for e in entries],
    }), 200


@bp.route("/standup/log", methods=["POST"])
def standup_log():
    denied = _guard()
    if denied:
        return denied
    payload = request.get_json(silent=True) or request.form or {}
    text = (payload.get("text") or request.args.get("text") or "").strip()
    tag = (payload.get("tag") or request.args.get("tag") or "progress").strip()
    if not text:
        return jsonify({"error": "Missing 'text'"}), 400
    entry = append_entry(text, tag)
    return jsonify({"status": "ok", "entry": entry}), 200


@bp.route("/standup/delete", methods=["POST"])
def standup_delete():
    denied = _guard()
    if denied:
        return denied
    payload = request.get_json(silent=True) or request.form or {}
    entry_id = payload.get("id") or request.args.get("id")
    if not entry_id:
        return jsonify({"error": "Missing 'id'"}), 400
    if delete_entry(entry_id):
        return jsonify({"status": "deleted"}), 200
    return jsonify({"error": "Not found"}), 404


@bp.route("/standup/weekly", methods=["GET"])
def standup_weekly():
    denied = _guard()
    if denied:
        return denied
    refresh = request.args.get("refresh") in ("1", "true", "yes")
    return jsonify(build_draft(refresh=refresh)), 200


@bp.route("/standup/nudge", methods=["GET", "POST"])
def standup_nudge():
    """Daily 'what did you do today?' push. Called by cron."""
    denied = _guard()
    if denied:
        return denied
    today = _now().date()
    logged = [e for e in read_entries(since=week_start()) if e["_dt"].date() == today]
    if logged:
        message = (f"{len(logged)} logged today. Anything else before you clock off?")
        priority = "low"
    else:
        message = "Nothing logged today. What did you work on?"
        priority = "default"
    sent = push(
        message,
        title="📝 Daily standup",
        priority=priority,
        click=standup_link("/standup"),
        action_label="Log it",
    )
    return jsonify({"status": "ok" if sent else "ntfy-failed",
                    "logged_today": len(logged)}), 200


@bp.route("/standup/friday", methods=["GET", "POST"])
def standup_friday():
    """Generate the week's draft and push it. Called by cron on Friday."""
    denied = _guard()
    if denied:
        return denied
    draft = build_draft(refresh=True)
    push(
        f"{draft['entry_count']} entries this week. Draft is ready to copy.",
        title="🗓️ Weekly update ready",
        priority="high",
        click=standup_link("/standup", fragment="weekly"),
        action_label="Open draft",
    )
    return jsonify(draft), 200


# ── Standalone mode (testing off-device) ─────────────────
if __name__ == "__main__":
    from flask import Flask

    app = Flask(__name__)
    app.register_blueprint(bp)
    app.run(host="0.0.0.0", port=2123, debug=False)
