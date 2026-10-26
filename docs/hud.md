# HUD — React dashboard

`hud/` is the React rewrite of `dashboard.html`: an instrument-panel look (flat
dark panels, one mono typeface, one orange accent, segmented LED meters) built
for **the phone in landscape** (roughly 800×360 to 915×412 CSS px). It works in
portrait as a single scrolling column, but that layout isn't tuned.

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
| `GET /hud/assets/<file>` | none | hashed JS/CSS and the font (no secrets in them; a `<script>` tag can't send a token) |

The page reads `?token=` off its own URL and re-sends it on every API call
(`src/api.ts`), the same contract as `dashboard.html`. **No new backend
endpoints:** it uses `/dashboard/data`, `/restart`, `/stop`, `/service/alert`,
`/actions/*`, the feeder routes, `/deck/*` and `/audio/*`.

## Pages

The same four groupings as the old deck selector. Change page with the tabs
along the top, by flicking left/right, or with the arrow keys.

| Page | Panels |
| --- | --- |
| CORE | `SVC` services (start/stop, alert mute; down services float to the top), `BAT` battery, `NET` Wi-Fi, `ACT` quick actions + cat feeder |
| VITALS | `PC` CPU/GPU load, temps, RAM, fan · `DECK` CPU/RAM/disk · `SYS` uptime, storage, memory |
| PERIPH | `WX` weather · `FORZA` live telemetry (LAN only — the tunnel is https, so the ws:// socket is blocked) · `NEWS` (tap `[ + ]` to expand) |
| DECK | `AUDIO` PC mic/speaker mute · `LAUNCH` app grid |

Stopping `cloudflared` or `webhook`, and any action with `"confirm": true` in
`actions.json`, opens an in-page confirm dialog first.

## Look

- Flat fills and 1px hairlines only: no shadows, blur, translucency or
  gradients (apart from the static dot grid behind the panels).
- JetBrains Mono everywhere (one bundled woff2, no CDN). Labels are tiny
  tracked caps; readings are large tabular numerals.
- Orange is the accent for anything active or pressable. Green/red are
  reserved for up/down and for threshold colours on meters.
- Meters are rows of discrete cells (`ui/Meter.tsx`), not arcs or bars.
- Dark and a light "paper" theme. They follow the system, and the toggle in
  the top bar overrides it (stored in `localStorage` as `hud-theme`). The last
  page is remembered as `hud-page`.

## Motion

Written for the deck (Honor Play, Kirin 970), whose GPU can't carry an
animation library. There is none: no JavaScript runs per frame. The whole
budget is in `theme.css` → "Motion":

- a 100ms opacity fade when the page changes (and when a dialog opens);
- a 350ms background flash on a reading when its value changes (`ui/Value.tsx`);
- a 200ms colour transition on meter cells;
- two blinking elements: the LED of a down service, and the clock colon.

All of these are opacity or small repaints. A flick is judged on release; the
page does not follow the finger. `prefers-reduced-motion` turns it all off.

Other performance choices: polling (`hooks/usePoll.ts`) runs every 4s for
`/dashboard/data` and every 8s for the PC link, pauses while the tab is hidden
and backs off on errors; Forza packets that don't change the rounded values
don't re-render; the clock re-renders every 10s.

## Notch

The deck's browser reports `env(safe-area-inset-*)` as 0, so in fullscreen the
top bar sat under the notch. `useNotchInset()` (`src/notch.ts`) pads the notch
side (left at orientation angle 90, right at 270) whenever a touch device's
viewport spans the full long edge of the screen. The padding is 32px; to change
it, open the page once with `&notch=<px>` (remembered).

## Develop and deploy

Build on the PC, not the phone:

```sh
cd hud
npm install
npm run dev     # http://localhost:5174/hud/?token=...  (API proxied to 127.0.0.1:2122)
npm run build   # writes hud/dist — commit it
```

On the phone, copy `hud/dist/` into `~/cyberdeck/hud/` (no hub restart is needed
unless `webhook_new.py` changed), then reload the page.

Deck app icons live in `src/icons.ts`, copied from `ICON_IMAGES` in
`dashboard.html`. Add new keys in both places while the two pages coexist.
