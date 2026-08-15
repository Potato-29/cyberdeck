"""Work log routing for the desk buddy.

Turns "hey jarvis, the migration rollback needs a dry-run flag" into a note in
the work log instead of a question for the LLM.

The hook is a single branch in broker.run_turn(): once Whisper has produced a
transcript, classify() decides whether this utterance belongs to the work log.
If it does, we handle it here and speak a short confirmation; if not, the
transcript falls through to the assistant exactly as before.

Deskbuddy has already transcribed by this point, so nothing here touches audio —
the work log only ever receives text. The work log's streaming-audio endpoint is
for a future direct-from-device path and is unused by this flow.

Networking note: this runs inside proot while the work log runs in Termux.
proot-distro does not create a network namespace, so 127.0.0.1 is shared between
them — the same reason PULSE_SERVER=tcp:127.0.0.1:4713 already works for
playback (services.json).

Blocking `requests` throughout, like the rest of broker.py. Callers run these in
an executor so the event loop keeps serving the mic.
"""

import json
import os

import requests

# Config is read at import time, so this module must be imported AFTER
# load_env_file() in broker.py — same deferred-import rule as standup.py.
ENABLED = os.environ.get("BUDDY_WORKLOG", "1").lower() not in ("0", "false", "no", "")
WORKLOG_URL = os.environ.get("WORKLOG_URL", "http://127.0.0.1:2127").rstrip("/")
TOKEN = os.environ.get("WEBHOOK_TOKEN", "")

GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = os.environ.get("GROQ_BASE", "https://api.groq.com/openai/v1")
# A small, fast model: this runs on every turn and only has to pick a label, so
# the 70b used for replies would add latency for no benefit. Env-swappable
# because Groq retires model IDs.
INTENT_MODEL = os.environ.get("BUDDY_INTENT_MODEL", "llama-3.1-8b-instant")

INTENTS = ("note", "question", "switch", "breadcrumb", "recall")

# Short on purpose — every word here is TTS latency before you can talk again.
_QUESTION_WORDS = (
    "what", "how", "why", "when", "who", "where is", "which", "can you",
    "tell me", "search", "look up", "explain", "is it", "are there", "do you",
)
_NOTE_VERBS = ("log ", "log:", "note ", "note:", "jot ", "make a note", "write down")
_CRUMB_VERBS = ("breadcrumb", "i stopped", "i'm stopping", "im stopping",
                "picking up", "leaving off", "left off")
_RECALL_PHRASES = ("where was i", "where were we", "what was i doing",
                   "what were we doing", "where did i stop", "catch me up")
_SWITCH_VERBS = ("switch to", "switch context", "working on", "move to",
                 "change to", "context ")


# ── HTTP helpers ────────────────────────────────────────────────────────────
def _get(path, params=None):
    params = dict(params or {})
    params["token"] = TOKEN
    resp = requests.get(f"{WORKLOG_URL}{path}", params=params, timeout=8)
    resp.raise_for_status()
    return resp.json()


def _post(path, payload=None):
    resp = requests.post(
        f"{WORKLOG_URL}{path}",
        params={"token": TOKEN},
        json=payload if payload is not None else {},
        timeout=8,
    )
    resp.raise_for_status()
    return resp.json() if resp.content else {}


def contexts():
    return _get("/api/contexts").get("contexts", [])


# ── Intent ──────────────────────────────────────────────────────────────────
def _heuristic(text):
    """Local fallback for when the classifier is unreachable.

    Biased toward `note`: if the classifier is down, Groq is usually down, which
    means the assistant would fail anyway. Filing a stray question as a note is
    visible in Today and one tap to delete; silently dropping a note you spoke
    is the failure that kills the habit.
    """
    low = text.strip().lower()
    if any(p in low for p in _RECALL_PHRASES):
        return {"intent": "recall", "text": "", "context": ""}
    if low.startswith(_CRUMB_VERBS) or any(v in low for v in _CRUMB_VERBS):
        return {"intent": "breadcrumb", "text": text, "context": ""}
    if any(low.startswith(v) for v in _SWITCH_VERBS):
        for verb in _SWITCH_VERBS:
            if low.startswith(verb):
                return {"intent": "switch", "text": "", "context": low[len(verb):].strip()}
    if any(low.startswith(v) for v in _NOTE_VERBS):
        for verb in _NOTE_VERBS:
            if low.startswith(verb):
                body = text[len(verb):].strip()
                # "log that I fixed X" -> "I fixed X"; the LLM router does this
                # itself, so this only tidies the offline fallback.
                for lead in ("that ", "this ", "down that "):
                    if body.lower().startswith(lead):
                        body = body[len(lead):].strip()
                        break
                return {"intent": "note", "text": body or text, "context": ""}
    if low.endswith("?") or low.startswith(_QUESTION_WORDS):
        return {"intent": "question", "text": "", "context": ""}
    return {"intent": "note", "text": text, "context": ""}


