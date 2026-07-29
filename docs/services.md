# Services

[← Documentation index](README.md)

## Inventory

| Service | Location | Start | Check |
| --- | --- | --- | --- |
| sshd | Termux | `sshd` | `pgrep -x sshd` |
| cloudflared | Termux tmux | tmux: `cloudflare` | `pgrep -f cloudflared` |
| battery_alert | Termux tmux | tmux: `battery` | `pgrep -f battery_alert` |
| webhook.py | Termux tmux | tmux: `webhook` | `pgrep -f webhook.py` |
| ntfy | proot tmux | tmux: `ntfy` | `pgrep -f 'ntfy serve'` |
| picoclaw | proot tmux | tmux: `picoclaw` | `pgrep -f picoclaw` |

## Descriptions

- **sshd** — OpenSSH on port **8022**. Remote access to the cyberdeck.
- **cloudflared** — Cloudflare Tunnel. Exposes services on prayas.space subdomains without router port forwarding.
- **battery_alert** — Checks battery every 5 minutes. TTS and Android notification when low (&lt;20%) or full (&gt;90%).
- **webhook.py** — Flask on port **2122**. Restart commands from ntfy action buttons; status and (in `webhook_new.py`) ESP32 feed endpoints.
- **ntfy** — Self-hosted push server on port **2121**. Alerts when services go down.
- **picoclaw** — Gateway inside proot Ubuntu.
- **wtfutil** — On-screen dashboard: service status, weather, news, battery, WiFi, system info.

## tmux session names

Typical session names match the boot script: `cloudflare`, `battery`, `webhook`, `ntfy`, `picoclaw`, `dashboard`.

See [Operations flows](operations-flows.md) for how monitoring and restarts tie together.
