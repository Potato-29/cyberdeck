#!/usr/bin/env python3
"""
Cyberdeck Webhook Server v2.0
Handles service restarts, status checks, ESP32 cat feeder, and telemetry.
"""

import json
import os
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_file

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
# ntfy's JSON API takes numeric priorities; the header API used these names.
NTFY_PRIORITIES = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5, "urgent": 5}
NTFY_USER = require_env("NTFY_USER")
NTFY_PASS = require_env("NTFY_PASS")
RESTART_URL = require_env("RESTART_URL").rstrip("/")
PC_IP = require_env("PC_IP")
PC_TELEMETRY_PORT = os.environ.get("PC_TELEMETRY_PORT", "8085")
PC_AGENT_PORT = os.environ.get("PC_AGENT_PORT", "8086")
PC_AGENT_TOKEN = require_env("PC_AGENT_TOKEN")

# Weekly standup logger — imported after .env is loaded, since standup.py
# reads its config at module level. Serves /standup and /standup/*.
from standup import bp as standup_bp  # noqa: E402

app.register_blueprint(standup_bp)

# Service definitions live in services.json — see service_registry.py.
# Whitelisted one-tap scripts live in actions.json.
from service_registry import (  # noqa: E402
    find_service,
    load_registry,
    restart_service,
    service_meta_list,
    set_alert,
    status_dict,
    stop_service,
)

ACTIONS_PATH = Path(__file__).resolve().parent / "actions.json"


