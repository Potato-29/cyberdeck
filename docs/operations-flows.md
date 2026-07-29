# Operations flows

[← Documentation index](README.md)

## Notification and auto-restart

When a service goes down:

```
status_checker.sh runs (every 5 mins via cron)
  └── detects service is down
        └── sends ntfy push notification to your phone
              └── notification has 'Restart <service>' action button
                    └── tapping button calls:
                          https://restart.prayas.space/restart?service=X&token=...
                                └── Cloudflare tunnel routes to webhook.py
                                      └── webhook.py restarts the service
```

Credentials and URLs come from `.env` (`NTFY_*`, `WEBHOOK_TOKEN`, `RESTART_URL`, etc.).

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
