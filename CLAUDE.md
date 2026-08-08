# CLAUDE.md

Orientation for working in this repo. `docs/` is the source of truth — this file
exists so the layout, ports, and deploy model don't have to be rediscovered every
session. Start at [docs/README.md](docs/README.md) for anything deeper.

## What this is

Ops repo for the **cyberdeck**: a rooted Android phone permanently at the desk,
running Termux → proot Ubuntu. It runs background services and exposes them to
the internet as `*.prayas.space` through a Cloudflare Tunnel.

This is **not a website project**. Most files here are scripts and single-file
HTML pages that get copied to `~/cyberdeck/` on the phone and run under `tmux`.
Some run on the Windows PC instead — see the map below.

## Ports

The most collision-prone thing in the repo. Check here before picking one.

| Port | Service | Host |
| --- | --- | --- |
| 8022 | sshd | phone |
| 2121 | ntfy | phone (proot) |
| 2122 | `webhook_new.py` — the hub | phone |
| 2123 | `standup.py` standalone (testing only) | phone |
| 2124 | `ideas/server.py` | phone |
| 2125 | `deskbuddy/broker.py` — voice assistant broker (proot) | phone |
| 8000 | `forza/forza_listener.py` (UDP 5300 in) | phone |
| 8085 | LibreHardwareMonitor telemetry | **PC** |
| 8086 | `pc-deck-agent.py` app launcher | **PC** |

Subdomains: `ssh` → 8022, `ntfy` → 2121, `restart` → 2122, `race` → 8000,
`ideas` → 2124. Adding one is a 3-step manual process on the phone —
[docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md).

## Map of the tree

- **`services.json` + `service_registry.py`** — the service registry, and the
  single source of truth for what runs on the deck. Read fresh on every call, so
  editing the JSON takes effect with no restart. Shared by `webhook_new.py`,
  `status_checker_new.sh`, and `startup.sh`.
- **`webhook_new.py`** — the hub. Flask on 2122: service restart/stop/status,
  ESP32 cat feeder, PC app launcher proxy, quick actions, `/dashboard` +
  `/dashboard/data`. `webhook.py` is an older version; `webhook_new.py` is live.
- **`standup.py`** — Flask *blueprint*, registered into `webhook_new.py`. Serves
  `/standup*` on 2122. Persists to an append-only JSONL file.
- **`dashboard.html`** — 1400-line single-file cyberdeck HUD, served by `send_file`.
- **`forza/`** — standalone aiohttp service (HTTP + WebSocket) for the Forza telemetry HUD.
- **`ideas/`** — standalone idea board. **The exception to most rules below.**
- **`sketch_may1a/`** — ESP32 Arduino firmware for the cat feeder.
- **`deskbuddy/`** — "hey jarvis" voice assistant. ESP32 firmware (INMP441 mic +
  SSD1306 eyes) streams audio to a Groq broker (`broker.py`, aiohttp on 2125, in
  proot) that runs the wake word + STT/LLM/TTS. See [docs/deskbuddy.md](docs/deskbuddy.md).
- **`pc-deck-agent.py`, `pc-telemetry-monitor.py`, `note.ps1`** — run on the
  **Windows PC**, not the phone.
- **`*.sh`** — cron/health scripts on the phone.

## Conventions

- **No build step, no package manager.** No `package.json`, no lockfile, no
  `requirements.txt` anywhere except `ideas/web/`. Python deps (`flask`,
  `requests`, `aiohttp`, `pycaw`) are installed ad-hoc with `pip install`.
- **Config lives in JSON, read fresh per call** — `services.json`, `actions.json`,
  `deck-apps.json` all follow the same pattern: no caching, no restart to apply.
- **Pages are single-file, dependency-free HTML** served with
  `send_file(Path(__file__).parent / "x.html")`. No frameworks, no CDN scripts.
- **Env loading is duplicated verbatim per service, on purpose** — the
  `load_env_file`/`require_env` pair at [webhook_new.py:20-39](webhook_new.py#L20-L39)
  is copy-pasted into `standup.py`, `service_registry.py`, `pc-deck-agent.py`, and
  `ideas/server.py` so each can run standalone. Keep it that way; don't refactor
  it into a shared module. Every new key goes in [.env.example](.env.example).
- **Auth on legacy services is one shared secret** — `WEBHOOK_TOKEN`, checked by
  `verify_token` ([webhook_new.py:112](webhook_new.py#L112)) against `?token=` or
  the `X-Token` header. There are no users. Frontends read the token off their own
  URL and re-send it via an `apiUrl()` helper — never bake a secret into markup.
- **`pc-deck-agent.py` adds a second gate** — its own token *and* a LAN-only IP
  check, because it can launch arbitrary whitelisted apps.
- **Commits are lowercase, imperative, short** — `add valo tile`, `fix ntfy bug`.

## `ideas/` is the exception

Do not apply the conventions above to it. It deliberately has:

- **A build step** — Vite + React + TypeScript in `ideas/web/`. Built on Windows;
  `dist/` is committed so the phone needs no toolchain.
- **A database** — SQLite at `~/ideas.db`, *outside the repo* because it holds
  other people's password hashes. Nothing else in this repo has a DB.
- **Real per-user auth** — email + password, scrypt via `werkzeug.security`,
  signed session cookies. It does not use `WEBHOOK_TOKEN`.
- **Its own visual identity** — minimal, light/dark, serif. Nothing from the
  cyberdeck HUD theme (no scanlines, no neon cyan, no `clip-path` notches).

See [docs/ideas.md](docs/ideas.md).

## Deploy model

There is no CI and no PaaS. Copy files to `~/cyberdeck/` on the phone, then:

```sh
tmux new-session -d -s <name> 'python3 ~/cyberdeck/<script>.py'
```

Boot is via Termux:Boot → `~/.termux/boot/startup.sh` (tracked copy: `startup.sh`).

**To add a long-running service, add one entry to [services.json](services.json)** —
nothing in Python needs editing. That single entry drives `/status`, the dashboard
tiles, ntfy alerting (`alert`), and boot (`boot`, via
`service_registry.py --ensure-all`). Fields: `check` is one of `pgrep` / `tmux` /
`shell` / `http`, and `{ENV_VAR}` tokens in `check.value`, `start`, and `stop` are
interpolated from the environment.

Check via `tmux` rather than `pgrep` for anything started in a tmux session:
Android's `/proc` hides other processes, so process-based checks report a healthy
service as down (see the `_note` on `cloudflared`).

## Gotchas

- **ntfy must be published via the JSON API, not headers.** HTTP headers are
  latin-1 only, so an emoji title raises `UnicodeEncodeError` before the request
  is even sent. See the note at [webhook_new.py:117](webhook_new.py#L117).
- **`.env` is gitignored but present on disk.** Never print, echo, or commit it.
- **`.gitignore` is tiny** (3 entries + `ideas/web/node_modules/`). Check it
  before adding anything generated.
- **Groq model IDs get retired.** `STANDUP_MODEL` exists so they can be swapped
  without a code change.
- Scripts assume they run on the phone. Anything touching `pgrep`, `tmux`,
  `termux-*`, or `~/` paths cannot be tested on Windows.
