# Work log

[← Documentation index](README.md)

Capture what happens while it happens, across several projects at once, then
assemble the Friday update from it. One backend, two clients.

## Why

The standup nudge ([Weekly standup](standup.md)) asks once a day and only gets
what you still remember at 18:30. Everything between prompts is lost, and it has
no idea which project a line belongs to.

This owns notes, contexts, transcription, and Friday assembly. The **Work tab**
and the **ESP32 desk device** are both just things that POST to it — so the
capture path is the same whether you type it, paste it, or say it.

It is a **log, not a todo list**. There are deliberately no checkboxes, no
"done" state, no due dates. The moment it becomes a todo list it becomes
maintenance, and it gets abandoned.

## How it works

```
Work tab      ──► POST /api/notes  {text}          ──┐
(browser)         GET  /api/notes?date=&ctx=         │
                  GET  /api/search?q=                ├──► SQLite  ~/work-logs.sqlite
                                                     │    notes / contexts / breadcrumbs
"hey jarvis"  ──► deskbuddy ──► Whisper ──► text   ──┘    + FTS5 on notes.raw_text
(INMP441 mic)     └─ worklog.py routes the transcript:
                       note / breadcrumb / switch / recall ──► the work log
                       question                            ──► the assistant

Friday        ──► GET /api/friday/draft   reads the week, writes nothing back
                    └── grouped by context ──► Groq ──► five sections
                          └── edit in the tab ──► [COPY] ──► paste into Slack
```

Runs in **Termux** (not proot) under tmux on port **2127**, exposed as
`work.prayas.space`.

## Data model

Three tables. `schema.sql` is applied on every boot and is all
`CREATE ... IF NOT EXISTS`, so additive changes need no migration.

| Table | Holds |
| --- | --- |
| `contexts` | What you're juggling — `ruby`, `platform`, `misc` by default |
| `notes` | What happened. `source` is voice/deck/device, `audio_path` for voice |
| `breadcrumbs` | **Where you stopped.** Separate table on purpose |
| `app_state` | Single row: which context is active |

`notes` and `breadcrumbs` are kept apart because they answer different
questions. Notes are "what happened"; breadcrumbs are "where I stopped".
Overloading one table makes the "where was I" lookup messy, and it is
breadcrumbs that feed The Horizon section on Friday.

Search is FTS5 with an external-content index and three triggers
(insert/update/delete). The triggers are mandatory, not an optimisation:
without them, search silently returns notes you deleted weeks ago.

## API

