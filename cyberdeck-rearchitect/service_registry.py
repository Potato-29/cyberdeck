#!/usr/bin/env python3
"""Single source of truth for background-service definitions.

Read fresh from services.json on every call (same pattern as
pc-deck-agent.py's load_apps()) so editing the JSON takes effect
immediately, with no process restart. Used both as a library
(webhook_new.py) and as a CLI (status_checker_new.sh, startup.sh).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent / "services.json"
_VAR_RE = re.compile(r"\{([A-Z0-9_]+)\}")


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


load_env_file(Path(__file__).resolve().parent / ".env")


@dataclass(frozen=True)
class ServiceCheck:
    mechanism: str  # "pgrep" | "tmux" | "shell" | "http"
    value: str


@dataclass(frozen=True)
class ServiceDef:
    key: str
    label: str
    category: str  # "termux" | "proot" | "esp32"
    check: ServiceCheck
    start: str | None
    stop: str | None
    tmux_session: str | None
    alert: bool
    boot: bool


def _interpolate(s: str | None) -> str | None:
    """Replace {ENV_VAR} tokens; leaves the token as-is if the var is unset."""
    if s is None:
        return None
    return _VAR_RE.sub(lambda m: os.environ.get(m.group(1), m.group(0)), s)


def load_registry(path: Path = REGISTRY_PATH) -> list[ServiceDef]:
    """Parse services.json, in file order. Raises on malformed JSON."""
    import json

    raw = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for item in raw:
        chk = item["check"]
        out.append(
            ServiceDef(
                key=item["key"],
                label=item["label"],
                category=item["category"],
                check=ServiceCheck(chk["mechanism"], _interpolate(chk["value"])),
                start=_interpolate(item.get("start")),
                stop=_interpolate(item.get("stop")),
                tmux_session=item.get("tmux_session"),
                alert=bool(item.get("alert", True)),
                boot=bool(item.get("boot", True)),
            )
        )
    return out


def find_service(key: str, registry: list[ServiceDef] | None = None) -> ServiceDef | None:
    for svc in registry if registry is not None else load_registry():
        if svc.key == key:
            return svc
    return None


def check_service(svc: ServiceDef, timeout: int = 5) -> bool:
    """True if up. Never raises — all failure modes collapse to False."""
    try:
        if svc.check.mechanism == "pgrep":
            r = subprocess.run(
                f"pgrep {svc.check.value}", shell=True, capture_output=True, timeout=timeout
            )
            return r.returncode == 0
        if svc.check.mechanism == "tmux":
            r = subprocess.run(
                ["tmux", "has-session", "-t", svc.check.value],
                capture_output=True,
                timeout=timeout,
            )
            return r.returncode == 0
        if svc.check.mechanism == "shell":
            r = subprocess.run(svc.check.value, shell=True, capture_output=True, timeout=timeout)
            return r.returncode == 0
        if svc.check.mechanism == "http":
            import requests

            resp = requests.get(svc.check.value, timeout=timeout)
            return resp.ok
    except Exception:
        return False
    return False


def status_label(svc: ServiceDef, up: bool) -> str:
    if svc.category == "esp32":
        return "online" if up else "offline"
    return "running" if up else "down"


def status_dict(registry: list[ServiceDef] | None = None) -> dict[str, str]:
    """key -> 'running'/'down'/'online'/'offline'. Used by /status and dashboard_data()."""
    reg = registry if registry is not None else load_registry()
    return {svc.key: status_label(svc, check_service(svc)) for svc in reg}


def service_meta_list(registry: list[ServiceDef] | None = None) -> list[dict]:
    """Ordered [{key, label}] for the dashboard's service_meta field."""
    reg = registry if registry is not None else load_registry()
    return [{"key": s.key, "label": s.label} for s in reg]


def restart_service(svc: ServiceDef, timeout: int = 15) -> tuple[bool, str]:
    """Mirrors the pre-registry /restart semantics exactly."""
    if svc.start is None:
        return False, f"{svc.key} cannot be restarted remotely"
    if check_service(svc):
        return True, f"{svc.key} is already running"
    if svc.tmux_session:
        subprocess.run(f"tmux kill-session -t {svc.tmux_session} 2>/dev/null", shell=True)
    r = subprocess.run(svc.start, shell=True, capture_output=True, text=True, timeout=timeout)
    if r.returncode == 0:
        return True, f"{svc.key} restarted successfully"
    return False, r.stderr


def stop_service(svc: ServiceDef, timeout: int = 15) -> tuple[bool, str]:
    """Stop a running service. Deferred-kill services (webhook, self-restart
    actions) are handled by the caller, not here — this just runs svc.stop."""
    if svc.stop is None:
        return False, f"{svc.key} cannot be stopped remotely"
    if not check_service(svc):
        return True, f"{svc.key} is already stopped"
    r = subprocess.run(svc.stop, shell=True, capture_output=True, text=True, timeout=timeout)
    if r.returncode == 0:
        return True, f"{svc.key} stopped"
    return False, r.stderr


# ── CLI ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--down":
        # One line per currently-down, alert-eligible service:
        #   key\tlabel\trestartable(0|1)
        for svc in load_registry():
            if not svc.alert:
                continue
            if not check_service(svc):
                print(f"{svc.key}\t{svc.label}\t{1 if svc.start else 0}")

    elif len(sys.argv) > 1 and sys.argv[1] == "--ensure-all":
        for svc in load_registry():
            if not svc.boot or svc.start is None:
                continue
            ok, message = restart_service(svc)
            print(f"{svc.key}: {message}")

    elif len(sys.argv) > 1 and sys.argv[1] == "--status":
        for key, status in status_dict().items():
            print(f"{key}\t{status}")

    else:
        print(f"Usage: {sys.argv[0]} --down | --ensure-all | --status", file=sys.stderr)
        sys.exit(1)
