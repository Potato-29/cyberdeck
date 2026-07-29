# Deck shortcuts (PC app launcher)

[← Documentation index](README.md)

Steam Deck-style tiles on the dashboard that launch apps on your Windows PC —
Chrome, Spotify, Discord, Steam games — and show which ones are running.

## How it works

```
Phone dashboard  ──POST /deck/launch?app=spotify&token=…──►  webhook_new.py :2122
                                                               │  (LAN)
                                                               ▼
                                                       pc-deck-agent.py :8086
                                                               │  whitelist lookup
                                                               ▼
                                                       start "" spotify:
```

The phone cannot launch PC apps directly, so `webhook_new.py` proxies to a small
agent running on the PC. This keeps a single origin for the browser and means the
launcher still works when you are away from home, through the Cloudflare tunnel.

The agent **never executes arbitrary commands**. It only runs entries defined in
`deck-apps.json`.

## PC setup

1. Copy `pc-deck-agent.py`, `deck-apps.json`, and `.env` to a folder on the PC.
2. `pip install flask`
3. Set `PC_AGENT_TOKEN` in `.env` — the **same value** must be in the phone's `.env`.
4. Open the firewall for the agent, scoped to your LAN (PowerShell as admin):

   ```powershell
   New-NetFirewallRule -DisplayName "Cyberdeck Deck Agent" -Direction Inbound `
     -LocalPort 8086 -Protocol TCP -Action Allow -RemoteAddress 192.168.0.0/16
   ```

5. Start it at login. **Do not install it as a Windows service** — services run in
   Session 0, so any GUI app they launch would be invisible. Use Task Scheduler with
   *"Run only when user is logged on"*, or drop a shortcut in:
   `shell:startup` → `pythonw pc-deck-agent.py`

## Adding apps

Edit `deck-apps.json` on the PC. Changes apply on the next poll — no restart needed.

```json
"vscode": {
  "label": "VS Code",
  "icon": "📝",
  "target": "C:/Users/you/AppData/Local/Programs/Microsoft VS Code/Code.exe",
  "proc": "Code.exe"
}
```

| Field | Meaning |
| --- | --- |
| `label` | Text on the tile |
| `icon` | Emoji shown above the label |
| `target` | Absolute exe path, **or** a protocol URI (`steam://`, `spotify:`) |
| `args` | Optional argument list passed to the exe |
| `proc` | Image name for `tasklist` — drives the RUNNING dot and the close button |

`%LOCALAPPDATA%` and other environment variables are expanded in `target` and `args`.

### Steam games

Use `steam://rungameid/<appid>` — Steam resolves it, so no exe path is needed and it
survives game updates and library moves. Find the AppID in the store page URL
(`store.steampowered.com/app/1551360/…`) or via right-click → Properties in your library.

### Discord

Must go through the updater stub, not the exe directly — the versioned path changes on
every auto-update:

```json
"target": "%LOCALAPPDATA%/Discord/Update.exe",
"args": ["--processStart", "Discord.exe"]
```

## Security model

Two independent gates, because either alone has a hole:

- **Token** — `/dashboard`, `/dashboard/data`, and all `/deck/*` routes require
  `?token=<WEBHOOK_TOKEN>`. Load the dashboard as
  `https://restart.prayas.space/dashboard?token=…`; the page threads that token into
  its own API calls, so no secret is baked into the HTML.
- **LAN-only agent** — `pc-deck-agent.py` rejects any caller whose source address is
  not private/loopback, and requires `PC_AGENT_TOKEN` on top of that.

Without the token gate, the tunnel would expose the launcher to anyone who found the
URL. Without the LAN check, anything else on your network could drive the agent directly.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /deck/apps?token=…` | List apps + running state. Returns `{"online": false}` if the PC is asleep |
| `POST /deck/launch?app=<key>&token=…` | Launch an app |
| `POST /deck/close?app=<key>&token=…` | Kill an app by its `proc` name |

```bash
# from anywhere
curl 'https://restart.prayas.space/deck/apps?token=<token>'
curl -X POST 'https://restart.prayas.space/deck/launch?app=spotify&token=<token>'

# agent health, from the LAN
curl 'http://<pc-ip>:8086/health?token=<agent-token>'
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `PC LINK OFFLINE` | PC asleep, agent not running, or firewall blocking 8086 |
| Tile says `FAILED` | Bad `target` path — check the agent's console output |
| App launches but no window appears | Agent is running as a service (Session 0). Run it as your logged-in user |
| `RUNNING` never lights up | `proc` does not match the real image name — check Task Manager → Details |
| Dashboard is blank / 401 | Missing `?token=` on the dashboard URL |
