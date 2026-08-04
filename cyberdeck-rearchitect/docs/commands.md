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
curl 'https://restart.prayas.space/restart?service=hermes&token=<token>'

# manually stop a service (a confirm prompt only exists in the dashboard UI —
# this curl form stops immediately, including cloudflared/webhook)
curl 'https://restart.prayas.space/stop?service=hermes&token=<token>'

# list whitelisted quick actions (keys only — see actions.json for the full set)
curl 'https://restart.prayas.space/actions/list?token=<token>'

# run a whitelisted quick action
curl -X POST 'https://restart.prayas.space/action/run?action=run_health_check&token=<token>'

# open the control panel in a browser
open 'https://restart.prayas.space/dashboard?token=<token>'
```

Valid `service=` values and what each does are defined in `services.json`; valid `action=` values are defined in `actions.json` — see [Services](services.md).

## Cloudflare

```bash
cloudflared tunnel list          # list tunnels
cloudflared tunnel run my-phone  # run tunnel manually
cloudflared tunnel route dns my-phone <subdomain>  # add DNS
```