def load_actions() -> list[dict]:
    """Read actions.json fresh on every call — same pattern as deck-apps.json."""
    try:
        return json.loads(ACTIONS_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[webhook] Could not read {ACTIONS_PATH.name}: {exc}")
        return []


def find_action(key: str) -> dict | None:
    for action in load_actions():
        if action.get("key") == key:
            return action
    return None


# ── Helpers ──────────────────────────────────────────────
def verify_token(req):
    token = req.args.get("token") or req.headers.get("X-Token")
    return token == SECRET


def send_ntfy(message, title="⚠️ Cyberdeck Alert", priority="high"):
    """Publish via ntfy's JSON endpoint.

    Title and message go in the body, not in headers: HTTP headers are latin-1
    only, so an emoji title raises UnicodeEncodeError before the request is sent.
    Every caller here uses one, so the header form never delivered at all.
    """
    try:
        resp = requests.post(
            _ntfy_base,
            json={
                "topic": _ntfy_topic,
                "title": title,
                "message": message,
                "priority": NTFY_PRIORITIES.get(priority, 3),
            },
            auth=(NTFY_USER, NTFY_PASS),
            timeout=5,
        )
        if resp.status_code >= 400:
            print(f"[ntfy] {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        print(f"[ntfy] send failed: {exc}")


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


# ── Dashboard Helpers ──────────────────────────────────────

def _run(cmd, timeout=5):
    """Run a shell command, return stripped stdout or None on failure."""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def get_battery_info():
    """Return battery dict from termux-battery-status."""
    try:
        raw = subprocess.run(
            ["termux-battery-status"], capture_output=True, text=True, timeout=5
        )
        b = json.loads(raw.stdout)
        return {
            "level": b.get("percentage"),
            "status": b.get("status"),
            "health": b.get("health"),
            "temperature": b.get("temperature"),
        }
    except Exception:
        return {}


def get_wifi_info():
    """Return wifi dict from termux-wifi-connectioninfo."""
    try:
        raw = subprocess.run(
            ["termux-wifi-connectioninfo"], capture_output=True, text=True, timeout=5
        )
        w = json.loads(raw.stdout)
        return {
            "ssid": w.get("ssid", "--"),
            "ip": w.get("ip", "--"),
            "rssi": w.get("rssi"),
            "speed_mbps": w.get("link_speed_mbps"),
        }
    except Exception:
        return {}


def get_uptime_str():
    """Return human-readable uptime string."""
    try:
        with open("/proc/uptime") as f:
            secs = int(float(f.readline().split()[0]))
        d, h = divmod(secs, 86400)
        h, m = divmod(h, 3600)
        parts = []
        if d: parts.append(f"{d}d")
        if h: parts.append(f"{h}h")
        parts.append(f"{m}m")
        return " ".join(parts)
    except Exception:
        return "--"


def get_disk_str():
    """Return disk usage string for /sdcard."""
    out = _run("df -h /sdcard 2>/dev/null | awk 'NR==2{print $3\"/\"$2\" (\"$5\" used)\"}'")
    return out or "--"


def get_disk_pct():
    """Return disk percentage as float for /sdcard."""
    out = _run("df /sdcard 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%'")
    try:
        return float(out) if out else 0.0
    except Exception:
        return 0.0


def get_memory_str():
    """Return memory usage string."""
    out = _run("free -h | awk '/^Mem/{print $3\"/\"$2\" used\"}'")
    return out or "--"


def get_memory_pct():
    """Return memory percentage as float."""
    out = _run("free | awk '/^Mem/{printf \"%.1f\", $3/$2*100}'")
    try:
        return float(out) if out else 0.0
    except Exception:
        return 0.0


def get_cpu_pct():
    """Return rough CPU usage via /proc/stat."""
    try:
        with open("/proc/stat") as f:
            fields = f.readline().split()
        total = sum(int(x) for x in fields[1:])
        idle = int(fields[4])
        return round((1 - idle / total) * 100, 1) if total else 0
    except Exception:
        return 0


def get_pc_stats():
    """Fetch PC telemetry from LibreHardwareMonitor."""
    try:
        resp = requests.get(
            f"http://{PC_IP}:{PC_TELEMETRY_PORT}/data.json",
            timeout=3,
        )
        resp.raise_for_status()
        data = resp.json()
        def find(sensor_id):
            return _find_sensor(data, sensor_id)
        return {
            "online": True,
            "cpu_temp": find("/amdcpu/0/temperature/2") or "--",
            "cpu_load": find("/amdcpu/0/load/0") or "--",
            "gpu_temp": find("/gpu-nvidia/0/temperature/0") or "--",
            "gpu_load": find("/gpu-nvidia/0/load/0") or "--",
            "ram_load": find("/ram/load/0") or "--",
            "cpu_fan": find("/lpc/it8686e/0/fan/0") or "--",
        }
    except Exception:
        return {"online": False}


def call_pc_agent(endpoint, params=None, timeout=6):
    """Call the PC deck agent over the LAN. Raises on transport failure."""
    query = {"token": PC_AGENT_TOKEN}
    if params:
        query.update(params)
    return requests.get(
        f"http://{PC_IP}:{PC_AGENT_PORT}/{endpoint}",
        params=query,
        timeout=timeout,
    )


def _find_sensor(data, sensor_id):
    """Recursively search LibreHardwareMonitor JSON tree."""
    if isinstance(data, dict):
        if data.get("SensorId") == sensor_id:
            return data.get("Value")
        for key in ("Children", "Sensors"):
            if key in data:
                v = _find_sensor(data[key], sensor_id)
                if v is not None:
                    return v
    elif isinstance(data, list):
        for item in data:
            v = _find_sensor(item, sensor_id)
            if v is not None:
                return v
    return None


def get_rss_feed():
    """Parse TechCrunch RSS and return list of {title, link, published}."""
    try:
        resp = requests.get("https://techcrunch.com/feed/", timeout=8)
        root = ET.fromstring(resp.text)
        items = []
        for item in root.iter("item"):
            title_el = item.find("title")
            link_el = item.find("link")
            pub_el = item.find("pubDate")
            if title_el is not None:
                pub_text = pub_el.text if pub_el is not None else ""
                # shorten date
                if pub_text:
                    parts = pub_text.split()
                    if len(parts) >= 4:
                        pub_text = f"{parts[1]} {parts[2]} {parts[3]}"
                items.append({
                    "title": title_el.text,
                    "link": link_el.text if link_el is not None else "#",
                    "published": pub_text,
                })
        return items[:10]
    except Exception:
        return []


def get_weather():
    """Fetch Ahmedabad weather from OpenWeatherMap."""
    try:
        url = ("https://api.openweathermap.org/data/2.5/weather"
               "?id=1279233&appid=7262217ccc9a6e74f854163184d21298&units=metric")
        resp = requests.get(url, timeout=5)
        d = resp.json()
        return {
            "temp": round(d["main"]["temp"]),
            "feels_like": round(d["main"]["feels_like"]),
            "humidity": d["main"]["humidity"],
            "description": d["weather"][0]["description"].title(),
        }
    except Exception:
        return {}


# ── Routes ────────────────────────────────────────────────


@app.route("/restart", methods=["GET", "POST"])
def restart():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    service = request.args.get("service")
    registry = load_registry()
    svc = find_service(service, registry) if service else None
    if svc is None:
        return jsonify({"error": f"Unknown service. Valid: {[s.key for s in registry]}"}), 400

    ok, message = restart_service(svc)
    if ok:
        return jsonify({"status": message}), 200
    status_code = 400 if svc.start is None else 500
    return jsonify({"error": message}), status_code


@app.route("/stop", methods=["GET", "POST"])
def stop():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    service = request.args.get("service")
    registry = load_registry()
    svc = find_service(service, registry) if service else None
    if svc is None:
        return jsonify({"error": f"Unknown service. Valid: {[s.key for s in registry]}"}), 400

    if svc.key == "webhook":
        # Stopping our own tmux session kills this process before the
        # response can be sent — defer it so the client gets its answer.
        if svc.stop is None:
            return jsonify({"error": f"{svc.key} cannot be stopped remotely"}), 400
        subprocess.Popen(
            ["sh", "-c", f"sleep 1; {svc.stop}"], start_new_session=True
        )
        return jsonify({"status": "webhook stop triggered — this session will end in ~1s"}), 200

    ok, message = stop_service(svc)
    if ok:
        return jsonify({"status": message}), 200
    status_code = 400 if svc.stop is None else 500
    return jsonify({"error": message}), status_code


@app.route("/status", methods=["GET"])
def status():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(status_dict()), 200


@app.route("/service/alert", methods=["POST"])
def service_alert():
    """Enable/disable status_checker alerting for one service, without
    touching whether it's monitored/restartable — just whether a down
    reading pages you. Writes the change straight into services.json."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    service = request.args.get("service")
    enabled_raw = request.args.get("enabled")
    registry = load_registry()
    svc = find_service(service, registry) if service else None
    if svc is None:
        return jsonify({"error": f"Unknown service. Valid: {[s.key for s in registry]}"}), 400
    if enabled_raw not in ("true", "false"):
        return jsonify({"error": "enabled must be 'true' or 'false'"}), 400

    enabled = enabled_raw == "true"
    set_alert(svc.key, enabled)
    return jsonify({"status": f"{svc.key} alert {'enabled' if enabled else 'disabled'}"}), 200


@app.route("/actions/list", methods=["GET"])
def actions_list():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401
    # never leak the raw "command" field to the client
    return jsonify(
        [
            {"key": a["key"], "label": a.get("label", a["key"]), "confirm": bool(a.get("confirm"))}
            for a in load_actions()
        ]
    ), 200


@app.route("/action/run", methods=["POST"])
def action_run():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    key = request.args.get("action")
    action = find_action(key) if key else None
    if action is None:
        return jsonify({"error": f"Unknown action. Valid: {[a['key'] for a in load_actions()]}"}), 400

    command = action["command"]
    if key == "full_restart":
        # tmux kill-server takes down webhook's own session along with
        # everything else — background it so the response reaches the
        # client before the server dies. Nothing can confirm success once
        # the process that received the request is gone, so this is
        # necessarily an optimistic "triggered" response, not a real result.
        subprocess.Popen(["sh", "-c", command], start_new_session=True)
        return jsonify({"status": f"{key} triggered"}), 200

    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            return jsonify({"status": f"{key} completed", "output": result.stdout[-2000:]}), 200
        return jsonify({"error": result.stderr[-2000:] or f"{key} failed"}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": f"{key} timed out"}), 504

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

@app.route("/door-open", methods=["GET"])
def doorOpen():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        resp = call_esp32("door-open")

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

@app.route("/door-close", methods=["GET"])
def doorClose():
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        resp = call_esp32("door-close")

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

@app.route("/dynamic-execute", methods=["POST"])
def execute_command():
    # 1. Security Check
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    # 2. Extract parameters from the incoming request (JSON body)
    data = request.get_json()
    command = data.get("cmd")        # e.g., "feed", "door-open", "door-close"
    f_delay = data.get("delay", 1000) # Default to 1000 if not provided

    if not command:
        return jsonify({"error": "Missing 'cmd' parameter"}), 400

    try:
        # 3. Call ESP32 dynamic API
        # Sending as POST parameters to match the ESP32 setup
        payload = {'cmd': command, 'delay': f_delay}
        resp = requests.post(f"http://{ESP32_IP}/dynamic", data=payload, timeout=10)

        # 4. Optional: Wait and verify status
        time.sleep(1) 
        try:
            status_resp = requests.get(f"http://{ESP32_IP}/status", timeout=2)
            print(f"status_resp: {status_resp}")
            status_data = status_resp.text.strip()
        except Exception as e:
            print(f"Exception: {e}")
            status_data = {"info": "Could not retrieve status"}

        return jsonify({
            "status": "success",
            "command_sent": command,
            "esp32_response": resp.text,
            "current_state": status_data
        }), 200

    except requests.exceptions.RequestException as e:
        send_ntfy(
            f"Feeder command '{command}' failed! Error: {str(e)}",
            title="🐱 Action Failed",
        )
        return jsonify({
            "status": "error",
            "message": f"Could not reach ESP32: {str(e)}"
        }), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "online", "service": "cyberdeck-webhook"}), 200


@app.route("/deck/apps", methods=["GET"])
def deck_apps():
    """List launchable PC apps with their live running state."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401
    try:
        resp = call_pc_agent("apps")
        resp.raise_for_status()
        return jsonify(resp.json()), 200
    except Exception:
        # PC asleep or agent not running — the panel greys out rather than hangs
        return jsonify({"online": False, "apps": []}), 200


@app.route("/deck/launch", methods=["GET", "POST"])
def deck_launch():
    """Launch a whitelisted app on the PC."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    target = request.args.get("app")
    if not target:
        return jsonify({"error": "Missing 'app' parameter"}), 400

    try:
        resp = call_pc_agent("launch", {"app": target}, timeout=20)
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.RequestException as e:
        return jsonify(
            {"status": "error", "message": f"PC agent unreachable: {e}"}
        ), 503


@app.route("/deck/close", methods=["GET", "POST"])
def deck_close():
    """Close a whitelisted app on the PC."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    target = request.args.get("app")
    if not target:
        return jsonify({"error": "Missing 'app' parameter"}), 400

    try:
        resp = call_pc_agent("close", {"app": target}, timeout=20)
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.RequestException as e:
        return jsonify(
            {"status": "error", "message": f"PC agent unreachable: {e}"}
        ), 503


@app.route("/dashboard/data", methods=["GET"])
def dashboard_data():
    """Aggregate all dashboard widgets into one JSON response."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401

    return jsonify({
        "services": status_dict(),
        "service_meta": service_meta_list(),
        "battery": get_battery_info(),
        "wifi": get_wifi_info(),
        "system": {
            "uptime": get_uptime_str(),
            "disk": get_disk_str(),
            "memory": get_memory_str(),
        },
        "resources": {
            "cpu": get_cpu_pct(),
            "mem_pct": get_memory_pct(),
            "disk_pct": get_disk_pct(),
        },
        "pc_stats": get_pc_stats(),
        "weather": get_weather(),
        "rss": get_rss_feed(),
    }), 200


@app.route("/dashboard", methods=["GET"])
def dashboard_page():
    """Serve the Fallout-themed dashboard HTML."""
    if not verify_token(request):
        return jsonify({"error": "Unauthorized"}), 401
    html_path = Path(__file__).parent / "dashboard.html"
    if html_path.exists():
        return send_file(str(html_path))
    return jsonify({"error": "dashboard.html not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=2122, debug=False)
