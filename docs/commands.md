# Commands

[← Documentation index](README.md)

## tmux

```bash
tmux ls                          # list all sessions
tmux attach -t <name>            # attach to session
tmux kill-session -t <name>      # kill a session
tmux kill-server                 # kill ALL sessions
# Ctrl+B then D                  # detach from session
```

## Service management

```bash
# restart a specific service
tmux kill-session -t <name>
tmux new-session -d -s <name> '<command>'

# restart full startup
tmux kill-server && bash ~/.termux/boot/startup.sh

# enter proot Ubuntu
ubuntu   # alias for: proot-distro login ubuntu
```

## ntfy

```bash
# send a test notification
curl -u prayas:<password> \
  -H 'Title: Test' \
  -d 'hello!' \
  https://ntfy.prayas.space/cyberdeck

# add new user (run inside proot)
ntfy user add <username>
```

## Webhook

```bash
# check all service statuses
curl 'https://restart.prayas.space/status?token=<token>'

# manually restart a service
curl 'https://restart.prayas.space/restart?service=picoclaw&token=<token>'
```

## Cloudflare

```bash
cloudflared tunnel list          # list tunnels
cloudflared tunnel run my-phone  # run tunnel manually
cloudflared tunnel route dns my-phone <subdomain>  # add DNS
```
