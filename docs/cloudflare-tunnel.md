# Cloudflare tunnel

[← Documentation index](README.md)

## Config file

`~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /data/data/com.termux/files/home/.cloudflared/<id>.json

ingress:
  - hostname: ssh.prayas.space
    service: tcp://localhost:8022
  - hostname: ntfy.prayas.space
    service: http://localhost:2121
  - hostname: restart.prayas.space
    service: http://localhost:2122
  - hostname: ideas.prayas.space
    service: http://localhost:2124
  - service: http_status:404
```

Rules match top to bottom, so every hostname must come **above** the
`http_status:404` catch-all.

## Adding a new subdomain

1. Add a new ingress rule to `config.yml`.
2. Run: `cloudflared tunnel route dns my-phone newservice.prayas.space`
3. Restart cloudflared: `tmux kill-session -t cloudflare`, then start the tunnel again in a fresh tmux session.

## Related commands

See [Commands — Cloudflare](commands.md#cloudflare).
