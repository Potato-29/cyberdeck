# HUD — React dashboard

`hud/` is the React rewrite of `dashboard.html`: a bento grid of widgets with
spring animations, built for **the phone in landscape** (roughly 800×360 to
915×412 CSS px). It works in portrait as a single scrolling column, but that
layout isn't tuned.

It runs **side by side** with the old page: `/dashboard` is unchanged and the new
one lives at `/hud`. It isn't at `/deck` because `/deck/*` is already the PC
launcher API.

```
https://restart.prayas.space/hud?token=<WEBHOOK_TOKEN>
```

## How it's served

The build is committed in `hud/dist/`, just like `ideas/web/dist/`, so the phone
needs no Node toolchain. `webhook_new.py` serves it from two routes:

| Route | Auth | Serves |
| --- | --- | --- |
| `GET /hud` | `WEBHOOK_TOKEN` | `hud/dist/index.html` |
| `GET /hud/assets/<file>` | none | hashed JS/CSS (no secrets in them; a `<script>` tag can't send a token) |

The page reads `?token=` off its own URL and re-sends it on every API call
(`src/api.ts`), the same contract as `dashboard.html`. **No new backend
endpoints:** it uses `/dashboard/data`, `/restart`, `/stop`, `/service/alert`,
`/actions/*`, the feeder routes, `/deck/*` and `/audio/*`.

## Pages

These are the same four groupings as the old deck selector. Change page by
swiping left/right, tapping the rail, or using the arrow keys.

| Page | Tiles |
| --- | --- |
| Core | Services (start/stop, alert mute; down services float to the top), Battery ring, Wi-Fi, Control (quick actions + cat feeder) |
| Vitals | PC CPU/GPU rings with temps, RAM, fan · deck CPU/RAM/disk rings · uptime, storage, memory |
| Periph | Weather · Forza live telemetry (LAN only — the tunnel is https, so the ws:// socket is blocked) · Tech news (tap ⤢ to expand) |
| Deck | PC mic/speaker mute · app launch grid |

Stopping `cloudflared` or `webhook`, and any action with `"confirm": true` in
`actions.json`, opens an in-page confirm sheet first.

## Stack

- Vite + React 19 + TypeScript. The only runtime dependency is `motion`.
- Motion is loaded through `LazyMotion` + `m.*` components, with
  `MotionConfig reducedMotion="user"`. Springs drive the numbers
  (`fx/AnimatedNumber.tsx`), rings and bars (`fx/Ring.tsx`), page transitions,
  the rail pill (`layoutId`), and the news sheet morph.
- The background (`fx/Orbs.tsx`) is three blurred divs drifting on transforms, in
  the style of React Bits' Aurora but without WebGL, to save the phone's GPU.
- Theme: light and dark follow the system, and the rail button overrides it
  (stored in `localStorage` as `hud-theme`). The last page is remembered as
  `hud-page`.
- Polling (`hooks/usePoll.ts`) runs every 4s for `/dashboard/data` and every 8s
  for the PC link. It pauses while the tab is hidden and backs off on errors.

## Performance on the deck

The deck (Honor Play) has a much weaker CPU/GPU than a current phone, so:

- **Nothing that loops runs in JavaScript.** The background orbs, the
  spinners and the down-service ripples are CSS keyframes, which run on the
  compositor. Rings and bars use CSS transitions. Motion only handles one-off
  interactions: page changes, taps, the sheet.
- The orbs are radial gradients, never `filter: blur`. Tiles enter with a
  translate and fade, never a scale. Chips and service rows measure their
  layout only when their label or order changes (`layoutDependency`), not on
  every 4s poll.
- **Lite mode** (`src/perf.tsx`) cuts further: the whole page fades as one
  layer, numbers are set instead of counted, tiles are opaque, the background
  is static, and scroll-edge masks are off. It switches on by itself if the
  first page animates in below ~45fps. To force it on the deck, open the page
  once with `&lite=1`; the choice is remembered (`&lite=0` forces it off,
  `&lite=auto` goes back to detecting).

Under 6× CPU throttling in headless Chromium, the old build ran at a median of
50 ms per frame (20 fps) while switching pages; this one runs at 16.7 ms (60 fps).

## Notch

The deck's browser reports `env(safe-area-inset-*)` as 0, so in fullscreen the
rail sat under the notch. `useNotchInset()` pads the notch side (left at
orientation angle 90, right at 270) whenever a touch device's viewport spans
the full long edge of the screen. The padding is 32px; to change it, open the
page once with `&notch=<px>`.

## Develop and deploy

Build on the PC, not the phone:

```sh
cd hud
npm install
npm run dev     # http://localhost:5174/hud/?token=...  (API proxied to 127.0.0.1:2122)
npm run build   # writes hud/dist — commit it
```

On the phone, copy `hud/dist/` and `webhook_new.py` into `~/cyberdeck/`, then
restart the hub:

```sh
tmux kill-session -t webhook && tmux new-session -d -s webhook 'python3 ~/cyberdeck/webhook_new.py'
```

Deck app icons live in `src/icons.ts`, copied from `ICON_IMAGES` in
`dashboard.html`. Add new keys in both places while the two pages coexist.