def classify(text, context_names):
    """Ask Groq what this utterance is. Falls back to _heuristic on any failure."""
    if not GROQ_KEY:
        return _heuristic(text)

    known = ", ".join(context_names) if context_names else "(none defined)"
    prompt = f"""You route one spoken utterance from a desk voice assistant. Pick what the speaker wants.

Intents:
- note: recording something that happened, was fixed, broke, was decided, or was learned. This is the default for any statement about their own work.
- question: asking the assistant something, or asking it to do something. Anything that expects a spoken answer.
- switch: changing which project they are working on now.
- breadcrumb: saying where they are stopping or what they are mid-way through, so they can resume later.
- recall: asking where they left off or what they were doing.

Their project contexts are: {known}

Utterance: "{text}"

Reply with a JSON object and nothing else, with exactly these three string keys:
- "intent": one of note, question, switch, breadcrumb, recall
- "text": for note and breadcrumb, what to store — strip the command verb ("log that", "note", "make a note") and leave a plain statement in their own words. Empty string otherwise.
- "context": for switch, the closest match from the context list above, copied exactly. Empty string otherwise."""

    try:
        resp = requests.post(
            f"{GROQ_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": INTENT_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0,       # routing should not be creative
                "max_tokens": 200,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            print(f"[worklog] intent {resp.status_code}: {resp.text[:200]}")
            return _heuristic(text)
        raw = resp.json()["choices"][0]["message"]["content"]
        start, end = raw.find("{"), raw.rfind("}")
        data = json.loads(raw[start:end + 1]) if start != -1 and end > start else {}
    except (requests.exceptions.RequestException, ValueError, KeyError,
            IndexError) as exc:
        print(f"[worklog] intent failed: {exc}")
        return _heuristic(text)

    intent = str(data.get("intent", "")).strip().lower()
    if intent not in INTENTS:
        return _heuristic(text)
    return {
        "intent": intent,
        "text": str(data.get("text") or "").strip() or text,
        "context": str(data.get("context") or "").strip(),
    }


# ── Actions ─────────────────────────────────────────────────────────────────
def _match_context(name, ctxs):
    """Loose name match — Whisper will not spell your context names reliably."""
    if not name:
        return None
    low = name.strip().lower()
    for c in ctxs:
        if c["name"].lower() == low:
            return c
    for c in ctxs:
        if c["name"].lower() in low or low in c["name"].lower():
            return c
    return None


def handle(text):
    """Route one transcript. Returns a line to speak, or None to fall through
    to the assistant. Never raises — a broken work log must not break jarvis."""
    if not ENABLED or not text.strip():
        return None
    if not TOKEN:
        print("[worklog] WEBHOOK_TOKEN unset; not routing")
        return None

    try:
        ctxs = contexts()
    except requests.exceptions.RequestException as exc:
        print(f"[worklog] unreachable: {exc}")
        return None

    names = [c["name"] for c in ctxs]
    result = classify(text, names)
    intent = result["intent"]
    print(f"[worklog] intent={intent} for {text!r}")

    if intent == "question":
        return None

    try:
        active = next((c for c in ctxs if c.get("is_active")), None)

        if intent == "note":
            note = _post("/api/notes", {"text": result["text"], "source": "voice"})
            where = note.get("context_name") or "the log"
            return f"Logged to {where}."

        if intent == "breadcrumb":
            if not active:
                return "No active context to leave a breadcrumb on."
            _post(f"/api/contexts/{active['id']}/breadcrumb", {"text": result["text"]})
            return f"Breadcrumb saved on {active['name']}."

        if intent == "switch":
            target = _match_context(result["context"], ctxs)
            if not target:
                return f"I don't have a context called {result['context'] or 'that'}."
            data = _post(f"/api/contexts/{target['id']}/switch")
            crumb = (data.get("breadcrumb") or {}).get("text")
            if crumb:
                return f"Switched to {target['name']}. You stopped at: {crumb}"
            return f"Switched to {target['name']}. No breadcrumb yet."

        if intent == "recall":
            if not active:
                return "Nothing is active right now."
            crumb = active.get("last_breadcrumb")
            if not crumb:
                return f"You're on {active['name']}, but there's no breadcrumb."
            return f"On {active['name']}. You stopped at: {crumb['text']}"

    except requests.exceptions.RequestException as exc:
        print(f"[worklog] action failed: {exc}")
        return "The work log didn't answer."

    return None
