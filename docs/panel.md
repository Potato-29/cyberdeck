# Panel — grid pages + control panel

`panel/` is a third dashboard, modelled on
[PhoneBox](https://github.com/ersinkoc/phonebox) (MIT, see
`panel/THIRD-PARTY-NOTICES.md`). It has two parts:

- **The panel** at `/panel`, for the deck in landscape. You lay out pages as a
  **12 × 6 grid** of widgets: rounded tiles, ring gauges, tinted Stream Deck keys.
- **The control panel** at `/panel/edit`, for a desktop browser (it also works
  on a phone). Lay out pages by dragging and resizing, set widget options, start
  from templates, edit shortcut keys, and try the webhooks.

It runs side by side with `/hud` and `/dashboard`; neither is touched.

```
https://restart.prayas.space/panel?token=<WEBHOOK_TOKEN>
https://restart.prayas.space/panel/edit?token=<WEBHOOK_TOKEN>
```

## How it's served

It adds no process and no port. The hub (`webhook_new.py`, 2122) serves the
committed build in `panel/dist/`, the same way it serves `hud/dist/`. Both URLs
use the same bundle; the editor is a separate chunk, so the phone never
downloads it.

| Route | Auth | Does |
| --- | --- | --- |
| `GET /panel`, `/panel/edit` | token | the app |
| `GET /panel/assets/<file>` | none | hashed JS/CSS |
| `GET /panel/config` | token | the layout (seeds `~/panel.json` on first call) |
| `PUT /panel/config` | token | save: validated, `rev` bumped. A stale `rev` gets **409**; a bad layout gets **400** with a readable message |
| `GET /panel/catalog` | token | `panel/widgets.json` + `panel/templates.json` |
| `POST /panel/push/<key>` | token | set a pushed value (`?ttl=` seconds) |
| `GET /panel/push`, `DELETE /panel/push/<key>` | token | list / remove pushed values |
| `POST /panel/notify` | token | toast on the panel (+ optional page switch) |
| `POST /panel/goto/<page>` | token | switch page by id or 1-based number; `?countdown=0..30`, default 3 |
| `GET /panel/events?since=<seq>` | token | what the panel polls every 2s for notifies and switches |
| `POST /panel/key/<id>` | token | run one shortcut |

Storage and validation are in `panel_store.py`, which needs no `.env`, so it can
be tested on its own.

| File | What | In git |
| --- | --- | --- |
| `~/panel.json` (`PANEL_PATH`) | the live layout | no — outside the repo so a `git pull` never overwrites edits |
| `~/panel-push.json` (`PANEL_PUSH_PATH`) | pushed values; they survive restarts | no |
| `panel/layout.default.json` | seeds the first run. Delete `~/panel.json` to reseed | yes |
| `panel/widgets.json`, `panel/templates.json` | catalogue and templates, read fresh per call | yes |

Notifies and page switches are kept only in memory (the last 50). After a hub
restart, older ones are stale anyway. The response carries a `boot` id, so the
panel can tell a restart from "nothing new".

## Shortcuts can't hold commands

A shortcut picks **what** to run from lists the hub already allows. It never
contains a shell command:

| `do.kind` | `ref` | Runs |
| --- | --- | --- |
| `action` | `actions.json` key | the same code as `/action/run` |
| `pc_app` | `deck-apps.json` key | `/deck/launch` via the PC agent |
| `service_restart` / `service_stop` | `services.json` key | `/restart` / `/stop` |
| `feed` | — | `/feed` |
| `spotify` | `toggle` `play` `pause` `next` `previous` | `/spotify/control` |
| `goto` | page id | switches the panel (handled in the browser) |
| `push` | push key (+ `value`, `ttl`) | sets a pushed value |
| `url` | `https://…` | opened by the browser that pressed the key |

So the token, which the editor and every webhook use, can't be turned into
"run anything" through a saved layout. To add a new command, put it in
`actions.json` by hand, then pick it in the editor. `PUT /panel/config` rejects
any other kind. Setting `confirm: true` on a key asks before it runs.

## Webhooks