Everything under `/api` needs the token — `Authorization: Bearer <t>`,
`X-Token: <t>`, or `?token=`. The ESP32 uses Bearer; the page uses `?token=`
because it reads the token off its own URL.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/notes` | `{text}` **or** a streamed audio body — same endpoint, different content type |
| GET | `/api/notes?date=&ctx=&limit=` | |
| PATCH / DELETE | `/api/notes/:id` | |
| POST | `/api/notes/:id/retranscribe` | Retry a `failed` voice note |
| GET | `/api/contexts` | With `last_breadcrumb`, `note_count`, `is_active` |
| POST | `/api/contexts` | `{name}` |
| POST | `/api/contexts/:id/switch` | Returns the breadcrumb, so the device can speak it |
| POST | `/api/contexts/:id/breadcrumb` | Body optional — an empty POST is a bare marker |
| GET | `/api/search?q=` | FTS5, `ORDER BY rank`, with snippets |
| GET | `/api/today` | Active context, elapsed, note count, `logged_today` |
| GET | `/api/friday/draft?week=&refresh=1` | |
| POST | `/api/friday/approve` | Returns Slack-formatted text |
| GET | `/work?token=` | The Work tab |
| GET | `/health` | No auth, for the status checker |

## Voice capture

There is no separate work-log firmware. [Desk Buddy](deskbuddy.md) already has
the mic, the "hey jarvis" wake word, and Whisper — so it does the listening and
the work log only ever receives **text**.

`deskbuddy/worklog.py` hooks into `broker.run_turn()` immediately after STT.
Every transcript gets classified once by a small fast model
(`BUDDY_INTENT_MODEL`, default `llama-3.1-8b-instant`, temperature 0) into one
of five intents:

| Say | Intent | What happens |
| --- | --- | --- |
| "the migration rollback needs a dry-run flag" | `note` | Logged to the active context → *"Logged to ruby."* |
| "log that I fixed the nil guard" | `note` | Command verb stripped, stored as a plain statement |
| "switch to platform" | `switch` | Switches, then **speaks the breadcrumb back** |
| "I stopped halfway through the serializer" | `breadcrumb` | Saved against the active context |
| "where was I" | `recall` | Speaks where you left off |
| "how do I reverse a linked list" | `question` | Falls through to jarvis, unchanged |

A statement about your own work is a note by default; you only need a command
verb when you want to be explicit. Nothing about the existing assistant changes —
anything classified as a question takes exactly the path it did before.

If the classifier is unreachable, a local keyword heuristic takes over. It is
biased toward `note`: when Groq is down, STT has usually failed too, and a
stray question filed as a note is one tap to delete, whereas a note that
silently became a chat reply is gone. Every confirmation is spoken, so a
misroute is immediately audible.

Set `BUDDY_WORKLOG=0` to disable the routing entirely and leave jarvis as it was.

> `worklog.py` runs inside proot while the work log runs in Termux.
> `proot-distro` does not create a network namespace, so `127.0.0.1:2127`
> reaches across — the same reason `PULSE_SERVER=tcp:127.0.0.1:4713` already
> works for playback.

### The audio path

Unused by the voice flow above, since deskbuddy transcribes before the work log
ever sees the utterance. It exists for a future direct-from-device path.


`POST /api/notes` with `Content-Type: audio/L16;rate=16000` (raw PCM from the
device) or `audio/wav` (a complete file). The body is **streamed**, not
buffered — without PSRAM the ESP32 has about four seconds of heap, which is not
a voice note.

It returns **201 immediately** with `status: "pending"` and transcribes out of
band. Whisper takes a couple of seconds and the device is holding the connection
open waiting for its confirm beep; blocking would be felt on every note.

On failure the note goes to `status: "failed"` and **the WAV is kept**. Losing
audio that cannot be re-recorded is the one unrecoverable failure here, so
nothing on this path deletes a file — including note deletion.

## Friday assembly

Same five sections as [standup.py](standup.md), so the output matches what you
already post. Two things differ, and they are what make it usable:

- **The model's input is grouped by context, then chronologically** — not by
  day. A weekly update to a team is organised by project. Nobody wants to read
  "on Tuesday I...".
- **Breadcrumbs go in separately, labelled as open threads.** They are literally
  where you stopped, which is what The Horizon is asking for.

The prompt also pins three rules the standup version does not need: keep
identifiers and error strings exact, treat `[voice]` notes as transcriptions
that may be disfluent, and do not inflate a thin week.

If `GROQ_API_KEY` is unset or Groq fails, it falls back to a template that
buckets the raw notes under headings — a mediocre draft beats a 500. The
`generated_by` field says which path ran.

Drafts are cached per ISO week, keyed on the note count so an edit invalidates
them, and `?refresh=1` regenerates. **The draft never writes back to notes**, so
you can edit notes and re-run it as often as you like.

`approve` does **not** post to Slack — there is no Slack integration on this
deck and no `SLACK_*` secret. It records the approved text and hands it back for
the tab's COPY button, the same way the standup draft is actually delivered.

## Deploy

```sh
# on the PC
scp -r work-log-tool deck:~/cyberdeck/

# on the phone (Termux — NOT proot)
cd ~/cyberdeck/work-log-tool && npm install --omit=dev
tmux new-session -d -s worklog 'node ~/cyberdeck/work-log-tool/server.js'
```

Then add the subdomain (`work` → 2127) per
[Cloudflare tunnel](cloudflare-tunnel.md), and the service is already in
`services.json` so `/status`, the dashboard tile, ntfy alerting and boot all
follow automatically.

> **Termux, not proot.** proot's `$HOME` is `/root`, so
> `proot-distro login ubuntu -- node ~/cyberdeck/...` resolves to a *different,
> stale* checkout and would silently run old code rather than fail loudly.
> Termux has node v26 and npm; there are no native dependencies to compile.

## Backups

WAL is on, so a plain `cp` can catch a torn state. Use SQLite's own backup:

```sh
sqlite3 ~/work-logs.sqlite ".backup ~/backups/work-logs-$(date +%F).db"
```

Audio lives in `~/work-log-audio/` and is not covered by that — copy it
separately if the recordings matter to you.

## Gotchas

| Symptom | Cause |
| --- | --- |
| Every request 503s | `WEBHOOK_TOKEN` unset. It refuses to serve rather than run open |
| Search returns deleted notes | FTS triggers missing — `INSERT INTO notes_fts(notes_fts) VALUES('rebuild');` |
| Notes stuck on `pending` | Groq unreachable; they flip to `failed` and the retry button re-runs them |
| Draft is always `template` | `GROQ_API_KEY` empty in the `.env` the service actually loaded |
| Notes land on the wrong day | Timestamps are local-offset ISO by design, so "today" matches human today |

---

*CYBERDECK — prayas.space*
