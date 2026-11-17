"""
Storage for the PhoneBox-style panel (/panel): the layout config, values
pushed by webhooks, and the short-lived event ring (notifies, page switches).

Kept out of webhook_new.py so it can be tested without a .env, the same
split as service_registry.py. The live files sit outside the repo (~/panel.json,
~/panel-push.json) so a `git pull` on the phone never clobbers edits made in
the control panel; panel/layout.default.json seeds the first run.

Everything is read fresh per call, like services.json — no caching, no restart.
"""

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

PANEL_DIR = Path(__file__).resolve().parent / "panel"
DEFAULT_LAYOUT = PANEL_DIR / "layout.default.json"
WIDGETS_PATH = PANEL_DIR / "widgets.json"
TEMPLATES_PATH = PANEL_DIR / "templates.json"

COLS, ROWS = 12, 6
# What a shortcut may do. Deliberately no "shell" kind: commands stay
# hand-edited in actions.json, so the editor (and so the token) can only
# pick from what is already whitelisted. See docs/panel.md.
SHORTCUT_KINDS = {
    "action", "pc_app", "service_restart", "service_stop",
    "feed", "spotify", "goto", "push", "url",
}
SPOTIFY_REFS = {"play", "pause", "toggle", "next", "previous"}
LEVELS = {"ok", "warn", "error", "info"}
ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")

_lock = threading.Lock()


def panel_path() -> Path:
    return Path(os.path.expanduser(os.environ.get("PANEL_PATH", "~/panel.json")))


def push_path() -> Path:
    return Path(os.path.expanduser(os.environ.get("PANEL_PUSH_PATH", "~/panel-push.json")))


