#!/usr/bin/env python3
"""
Webhook server — receives restart requests from ntfy action buttons
and restarts the appropriate service.
All services now run in Termux tmux sessions.
"""

from pathlib import Path
import os
import subprocess

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
        "start": "tmux new-session -d -s battery 'bash ~/battery_alert.sh'",
    },
    "webhook": {
        "check": "pgrep -f webhook.py",
        "start": "tmux new-session -d -s webhook 'proot-distro login ubuntu -- python3 /root/webhook.py'",
    },
}


def verify_token(req):
    token = req.args.get("token") or req.headers.get("X-Token")
    return token == SECRET


@app.route("/restart", methods=["GET", "POST"])
def restart():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    service = request.args.get("service")
    if not service or service not in SERVICES:
        return jsonify({"error": f"Unknown service. Valid: {list(SERVICES.keys())}"}), 400

    svc = SERVICES[service]

    # Check if already running
    already = subprocess.run(svc["check"], shell=True, capture_output=True)
    if already.returncode == 0:
        return jsonify({"status": f"{service} is already running"}), 200

    # Kill stale tmux session if exists then restart
    session_map = {
        "cloudflared": "cloudflare",
        "picoclaw": "picoclaw",
        "ntfy": "ntfy",
        "battery_alert": "battery",
        "webhook": "webhook",
    }
    if service in session_map:
        subprocess.run(
            f"tmux kill-session -t {session_map[service]} 2>/dev/null",
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
        result = subprocess.run(svc["check"], shell=True, capture_output=True)
        statuses[name] = "running" if result.returncode == 0 else "stopped"

    return jsonify(statuses), 200


@app.route("/feed", methods=["GET", "POST"])
def feed():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        # Internal request to the ESP32 on your local network
        # timeout=5 ensures your webhook doesn't hang if the ESP32 is offline
        resp = requests.get(f"http://{ESP32_IP}/feed", timeout=5)

        return jsonify(
            {
                "status": "success",
                "esp32_response": resp.text,
            }
        ), 200

    except requests.exceptions.RequestException as e:
        return jsonify(
            {
                "status": "error",
                "message": f"Could not reach ESP32: {str(e)}",
            }
        ), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2122, debug=False)
