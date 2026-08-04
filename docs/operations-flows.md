# Operations flows

[← Documentation index](README.md)

## Notification and auto-restart

When a service goes down:

```
status_checker_new.sh runs (every 5 mins via cron)
  └── loops over `service_registry.py --down` (alert-eligible, currently-down services)
        └── sends ntfy push notification to your phone
              └── notification has a 'Restart <service>' action button (if restartable)
                    └── tapping button calls:
                          https://restart.prayas.space/restart?service=X&token=...
                                └── Cloudflare tunnel routes to webhook_new.py
                                      └── webhook_new.py restarts the service
```

Credentials and URLs come from `.env` (`NTFY_*`, `WEBHOOK_TOKEN`, `RESTART_URL`, etc.). Which services alert, and what "restart" means for each, is defined in `services.json` — see [Services](services.md).

The same dashboard served at `/dashboard` doubles as a remote control panel: each service row has a Start/Stop toggle (`/restart` / `/stop`), and a Quick Actions section runs whitelisted scripts from `actions.json` via `POST /action/run` (e.g. a full service restart, or running the health check on demand) — see [Commands](commands.md) for the raw endpoints.

## Cloudflare tunnel (public endpoints)

The tunnel connects local services to the internet via prayas.space without opening router ports.

| Hostname | Backend |
| --- | --- |
| `ssh.prayas.space` | TCP `localhost:8022` (SSH) |
| `ntfy.prayas.space` | HTTP `localhost:2121` |
| `restart.prayas.space` | HTTP `localhost:2122` |

Details: [Cloudflare tunnel](cloudflare-tunnel.md).

## tmux session architecture

- All services run in **named tmux sessions in Termux**.
- Sessions survive SSH disconnect; attach to inspect logs.
- **All tmux sessions are Termux-side** — visible from SSH and the phone.
- proot services start with: `proot-distro login ubuntu -- <command>`
- **Termux tmux and proot tmux are separate** — do not run Termux `tmux` commands from inside proot.
