#!/usr/bin/env python3
"""
Cyberdeck Webhook Server v2.0
Handles service restarts, status checks, ESP32 cat feeder, and telemetry.
"""

import os
import subprocess
import time
from pathlib import Path

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)


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


_env_path = Path(__file__).resolve().parent / ".env"
load_env_file(_env_path)

SECRET = require_env("WEBHOOK_TOKEN")
ESP32_IP = require_env("ESP32_IP")
ESP32_API_TOKEN = require_env("ESP32_API_TOKEN")
TELEMETRY_FILE = os.path.expanduser("~/pc-telemetry-monitor.py")
_ntfy_base = require_env("NTFY_URL").rstrip("/")
_ntfy_topic = require_env("NTFY_TOPIC")
NTFY_URL = f"{_ntfy_base}/{_ntfy_topic}"
NTFY_USER = require_env("NTFY_USER")
NTFY_PASS = require_env("NTFY_PASS")
RESTART_URL = require_env("RESTART_URL").rstrip("/")

# ── Services ──────────────────────────────────────────────
SERVICES = {
    "sshd": {
        "check": "pgrep -x sshd",
        "start": "sshd",
    },
    "cloudflared": {
        "check": "pgrep -f cloudflared",
        "start": "tmux new-session -d -s cloudflare 'cloudflared tunnel run my-phone'",
    },
    "picoclaw": {
        "check": "pgrep -f picoclaw",
        "start": "tmux new-session -d -s picoclaw 'proot-distro login ubuntu -- bash -c \"cd ~ && ./picoclaw gateway\"'",
    },
    "ntfy": {
        "check": "pgrep -f 'ntfy serve'",
        "start": "tmux new-session -d -s ntfy 'proot-distro login ubuntu -- ntfy serve'",
    },
    "battery_alert": {
        "check": "pgrep -f battery_alert.sh",
        "start": "tmux new-session -d -s battery 'bash ~/cyberdeck/battery_alert.sh'",
    },
    "webhook": {
        "check": "tmux has-session -t webhook",
        "start": "tmux new-session -d -s webhook 'python3 ~/cyberdeck/webhook.py'",
    },
    "feeder": {
        "check": (
            f"curl -s --max-time 3 'http://{ESP32_IP}/status?token={SECRET}'" # TODO: change to a proper domain
        ),
        "start": None,  # cannot restart ESP32 remotely
    },
}

SESSION_MAP = {
    "cloudflared": "cloudflare",
    "picoclaw": "picoclaw",
    "ntfy": "ntfy",
    "battery_alert": "battery",
    "webhook": "webhook",
}


# ── Helpers ──────────────────────────────────────────────
def verify_token(req):
    token = req.args.get("token") or req.headers.get("X-Token")
    return token == SECRET


def send_ntfy(message, title="⚠️ Cyberdeck Alert", priority="high"):
    try:
        requests.post(
            NTFY_URL,
            data=message,
            headers={
                "Title": title,
                "Priority": priority,
            },
            auth=(NTFY_USER, NTFY_PASS),
            timeout=5,
        )
    except Exception:
        pass


def call_esp32(endpoint, retries=3):
    """Call ESP32 HTTP endpoint with retry logic."""
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.get(
                f"http://{ESP32_IP}/{endpoint}?token={ESP32_API_TOKEN}",
                timeout=5,
            )
            return resp
        except requests.exceptions.RequestException as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2)
    raise last_err


# ── Routes ────────────────────────────────────────────────


@app.route("/restart", methods=["GET", "POST"])
def restart():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    service = request.args.get("service")
    if not service or service not in SERVICES:
        return jsonify({"error": f"Unknown service. Valid: {list(SERVICES.keys())}"}), 400

    svc = SERVICES[service]

    if svc["start"] is None:
        return jsonify({"error": f"{service} cannot be restarted remotely"}), 400

    # check if already running
    already = subprocess.run(svc["check"], shell=True, capture_output=True)
    if already.returncode == 0:
        return jsonify({"status": f"{service} is already running"}), 200

    # kill stale tmux session if exists
    if service in SESSION_MAP:
        subprocess.run(
            f"tmux kill-session -t {SESSION_MAP[service]} 2>/dev/null",
            shell=True,
        )

    result = subprocess.run(svc["start"], shell=True, capture_output=True, text=True)

    if result.returncode == 0:
        return jsonify({"status": f"{service} restarted successfully"}), 200
    else:
        return jsonify({"error": result.stderr}), 500


@app.route("/status", methods=["GET"])
def status():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    statuses = {}
    for name, svc in SERVICES.items():
        result = subprocess.run(
            svc["check"],
            shell=True,
            capture_output=True,
            text=True,
        )

        if name == "feeder":
            # feeder check command returns HTTP code text (e.g. "200")
            http_code = (result.stdout or "").strip()
            print(f"result: {result} - stdout: {result.stdout}")
            statuses[name] = "running" if http_code == "online" else "stopped"
        else:
            statuses[name] = "running" if result.returncode == 0 else "stopped"

    return jsonify(statuses), 200

@app.route("/feeder-status", methods=["GET"])
def feeder_status():
    try:
        resp = call_esp32("status")
        data = resp.text.strip()
        print(f"txt: {data}")

        return jsonify({
            "status":    "online",
            "device":    "esp32_feeder",
            "esp32":     data
        }), 200

    except requests.exceptions.RequestException as e:
        print(f"ERROR 1: {e}")
        return jsonify({
            "status": "offline",
            "error":  str(e)
        }), 503

    except Exception as e:
        print(f"ERROR 2: {e}")
        return jsonify({
            "status": "offline",
            "error":  str(e)
        }), 503

@app.route("/feed", methods=["GET", "POST"])
def feed():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        resp = call_esp32("feed")

        # verify feed happened by checking status
        time.sleep(2)
        try:
            status_resp = call_esp32("status")
            status_data = status_resp.json()
        except Exception:
            status_data = {}

        return jsonify(
            {
                "status": "success",
                "esp32": resp.text,
                "feed_count": status_data.get("feedCount"),
                "last_feed": status_data.get("lastFeedTime"),
            }
        ), 200

    except requests.exceptions.RequestException as e:
        send_ntfy(
            f"Cat feeder ESP32 unreachable! Could not feed. Error: {str(e)}",
            title="🐱 Feed Failed",
        )
        return jsonify(
            {
                "status": "error",
                "message": f"Could not reach ESP32: {str(e)}",
            }
        ), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "online", "service": "cyberdeck-webhook"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2122, debug=False)