```sh
curl -X POST "https://restart.prayas.space/panel/push/temperature?token=$TOKEN" -d 21.5
curl -X POST "https://restart.prayas.space/panel/push/build?token=$TOKEN" \
  -H "Content-Type: application/json" -d '{"value":"passed","sub":"main · 3m","level":"ok","progress":100}'
curl -X POST "https://restart.prayas.space/panel/push/door?token=$TOKEN&ttl=600" -d open
curl -X POST "https://restart.prayas.space/panel/notify?token=$TOKEN" \
  -H "Content-Type: application/json" -d '{"title":"Deploy","text":"Production is live","level":"ok","page":"home"}'
curl -X POST "https://restart.prayas.space/panel/goto/music?token=$TOKEN"
```

Push fields: `value title sub unit icon color level progress items ttl`.

- `level` is `ok` / `warn` / `error` / `info`. Words like *passed*, *failed* and *running* are coloured even without it.
- `progress` takes 0–1 or 0–100.

Notify fields: `title text level seconds page`. A plain-text body works for
both push and notify. The editor's Webhooks tab has these examples with your
host filled in (never the token), test buttons, and the current values.

Unlike ntfy, the JSON body handles emoji fine. The latin-1 problem is only with
HTTP headers.

## Panel behaviour

- **Navigation:** flick left/right, use the arrow keys, or tap a dot. Tap the
  current page's dot (or long-press the dots) for an overview of every page.
  Pages with *Shown* off are skipped.
- **Page switches** from webhooks show "Switching to Music in 3… Stay / Go now".
  The countdown waits while the screen was touched in the last 10s, and
  `?countdown=0` switches straight away.
- **Idle:** after `idleMinutes` (General tab; default 5, and 0 turns it off)
  the panel goes back to the home page.
- **Live edits:** the panel re-reads the config every 5s and follows a new `rev`.
- **Screen:** the panel asks for a screen wake lock while it is visible.
- **Portrait:** widgets stack two-up in reading order.

## Widgets

| Category | Widgets |
| --- | --- |
| Time | Clock (date, weather, seconds) · Analog clock · Title |
| Computer | Gauge (ring) · Metric tile (number + sparkline) · Chart (up to 3 readings, last ~6 min) |
| Deck | Services (start/stop) · Phone battery · Wi-Fi · System |
| Media | Now playing (Spotify, volume) · PC audio (mic/speaker mute) |
| Controls | Shortcut grid · Big button · PC apps · Cat feeder |
| Web & data | Weather · News · Forza (LAN only, as in the HUD) · Pushed value (value / ring / list) · Notifications |

Gauges, tiles and charts all choose a **reading** from one list in
`src/metrics.ts`: `pc.cpu pc.gpu pc.ram pc.cpu_temp pc.gpu_temp pc.fan
deck.cpu deck.ram deck.disk deck.battery deck.battery_temp deck.wifi`. They
all come from `/dashboard/data`, which is polled every 4s. History is kept in
the browser.

Data that only one widget type uses (Spotify, PC apps, audio, pushed values,
feeder) is polled only while a widget of that type is on screen.

### Adding a widget type

1. Add an entry to `panel/widgets.json` (type, category, size, options). The
   option types are `bool text number select metric shortcut shortcuts pushkey
   lines color`, and the editor builds its fields from them.
2. Write the component in `panel/src/widgets/` and register it in
   `widgets/index.ts`.
3. Rebuild.

## Look and motion

PhoneBox's style: near-black background, 18px rounded tiles, one hue per
reading, keys tinted with their own colour. The motion budget is the HUD's
(`docs/hud.md`), because the deck's GPU is the same:

- no blur, glow or shadows
- opacity fades, a 300ms ring transition and small colour transitions only
- nothing runs per frame
- `prefers-reduced-motion` turns it all off

Type scales with each widget's cell through container-query units, so a gauge
reads the same at 2×2 and 4×4.

## Building

```sh
cd panel && npm install && npm run build   # on the PC; commit panel/dist
```

`npm run dev` serves on 5175 and proxies the API to a hub on `127.0.0.1:2122`.
