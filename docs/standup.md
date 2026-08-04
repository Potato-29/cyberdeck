# Weekly standup

[← Documentation index](README.md)

Logs what you did each day, then hands you a pre-written weekly update on Friday.

## Why

The Friday bot asks five questions in a Slack thread. Answering them from memory
on Friday evening means forgetting most of the week. This captures the work as it
happens — one line at a time, from wherever you are — and assembles the answers
when you need them.

## How it works

```
Mon–Fri 18:30  cron ──► POST /standup/nudge
                          └── ntfy push: "What did you work on?"
                                └── tap ──► /standup?token=…  (log form on your phone)

any time       PC terminal ──► note.ps1 "fixed the hardcoded IPs"
                                 └── POST /standup/log

Friday 16:30   cron ──► POST /standup/friday
                          ├── reads this week's entries (Mon 00:00 → now)
                          ├── Groq turns them into the five answers
                          └── ntfy push ──► tap ──► /standup#weekly ──► [COPY]
```

Entries live in an append-only JSONL file on the deck (`STANDUP_FILE`, default
`~/standup-log.jsonl`). Nothing leaves the deck except the weekly synthesis call.

## Tags

Each note carries a tag saying which of the five questions it belongs to. The
generator uses it as a hint, not a hard rule.

| Tag | Section |
| --- | --- |
| `progress` | 1. The Progress |
| `ai` | 2. The AI Edge |
| `gap` | 3. The Automation Gap |
| `values` | 4. Values in Action |
| `next` | 5. The Horizon |

`progress` is the default, so most notes need no thought at all.

## Logging from the PC

`note.ps1` is the fastest path — it posts through the tunnel, so it works away
from home too. Copy it and `.env` to a folder on the PC, then add a function to
your PowerShell profile (`notepad $PROFILE`):

```powershell
function note { & "D:\projs\cyberdeck\note.ps1" @args }
```

```powershell
note fixed the hardcoded IPs in webhook_new
note -Tag ai had claude write the forza packet parser
note -Tag gap still copy-pasting release notes by hand
note -List                    # show this week's entries
```

Or from anywhere with curl:

```bash
curl -X POST 'https://restart.prayas.space/standup/log?token=<token>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"shipped the deck agent","tag":"progress"}'
```

## Deck setup

1. Copy `standup.py` and `standup.html` next to `webhook_new.py` on the deck.
   `webhook_new.py` registers the blueprint on import — no other wiring needed.
2. Add the standup keys to the deck's `.env` (see `.env.example`).
3. For AI-written drafts, grab a free key at
   [console.groq.com/keys](https://console.groq.com/keys) and set `GROQ_API_KEY`.
   Nothing to install — it's one HTTPS call through `requests`, which the webhook
   already uses.

   Without a key the draft still works; it just groups your raw notes under the
   five headings instead of writing prose. The page labels which was used.
4. Restart the webhook:

   ```bash
   tmux kill-session -t webhook
   tmux new-session -d -s webhook 'python3 ~/cyberdeck/webhook_new.py'
   ```

5. Add the two cron entries (`crontab -e` in Termux):

   ```cron
   # daily nudge, weekdays at 18:30
   30 18 * * 1-5 curl -sf -X POST 'http://127.0.0.1:2122/standup/nudge?token=<token>' >/dev/null
   # weekly draft, Friday at 16:30 — set this just before your Slack bot posts
   30 16 * * 5   curl -sf -X POST 'http://127.0.0.1:2122/standup/friday?token=<token>' >/dev/null
   ```

   Both hit localhost directly, so they keep working if the tunnel is down.

## Endpoints

Every route requires `?token=<WEBHOOK_TOKEN>`, same gate as the dashboard.

| Route | Purpose |
| --- | --- |
| `GET /standup` | The log page (form + this week's entries + draft tab) |
| `GET /standup/entries` | This week's entries as JSON; `?days=N` for a rolling window |
| `POST /standup/log` | Append an entry — `{"text": "...", "tag": "progress"}` |
| `POST /standup/delete` | Remove an entry by `{"id": "..."}` |
| `GET /standup/weekly` | The draft; `?refresh=1` regenerates instead of using the cache |
| `POST /standup/nudge` | Send the daily "what did you do?" push (cron) |
| `POST /standup/friday` | Regenerate the draft and push it (cron) |

## The weekly draft

Generated once per ISO week and cached in `standup-weekly-cache.json` next to the
log, so reopening the page doesn't burn a request. `[REGENERATE]` (or `?refresh=1`)
forces a new pass — useful after logging something on Friday afternoon.

The cache keeps every past week, not just the latest. If you open the page after
the week has rolled over and haven't logged anything yet in the new week, it keeps
showing last week's Friday draft instead of a blank one — the first note you log
in the new week is what makes it switch over.

The generator is told to ground every answer in your notes and to say a section is
thin rather than pad it, so an empty week produces an honestly empty draft. Read it
before pasting; it is a first draft, not a submission.

Set `STANDUP_VALUES` in `.env` to your company's actual values and section 4 will
name one of them instead of describing the behaviour generically.

**Model choice.** Groq's free tier is rate-limited per day, which is ample for one
call a week. The default is `llama-3.3-70b-versatile`; Groq retires model IDs every
few months, so if the draft suddenly falls back to `template`, check the webhook
log for a `model_decommissioned` error and point `STANDUP_MODEL` at a current ID
from [console.groq.com/docs/models](https://console.groq.com/docs/models). No code
change needed. Any OpenAI-compatible endpoint works — override `GROQ_URL` to point
somewhere else entirely.

Every failure path (no key, bad key, rate limit, dead model, network drop, garbled
reply) falls back to the note-grouped template, so Friday never leaves you with
nothing.

## Testing

`test-standup.sh` exercises every endpoint. It deletes the entries it creates and
rebuilds the weekly cache afterwards, so it is safe to run against the live log.

```bash
bash test-standup.sh                                  # localhost:2122, no pushes
bash test-standup.sh https://restart.prayas.space     # through the tunnel
bash test-standup.sh http://127.0.0.1:2122 --push     # also fire both ntfy pushes
```

It regenerates the draft, so each run costs one model call (two with `--push`).

Things the script can't check — do these by eye once:

- The log page on your phone: tag chips switch, `[SAVE ENTRY]` clears the box,
  `×` deletes, the FRIDAY DRAFT tab and `[COPY]` work.
- Tapping the ntfy notification opens the page **already logged in** — if you get
  a 401, the click URL lost its token.
- `note.ps1` from the PC, including `-List`.

To test the cron wiring without waiting for Friday, add a line a couple of minutes
out, confirm the push lands, then restore the real schedule:

```cron
*/2 * * * * curl -sf -X POST 'http://127.0.0.1:2122/standup/friday?token=<token>' >/dev/null
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Page is blank / 401 | Missing `?token=` on the URL |
| No daily push | cron entry missing, or `NTFY_*` values wrong — test with `POST /standup/nudge` by hand |
| Draft says `via template` | No `GROQ_API_KEY`, a retired `STANDUP_MODEL`, or a rate limit — the webhook log prints the reason |
| Draft looks stale | It's cached for the week — hit `[REGENERATE]` |
| Notification opens nothing | `RESTART_URL` unset in the deck's `.env`, so the push has no click target |
| `note.ps1` can't connect | Deck asleep or tunnel down — check `curl https://restart.prayas.space/health` |
