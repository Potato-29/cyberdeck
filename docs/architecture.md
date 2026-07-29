# Architecture

[← Documentation index](README.md)

## Boot flow

```
Android boots
  └── Termux:Boot fires ~/.termux/boot/startup.sh
        ├── termux-wake-lock (prevents Android killing Termux)
        ├── sshd starts
        ├── cloudflared tunnel starts     [tmux: cloudflare]
        ├── battery alert starts          [tmux: battery]
        ├── webhook server starts         [tmux: webhook]
        ├── ntfy server starts            [tmux: ntfy]  (via proot)
        ├── picoclaw starts               [tmux: picoclaw] (via proot)
        └── wtfutil dashboard launches    [tmux: dashboard] (via proot)
```

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
        ├── cloudflared, sshd, webhook.py, battery_alert.sh
        └── proot-distro Ubuntu
              ├── ntfy (notification server)
              └── picoclaw (gateway)
```

## Key file locations

| File / path | Purpose |
| --- | --- |
| `~/.termux/boot/startup.sh` | Main boot script — starts everything |
| `~/.config/wtf/config.yml` | wtfutil dashboard config |
| `~/.config/starship.toml` | Starship prompt config |
| `~/.cloudflared/config.yml` | Cloudflare tunnel config |
| `~/webhook.py` | Flask webhook server for restart buttons |
| `~/battery_alert.sh` | Battery monitor with TTS alerts |
| `~/status_checker.sh` | Checks services, sends ntfy alerts |
| `~/status_writer.sh` | Writes service status to file for dashboard |
| `/etc/ntfy/server.yml` (proot) | Self-hosted ntfy server config |

On the device, keep a `.env` next to scripts that need credentials (see repo `.env.example`).
