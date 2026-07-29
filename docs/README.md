# Cyberdeck documentation

**prayas.space** — System reference and operations manual for the always-on desk server: Android → Termux → proot Ubuntu.

The Cyberdeck is a rooted Android phone permanently stationed at your desk. It runs background services while displaying a live **wtfutil** dashboard, reachable from anywhere via SSH or the browser.

## Documentation map

| Topic | Document |
| --- | --- |
| Hardware, stack, and roles | [Overview](overview.md) |
| Boot flow, layers, file locations | [Architecture](architecture.md) |
| Service inventory and descriptions | [Services](services.md) |
| ntfy alerts, webhooks, tmux model | [Operations flows](operations-flows.md) |
| Tunnel config and new subdomains | [Cloudflare tunnel](cloudflare-tunnel.md) |
| PC app launcher tiles | [Deck shortcuts](deck-shortcuts.md) |
| Daily work log and Friday update | [Weekly standup](standup.md) |
| tmux, ntfy, webhook, Cloudflare CLI | [Commands](commands.md) |
| Troubleshooting | [Debugging](debugging.md) |

## Repo scripts (this project)

These files mirror what typically lives under `~` on the device. They load secrets from a `.env` file in the **same directory** as each script.

| File | Role |
| --- | --- |
| `webhook.py` / `webhook_new.py` | Flask restart/status/feed server (port 2122) |
| `status_checker.sh` / `status_checker_new.sh` | Cron health checks → ntfy with restart actions |
| `battery_alert.sh` | Battery TTS and notifications |
| `pc-telemetry-monitor.py` | PC LibreHardwareMonitor poll for wtfutil |
| `pc-deck-agent.py` + `deck-apps.json` | **Runs on the PC** — whitelisted app launcher (port 8086) |
| `standup.py` + `standup.html` | Daily work log, Friday update generator (blueprint on 2122) |
| `note.ps1` | **Runs on the PC** — log a standup note from the terminal |
| `sketch_may1a/` | ESP32 cat feeder firmware |

Copy `.env.example` to `.env` and fill in values before deploying.

## Quick reference

| Task | Command |
| --- | --- |
| See all services | `tmux ls` |
| Attach to a service | `tmux attach -t <name>` |
| Detach from session | `Ctrl+B` then `D` |
| Enter proot Ubuntu | `ubuntu` |
| Restart everything | `tmux kill-server && bash ~/.termux/boot/startup.sh` |
| Check service status | `curl 'https://restart.prayas.space/status?token=...'` |
| Send test notification | `curl -u prayas:<pw> -d 'test' https://ntfy.prayas.space/cyberdeck` |
| Run status checker | `bash ~/status_checker.sh` |
| Check a port | `fuser <port>/tcp` |
| Kill a process | `pkill -f <name>` |

---

*CYBERDECK — prayas.space*