def _read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def _write_json(path: Path, data) -> None:
    """Atomic write: a crash mid-save never leaves half a layout."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def load_widgets() -> list[dict]:
    return _read_json(WIDGETS_PATH, [])


def load_templates() -> list[dict]:
    return _read_json(TEMPLATES_PATH, [])


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def _fill_ids(cfg: dict) -> dict:
    """Templates and the default layout carry no widget ids; give them some."""
    for page in cfg.get("pages", []):
        for w in page.get("widgets", []):
            w.setdefault("id", _new_id())
            w.setdefault("options", {})
    return cfg


def load_config() -> dict:
    path = panel_path()
    with _lock:
        if not path.is_file():
            cfg = _fill_ids(_read_json(DEFAULT_LAYOUT, {"rev": 0, "pages": [], "shortcuts": []}))
            cfg["rev"] = 1
            _write_json(path, cfg)
            return cfg
    cfg = _read_json(path, None)
    if not isinstance(cfg, dict):
        raise ValueError(f"{path} is not valid JSON — fix it or delete it to reseed")
    return cfg


class ConfigError(ValueError):
    pass


class StaleRevision(Exception):
    def __init__(self, current: int):
        super().__init__(f"layout changed elsewhere (now rev {current})")
        self.current = current


def _int(v, name: str) -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        raise ConfigError(f"{name} must be an integer")
    return v


def validate(cfg: dict) -> None:
    """Raise ConfigError with a message the editor can show as-is."""
    if not isinstance(cfg, dict):
        raise ConfigError("config must be an object")
    pages = cfg.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ConfigError("there must be at least one page")
    catalog = {w["type"]: w for w in load_widgets()}

    page_ids = set()
    for p in pages:
        pid = p.get("id")
        if not isinstance(pid, str) or not ID_RE.match(pid):
            raise ConfigError(f"page id {pid!r} must be 1-64 letters, digits, '_', '.' or '-'")
        if pid in page_ids:
            raise ConfigError(f"two pages share the id {pid!r}")
        page_ids.add(pid)
        title = p.get("title", "")
        if not isinstance(title, str) or len(title) > 40:
            raise ConfigError(f"page {pid}: title must be text up to 40 characters")

        cells: dict[tuple[int, int], str] = {}
        widget_ids = set()
        for w in p.get("widgets", []):
            wid = w.get("id")
            if not isinstance(wid, str) or not ID_RE.match(wid) or wid in widget_ids:
                raise ConfigError(f"page {pid}: widget id {wid!r} is missing or repeated")
            widget_ids.add(wid)
            spec = catalog.get(w.get("type"))
            if spec is None:
                raise ConfigError(f"page {pid}: unknown widget type {w.get('type')!r}")
            x, y = _int(w.get("x"), "x"), _int(w.get("y"), "y")
            ww, hh = _int(w.get("w"), "w"), _int(w.get("h"), "h")
            if ww < spec.get("minW", 1) or hh < spec.get("minH", 1):
                raise ConfigError(f"page {pid}: {spec['name']} is smaller than its minimum size")
            if x < 0 or y < 0 or x + ww > COLS or y + hh > ROWS:
                raise ConfigError(f"page {pid}: {spec['name']} falls outside the {COLS}×{ROWS} grid")
            if not isinstance(w.get("options", {}), dict):
                raise ConfigError(f"page {pid}: {spec['name']} options must be an object")
            for cx in range(x, x + ww):
                for cy in range(y, y + hh):
                    if (cx, cy) in cells:
                        raise ConfigError(
                            f"page {pid}: {spec['name']} overlaps {cells[(cx, cy)]} at column {cx}, row {cy}"
                        )
                    cells[(cx, cy)] = spec["name"]

    key_ids = set()
    for k in cfg.get("shortcuts", []):
        kid = k.get("id")
        if not isinstance(kid, str) or not ID_RE.match(kid) or kid in key_ids:
            raise ConfigError(f"shortcut id {kid!r} is missing or repeated")
        key_ids.add(kid)
        do = k.get("do") or {}
        kind = do.get("kind")
        if kind not in SHORTCUT_KINDS:
            raise ConfigError(f"shortcut {kid}: unknown action kind {kind!r}")
        ref = do.get("ref", "")
        if not isinstance(ref, str):
            raise ConfigError(f"shortcut {kid}: ref must be text")
        if kind == "spotify" and ref not in SPOTIFY_REFS:
            raise ConfigError(f"shortcut {kid}: spotify op must be one of {sorted(SPOTIFY_REFS)}")
        if kind == "goto" and ref not in page_ids:
            raise ConfigError(f"shortcut {kid}: no page {ref!r}")
        if kind == "url" and not re.match(r"^https?://", ref):
            raise ConfigError(f"shortcut {kid}: URL must start with http:// or https://")
        if kind == "push" and not ID_RE.match(ref):
            raise ConfigError(f"shortcut {kid}: push key must be 1-64 letters, digits, '_', '.' or '-'")
        if kind in ("action", "pc_app", "service_restart", "service_stop") and not ref:
            raise ConfigError(f"shortcut {kid}: pick what it runs")

    home = cfg.get("home")
    if home is not None and home not in page_ids:
        raise ConfigError(f"home page {home!r} does not exist")


def save_config(cfg: dict, base_rev) -> dict:
    """Validate, check the editor saw the latest revision, bump rev, write."""
    validate(cfg)
    with _lock:
        current = _read_json(panel_path(), {}).get("rev", 0)
        if base_rev is not None and base_rev != current:
            raise StaleRevision(current)
        cfg = dict(cfg)
        cfg["rev"] = current + 1
        _write_json(panel_path(), cfg)
    return cfg


def find_page(cfg: dict, ref: str) -> dict | None:
    """By id, or by 1-based number among all pages."""
    pages = cfg.get("pages", [])
    for p in pages:
        if p.get("id") == ref:
            return p
    if ref.isdigit() and 1 <= int(ref) <= len(pages):
        return pages[int(ref) - 1]
    return None


def find_shortcut(cfg: dict, kid: str) -> dict | None:
    for k in cfg.get("shortcuts", []):
        if k.get("id") == kid:
            return k
    return None


# ── Pushed values ─────────────────────────────────────────
PUSH_FIELDS = ("value", "title", "sub", "unit", "icon", "color", "level", "progress", "items")


def _coerce(text: str):
    text = text.strip()
    try:
        n = float(text)
        return int(n) if n.is_integer() and "." not in text else n
    except ValueError:
        return text


def normalize_push(body, raw_text: str, ttl) -> dict:
    """Plain text, a number, or {value,title,sub,unit,icon,color,level,progress,items}."""
    if isinstance(body, dict):
        entry = {k: body[k] for k in PUSH_FIELDS if k in body}
        ttl = body.get("ttl", ttl)
    elif body is not None:
        entry = {"value": body}
    else:
        entry = {"value": _coerce(raw_text)}
    if "level" in entry and entry["level"] not in LEVELS:
        entry.pop("level")
    if "progress" in entry:
        try:
            p = float(entry["progress"])
            entry["progress"] = p / 100 if p > 1 else max(0.0, p)
        except (TypeError, ValueError):
            entry.pop("progress")
    entry["ts"] = time.time()
    if ttl not in (None, ""):
        try:
            entry["expires"] = time.time() + max(1.0, float(ttl))
        except (TypeError, ValueError):
            raise ConfigError("ttl must be a number of seconds")
    return entry


def load_pushes() -> dict:
    data = _read_json(push_path(), {})
    now = time.time()
    return {k: v for k, v in data.items() if not v.get("expires") or v["expires"] > now}


def set_push(key: str, entry: dict) -> None:
    if not ID_RE.match(key):
        raise ConfigError("key must be 1-64 letters, digits, '_', '.' or '-'")
    with _lock:
        data = load_pushes()
        data[key] = entry
        _write_json(push_path(), data)


def delete_push(key: str) -> bool:
    with _lock:
        data = load_pushes()
        found = data.pop(key, None) is not None
        _write_json(push_path(), data)
    return found


# ── Event ring (notify / goto) ────────────────────────────
# In memory on purpose: a page switch or toast from before a restart is stale.
# `boot` changes per process so the panel can tell a restart from "no news".
BOOT = _new_id()
_events: list[dict] = []
_seq = 0
EVENT_KEEP = 50


def add_event(kind: str, **fields) -> dict:
    global _seq
    with _lock:
        _seq += 1
        ev = {"seq": _seq, "kind": kind, "ts": time.time(), **fields}
        _events.append(ev)
        del _events[:-EVENT_KEEP]
    return ev


def events_since(since: int) -> dict:
    with _lock:
        return {"boot": BOOT, "seq": _seq, "events": [e for e in _events if e["seq"] > since]}


def normalize_notify(body, raw_text: str) -> dict:
    if not isinstance(body, dict):
        body = {"text": body if body is not None else raw_text.strip()}
    out = {
        "title": str(body.get("title", ""))[:120],
        "text": str(body.get("text", body.get("message", "")))[:500],
        "level": body.get("level") if body.get("level") in LEVELS else "info",
    }
    if not out["title"] and not out["text"]:
        raise ConfigError("a notification needs a title or text")
    try:
        out["seconds"] = max(1.0, min(60.0, float(body.get("seconds", 5))))
    except (TypeError, ValueError):
        out["seconds"] = 5.0
    if body.get("page"):
        out["page"] = str(body["page"])
    return out
