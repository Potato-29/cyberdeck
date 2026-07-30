#!/usr/bin/env python3
"""
Cyberdeck PC Deck Agent
Runs on the Windows PC. Launches whitelisted apps on request from the phone's
webhook server, and reports which ones are currently running.

Whitelist only — this agent never executes arbitrary commands. Apps are defined
in deck-apps.json next to this file.

IMPORTANT: run this as your logged-in user (Task Scheduler -> "Run only when
user is logged on", or a Startup-folder shortcut). A Windows *service* runs in
Session 0 and any GUI app it launches would be invisible.

Install: pip install flask pycaw comtypes
Run:     python pc-deck-agent.py
"""

import ipaddress
import json
import os
import subprocess
import sys
from pathlib import Path

import comtypes
from flask import Flask, jsonify, request
from pycaw.pycaw import AudioUtilities

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent


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


load_env_file(BASE_DIR / ".env")

AGENT_TOKEN = require_env("PC_AGENT_TOKEN")
AGENT_PORT = int(os.environ.get("PC_AGENT_PORT", "8086"))
APPS_FILE = BASE_DIR / "deck-apps.json"

# Windows return code when a process name is not found by taskkill
_TASKKILL_NOT_FOUND = 128


# ── App registry ──────────────────────────────────────────
def load_apps() -> dict:
    """Read deck-apps.json fresh on every call so edits apply without a restart."""
    try:
        with APPS_FILE.open(encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        print(f"[deck-agent] Could not read {APPS_FILE.name}: {exc}")
        return {}


def expand(value: str) -> str:
    """Expand %LOCALAPPDATA% style vars and normalise slashes."""
    return os.path.expandvars(os.path.expanduser(value))


# ── Security ──────────────────────────────────────────────
def verify_token(req) -> bool:
    token = req.args.get("token") or req.headers.get("X-Token")
    return token == AGENT_TOKEN


def is_lan_caller(req) -> bool:
    """Reject anything that is not a private / loopback address.

    The phone's webhook proxies these calls over the LAN, so a public source
    address means something is wrong — fail closed.
    """
    try:
        addr = ipaddress.ip_address(req.remote_addr)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or addr.is_link_local


@app.before_request
def guard():
    if not is_lan_caller(request):
        return jsonify({"error": "Forbidden"}), 403
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401
    return None


# ── Process state ─────────────────────────────────────────
def running_processes() -> set:
    """Return a lowercased set of running image names via tasklist."""
    try:
        result = subprocess.run(
            ["tasklist", "/fo", "csv", "/nh"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if result.returncode != 0:
            return set()
        names = set()
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line.startswith('"'):
                continue
            # csv row: "image.exe","pid","session",...
            names.add(line.split('","')[0].lstrip('"').lower())
        return names
    except Exception:
        return set()


# ── Routes ────────────────────────────────────────────────
@app.route("/apps", methods=["GET"])
def list_apps():
    """Return the registry plus live running state for each entry."""
    apps = load_apps()
    live = running_processes()
    out = []
    for key, cfg in apps.items():
        proc = (cfg.get("proc") or "").lower()
        out.append(
            {
                "key": key,
                "label": cfg.get("label", key),
                "icon": cfg.get("icon", "▸"),
                "running": bool(proc) and proc in live,
                "closable": bool(proc),
            }
        )
    return jsonify({"online": True, "apps": out}), 200


@app.route("/launch", methods=["GET", "POST"])
def launch():
    key = request.args.get("app")
    apps = load_apps()
    if not key or key not in apps:
        return jsonify({"error": f"Unknown app. Valid: {list(apps.keys())}"}), 400

    cfg = apps[key]
    target = expand(cfg.get("target", ""))
    if not target:
        return jsonify({"error": f"{key} has no target configured"}), 400

    args = [expand(a) for a in cfg.get("args", [])]

    try:
        if "://" in target or target.endswith(":"):
            # Protocol handler (steam://, spotify:) — let the shell resolve it.
            # start's first quoted argument is the window title, hence the "".
            subprocess.run(
                ["cmd", "/c", "start", "", target],
                check=True,
                timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        else:
            exe = Path(target)
            if not exe.is_file():
                return jsonify({"error": f"Not found: {target}"}), 404
            # DETACHED_PROCESS only — it is mutually exclusive with
            # CREATE_NO_WINDOW, and it keeps the app alive if the agent restarts.
            subprocess.Popen(
                [str(exe), *args],
                cwd=str(exe.parent),
                close_fds=True,
                creationflags=subprocess.DETACHED_PROCESS,
            )
        return jsonify({"status": "launched", "app": key}), 200
    except Exception as exc:
        return jsonify({"status": "error", "app": key, "message": str(exc)}), 500


@app.route("/close", methods=["GET", "POST"])
def close():
    key = request.args.get("app")
    apps = load_apps()
    if not key or key not in apps:
        return jsonify({"error": f"Unknown app. Valid: {list(apps.keys())}"}), 400

    proc = apps[key].get("proc")
    if not proc:
        return jsonify({"error": f"{key} has no proc name to close"}), 400

    try:
        result = subprocess.run(
            ["taskkill", "/im", proc, "/t", "/f"],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if result.returncode == _TASKKILL_NOT_FOUND:
            return jsonify({"status": "not_running", "app": key}), 200
        if result.returncode != 0:
            return jsonify(
                {"status": "error", "app": key, "message": result.stderr.strip()}
            ), 500
        return jsonify({"status": "closed", "app": key}), 200
    except Exception as exc:
        return jsonify({"status": "error", "app": key, "message": str(exc)}), 500



# ── Audio control ─────────────────────────────────────────
def _audio_endpoint(kind: str):
    """Live IAudioEndpointVolume for the current default mic/speaker.

    Re-resolved on every call (not cached) so a device swap — headphones
    plugged in, a different mic picked as default — is picked up immediately.
    """
    try:
        comtypes.CoInitialize()
    except OSError:
        pass  # already initialized on this thread — fine, COM ref-counts it
    if kind == "speaker":
        device = AudioUtilities.GetSpeakers()
    else:
        device = AudioUtilities.CreateDevice(AudioUtilities.GetMicrophone())
    return device.EndpointVolume


@app.route("/audio/status", methods=["GET"])
def audio_status():
    try:
        return jsonify(
            {
                "mic_muted": bool(_audio_endpoint("mic").GetMute()),
                "speaker_muted": bool(_audio_endpoint("speaker").GetMute()),
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/audio/toggle", methods=["GET", "POST"])
def audio_toggle():
    target = request.args.get("target")
    if target not in ("mic", "speaker"):
        return jsonify({"error": "target must be 'mic' or 'speaker'"}), 400
    try:
        vol = _audio_endpoint(target)
        muted = not bool(vol.GetMute())
        vol.SetMute(muted, None)
        return jsonify({"status": "ok", "target": target, "muted": muted}), 200
    except Exception as exc:
        return jsonify(
            {"status": "error", "target": target, "message": str(exc)}
        ), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "online", "service": "pc-deck-agent"}), 200


if __name__ == "__main__":
    if sys.platform != "win32":
        print("[deck-agent] Warning: built for Windows; tasklist/taskkill will fail here.")
    if not APPS_FILE.is_file():
        print(f"[deck-agent] Warning: {APPS_FILE.name} not found — no apps will be listed.")
    app.run(host="0.0.0.0", port=AGENT_PORT, debug=False)
