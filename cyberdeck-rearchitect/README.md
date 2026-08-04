# cyberdeck-rearchitect — staging area

This is a **passive staging copy**, not a running deployment. Nothing here is executed automatically. It contains the new/changed files from the service-registry + control-panel rework, so you can review them on-device before promoting anything into `~/cyberdeck` or `~/.termux/boot/startup.sh`.

## What's here

- `services.json` — new. Single source of truth for every background service.
- `service_registry.py` — new. Shared module + CLI (`--down`, `--ensure-all`, `--status`) that reads `services.json`.
- `actions.json` — new. Whitelisted quick-action scripts for the dashboard control panel.
- `startup.sh` — new. Tracked replacement for `~/.termux/boot/startup.sh`; calls `service_registry.py --ensure-all` instead of listing services one by one. **Not installed** — review it, then copy it into place yourself when ready (a bad boot script needs a physical reboot to notice, so this one's deliberately left for you to promote by hand).
- `webhook_new.py` — modified. `/restart` and `/status` now read from the registry; new `/stop`, `/actions/list`, `/action/run` routes.
- `status_checker_new.sh` — modified. Loops over `service_registry.py --down` instead of a hardcoded 3-service array.
- `dashboard.html` — modified. Service rows now render from `service_meta` (registry-driven), plus a new Control Panel: Start/Stop toggle per service, Quick Actions, and cat-feeder buttons.
- `docs/` — updated `services.md`, `architecture.md`, `operations-flows.md`, `commands.md`, `README.md`.

## What's NOT here / not touched

- Nothing in `~/cyberdeck` on the device has been modified.
- No tmux session has been restarted or stopped.
- `~/.termux/boot/startup.sh` has not been touched.

## Suggested promotion order (see the plan's rollout section for the full verification checklist)

1. Diff each file here against its counterpart in `~/cyberdeck`.
2. Copy `services.json`, `service_registry.py`, `actions.json` into `~/cyberdeck` first — inert additions, zero behavior change until something imports them.
3. Copy in the updated `webhook_new.py`, then restart just the `webhook` tmux session and verify `/status` and `/dashboard/data` still match what they returned before.
4. Copy in `status_checker_new.sh`; test by hand (kill one service, run the script directly) before trusting the next cron tick.
5. Copy in `dashboard.html`; reload the dashboard and check the control panel.
6. Only once 2–5 are confirmed stable, copy `startup.sh` into `~/.termux/boot/startup.sh` and verify a full `tmux kill-server && bash ~/.termux/boot/startup.sh` brings everything back.
7. Copy the `docs/` files into `~/cyberdeck/docs`.
