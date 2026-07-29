# Debugging

[← Documentation index](README.md)

## Service won't start

- Check if port is in use: `fuser <port>/tcp`
- Kill stale process: `pkill -f <processname>`
- Check session logs: `tmux attach -t <session>`
- Run the start command **outside** tmux to see errors directly

## Dashboard shows wrong status

- `status_writer.sh` updates every ~5 seconds — wait and recheck
- Manual check: `pgrep -f <service> && echo running || echo dead`
- If pgrep says dead but dashboard says alive — restart wtfutil: `tmux kill-session -t dashboard`

## Cloudflare tunnel 502

- Confirm the target service is running locally
- Test locally: `curl http://localhost:<port>/`
- Restart tunnel: `tmux kill-session -t cloudflare`, then start fresh
- Logs: `tmux attach -t cloudflare`

## SSH connection refused

- Check sshd: `pgrep -x sshd` — start with `sshd` if needed
- Check tunnel: `tmux attach -t cloudflare`
- Test local SSH: `ssh -p 8022 localhost`

## ntfy 401 Unauthorized

- Wrong credentials — verify username and password
- Subscribe to the topic in the ntfy app
- Verify server: `pgrep -f 'ntfy serve'`

## Boot script didn't run after reboot

- Battery optimization: Settings → Apps → Termux → Battery → **Unrestricted**
- Same for **Termux:Boot**
- Open Termux:Boot at least once after install
- Executable boot script: `chmod +x ~/.termux/boot/startup.sh`
- Test manually: `bash ~/.termux/boot/startup.sh`

## proot / tmux separation

- Never run Termux tmux commands from inside proot
- All tmux sessions are Termux-side — SSH in and run `tmux ls` there
- Enter proot: type `ubuntu` from Termux
- proot services: `proot-distro login ubuntu -- <cmd>`
