# Services

[← Documentation index](README.md)

## Source of truth

`services.json` (repo root) is the single source of truth for every background service — what it is, how to check if it's running, how to start/stop it, whether it auto-starts at boot, and whether `status_checker_new.sh` should alert when it's down. `service_registry.py` reads it and is shared by `webhook_new.py` (`/status`, `/restart`, `/stop`, the dashboard), `status_checker_new.sh`, and `startup.sh`. To add, remove, or change a service, edit `services.json` — nothing else needs to change.

The table below is a human-readable summary; `services.json` is authoritative if the two ever disagree.

## Inventory

| Service | Location | tmux session | Boot-starts | Alerts when down |
| --- | --- | --- | --- | --- |
| sshd | Termux | — (not tmux) | yes | yes |
| crond | Termux | — (not tmux) | yes | yes |
| cloudflared | Termux | `cloudflare` | yes | yes |
| ntfy | proot | `ntfy` | yes | yes |
| hermes | proot | `hermes` | yes | yes |
| battery_alert | Termux | `battery` | **no — disabled** | no |
| webhook | Termux | `webhook` | yes | yes |
| forza | Termux | `forza` | yes | yes |
| ferran_alert | Termux | `ferran-alert` | yes | yes |
| feeder (ESP32) | remote hardware | n/a | n/a | yes |

## Descriptions

- **sshd** — OpenSSH on port **8022**. Remote access to the cyberdeck.
- **crond** — cron daemon. Runs `status_checker_new.sh` every 5 minutes and the standup nudge/Friday-draft jobs — if this is down, nothing else's alerting fires either.
- **cloudflared** — Cloudflare Tunnel. Exposes services on prayas.space subdomains without router port forwarding.
- **ntfy** — Self-hosted push server on port **2121**. Alerts when services go down.
- **hermes** — Gateway inside proot Ubuntu (`hermes gateway run`). Successor to the retired `picoclaw`.
- **battery_alert** — Checks battery every 5 minutes; TTS and Android notification when low (&lt;20%) or full (&gt;90%). Currently **disabled** — not started at boot and not alerted on, but still start/stop-able manually from the dashboard control panel.
- **webhook** (`webhook_new.py`) — Flask on port **2122**. Restart/stop commands, status, dashboard data, quick actions, standup routes, ESP32 feed endpoints.
- **forza** (`forza_listener.py`) — FH6 telemetry server (HTTP + WebSocket on port 8000, UDP listener on 5300) feeding the dashboard's Forza panel.
- **ferran_alert** (`ferran_alert.mjs`) — Ferran Torres shot-alert poller.
- **feeder** — ESP32 cat feeder. Checked over HTTP; can't be restarted remotely (it's separate hardware), but `/feed`, `/door-open`, `/door-close` are exposed as dashboard control-panel buttons.

## Control panel

The dashboard (`/dashboard`, reachable at `restart.prayas.space`) is a live control panel, not just a status display: every service row has a Start/Stop toggle, and a Quick Actions section runs whitelisted one-tap scripts defined in `actions.json` (e.g. a full service restart, or running `status_checker_new.sh` on demand) via `POST /action/run`. Stopping `cloudflared` or `webhook` prompts for confirmation first, since either can strand the panel itself until you have physical/SSH access again.

See [Operations flows](operations-flows.md) for how monitoring, alerting, and restarts tie together, and [Commands](commands.md) for the raw `curl` equivalents of every panel action.
