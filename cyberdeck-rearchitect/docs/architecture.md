# Architecture

[← Documentation index](README.md)

## Boot flow

`startup.sh` (tracked in this repo, synced to `~/.termux/boot/startup.sh`) no longer lists services one-by-one — it calls `service_registry.py --ensure-all`, which starts every entry in `services.json` marked `"boot": true` that isn't already running:

```
Android boots
  └── Termux:Boot fires ~/.termux/boot/startup.sh
        ├── termux-wake-lock (prevents Android killing Termux)
        ├── sleep 10 (let networking settle)
        └── service_registry.py --ensure-all, per services.json:
              ├── sshd
              ├── crond
              ├── cloudflared tunnel        [tmux: cloudflare]
              ├── ntfy server               [tmux: ntfy]  (via proot)
              ├── hermes gateway            [tmux: hermes] (via proot)
              ├── webhook server            [tmux: webhook]
              ├── forza telemetry listener  [tmux: forza]
              └── ferran alert poller       [tmux: ferran-alert]
```

`battery_alert` is defined in `services.json` but marked `"boot": false` (currently disabled — start/stop-able manually from the dashboard, but not auto-started). `hermes` is the renamed, still-current successor to the retired `picoclaw`. The on-screen `wtfutil` dashboard is no longer launched at boot.

## Interaction flow

```
Your PC  ──SSH──►  Termux (port 8022)
                     └── proot Ubuntu (alias: ubuntu)

Internet ──────►  ssh.prayas.space  ──►  Cloudflare Tunnel  ──►  Termux
```

## Layer overview

```
Android (base OS)
  └── Termux (base layer)
        ├── All tmux sessions live here
        ├── cloudflared, sshd, crond, webhook_new.py, forza_listener.py, ferran_alert.mjs
        └── proot-distro Ubuntu
              ├── ntfy (notification server)
              └── hermes (gateway)
```

## Key file locations

| File / path | Purpose |
| --- | --- |
| `~/cyberdeck/services.json` | Service registry — single source of truth for check/start/stop commands |
| `~/cyberdeck/service_registry.py` | Reads `services.json`; used by webhook, status checker, and startup.sh |
| `~/cyberdeck/actions.json` | Whitelisted quick-action scripts exposed on the dashboard control panel |
| `~/.termux/boot/startup.sh` | Main boot script — calls `service_registry.py --ensure-all` |
| `~/.config/starship.toml` | Starship prompt config |
| `~/.cloudflared/config.yml` | Cloudflare tunnel config |
| `~/cyberdeck/webhook_new.py` | Flask webhook server — restart/stop/status, dashboard, quick actions |
| `~/cyberdeck/battery_alert.sh` | Battery monitor with TTS alerts (currently boot-disabled) |
| `~/cyberdeck/status_checker_new.sh` | Cron job (every 5 min) — checks services, sends ntfy alerts |
| `/etc/ntfy/server.yml` (proot) | Self-hosted ntfy server config |

On the device, keep a `.env` next to scripts that need credentials (see repo `.env.example`).
