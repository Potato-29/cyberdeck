# Idea board

[← Documentation index](README.md)

A place to park ideas and things you want to build, at **ideas.prayas.space**.
Multi-user: anyone can register and gets their own private board.

This is the odd one out in the repo. It is the only sub-project with a **build
step**, a **database**, and **per-user accounts**. It does *not* use
`WEBHOOK_TOKEN`, and it does not follow the single-file-HTML convention.

## Flow

```
Browser ──https──> cloudflared ──> localhost:2124 ──> ideas/server.py
                                                            │
                                                      ~/ideas.db (SQLite, WAL)

ideas/web/  ──npm run build (on the PC)──>  ideas/web/dist/  ──served by Flask
```

One Flask process serves both the JSON API and the built React bundle, so there
is one port and no CORS.

## Files

| File | Role |
| --- | --- |
| `ideas/server.py` | Flask app — API + SPA, port 2124 |
| `ideas/db.py` | SQLite connection per request, WAL, `init_db()` |
| `ideas/auth.py` | Password hashing, sessions, login throttle, decorators |
| `ideas/schema.sql` | Tables and indexes, applied on every boot |
| `ideas/web/` | Vite + React + TypeScript source |
| `ideas/web/dist/` | **Committed build output** — the phone has no node |

## Setup

On the PC, build the frontend whenever `ideas/web/src` changes:

```sh
cd ideas/web
npm install
npm run build          # -> ideas/web/dist/
```

Add the keys from `.env.example` to `.env`, then generate a real session secret:

```sh
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the repo to the deck and start it (the registry entry does this at boot):

```sh
tmux new-session -d -s ideas 'python3 ~/cyberdeck/ideas/server.py'
```

Add the tunnel hostname — see [Cloudflare tunnel](cloudflare-tunnel.md):

```yaml
  - hostname: ideas.prayas.space
    service: http://localhost:2124
```

```sh
cloudflared tunnel route dns my-phone ideas.prayas.space
```

## Local development

```sh
python3 ideas/server.py --dev     # API on 2124, allows http cookies
cd ideas/web && npm run dev       # UI on 5173, proxies /api -> 2124
```

`--dev` matters: session cookies are `Secure` in production and a browser will
not send those over plain http, so login silently fails without it.

## Configuration

| Key | Default | Notes |
| --- | --- | --- |
| `IDEAS_PORT` | `2124` | |
| `IDEAS_DB` | `~/ideas.db` | Outside the repo, on purpose |
| `IDEAS_SESSION_SECRET` | *required* | Changing it signs everyone out |
| `IDEAS_SIGNUP_MODE` | `open` | `open` / `invite` / `closed` |
| `IDEAS_DEV` | unset | `1` is the same as `--dev` |

To close registration without a code change:

```sh
# in .env
IDEAS_SIGNUP_MODE=closed
# then
curl -X POST 'https://restart.prayas.space/restart?token=...&service=ideas'
```

For `invite` mode, hand out codes by inserting them:

```sh
sqlite3 ~/ideas.db "INSERT INTO invites (code, created_at) VALUES ('$(openssl rand -hex 6)', datetime('now'));"
sqlite3 ~/ideas.db "SELECT code FROM invites WHERE used_by IS NULL;"
```

## Security model

Everything else on the deck shares one `WEBHOOK_TOKEN` and has no users. This
service holds **other people's password hashes**, so it is stricter:

- Passwords hashed with `werkzeug.security` (scrypt). No plaintext, ever.
- Sessions are Flask signed cookies — `HttpOnly`, `SameSite=Lax`, `Secure` in
  production, 30 days.
- **Every idea query filters `WHERE user_id = ?` in SQL.** Requesting someone
  else's idea returns `404`, not `403` — a 403 would confirm the row exists.
- Login is throttled: 8 failures per email+IP locks that pair out for 15 minutes.
- Wrong-password and unknown-email return byte-identical responses, so the login
  endpoint cannot be used to enumerate accounts.
- Mutations require an `X-Requested-With: ideas` header, which a cross-origin
  form cannot set. That plus `SameSite=Lax` is the CSRF defence.
- Idea bodies are rendered as HTML and a shared idea is readable by anyone with
  the link, so markdown goes through DOMPurify before it reaches the DOM.
- `~/ideas.db` is chmod 0600 and lives outside the repo so it can never be
  committed.

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/register` | none — honours `IDEAS_SIGNUP_MODE` |
| POST | `/api/auth/login` | none — throttled |
| POST | `/api/auth/logout` | session |
| GET | `/api/auth/me` | none — returns `null` when signed out |
| POST | `/api/auth/password` | session |
| GET | `/api/ideas` | session — `?status=&tag=&q=&sort=&archived=` |
| POST | `/api/ideas` | session |
| GET/PATCH/DELETE | `/api/ideas/<id>` | session, owner only |
| POST | `/api/ideas/<id>/share` | session, owner only |
| GET | `/api/tags` | session |
| GET | `/api/export` | session — `?format=json\|md`, downloads a file |
| POST | `/api/capture` | **API token** — `X-Api-Token` header |
| GET | `/api/public/<slug>` | none — read-only shared idea |
| GET | `/health` | none |

### Heat and the cold view

Every idea carries a `heat` score, 0–100, halving every three weeks since it was
last touched. It's computed on read from `updated_at` — there is no stored
column and no job to keep it in sync.

`?sort=cold` orders longest-untouched first, which is the point of the score:
ideas you've forgotten rise instead of sinking. Shipped and dropped ideas are
excluded, since those aren't neglected — unless you asked for that status
explicitly, in which case the filter wins. On the board, anything below heat 20
(roughly seven weeks untouched) gets a quiet `cold` marker; parked and archived
ideas are exempt, because sitting still is what they're for.

### Export

`GET /api/export` returns everything that account owns, archived included.
`format=json` round-trips the full record (tags, notes, timestamps, share slugs)
and is the one to keep; `format=md` is a readable dump. Both come back as file
downloads, so the Settings page links to them directly rather than going through
fetch — the session cookie rides along on the GET.

### Quick capture from a script

Each user has an API token (Settings page). Park an idea from anywhere:

```sh
curl -X POST https://ideas.prayas.space/api/capture \
  -H "X-Api-Token: $IDEAS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Idea from the terminal","tags":["cli"]}'
```

## Backups

The only irreplaceable state on the deck. Back it up on a schedule, not after
the first loss:

```sh
mkdir -p ~/backups
sqlite3 ~/ideas.db ".backup ~/backups/ideas-$(date +%F).db"
ls -t ~/backups/ideas-*.db | tail -n +8 | xargs -r rm   # keep 7
```

Use `.backup` rather than `cp` — WAL mode means a plain copy can catch the
database mid-write.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Frontend not built." | `ideas/web/dist/` missing — run `npm run build` and copy it over |
| Login appears to succeed then bounces back | Running over http without `--dev`; the `Secure` cookie is dropped |
| Everyone signed out after a restart | `IDEAS_SESSION_SECRET` changed or is unset |
| `Missing required environment variable` on boot | `IDEAS_SESSION_SECRET` not in `.env` |
| 429 on login | Throttled — wait 15 minutes, or clear `login_attempts` |
| `database is locked` | Another process has the DB open; WAL + a 5s busy timeout should prevent it |
| Deep links 404 | Flask's SPA catch-all isn't serving `index.html`; check `dist/` copied fully |

## Roadmap

**Built:** capture, statuses, tags, search, per-idea share links, accounts,
keyboard shortcuts, light/dark, heat + the cold view, export.

Remaining, in rough value order:

1. **Append-only note log per idea**, so ideas can evolve instead of going stale.
   The `idea_notes` table already exists and export already emits a `notes` key —
   it needs endpoints and UI.
2. **Weekly ntfy resurfacer** — "still want to build this?" for the top few cold
   ideas. `?sort=cold` is the query it should run. Reuses `send_ntfy` from
   [webhook_new.py](../webhook_new.py). See the note below on which user.
3. **Dashboard tile** on `dashboard.html`. Needs a decision first: the deck
   dashboard authenticates with `WEBHOOK_TOKEN`, but ideas has per-user
   sessions, so it can't know *whose* count to show. Either link out with no
   numbers, or add a token-authed `GET /api/summary` and put one user's API
   token in `.env`.
4. **Impact/effort scores and a 2×2 quadrant view.** Backend is already done —
   the columns exist and `PATCH` validates and clamps them to 1–5, so this is
   UI only. Worth waiting until the board has ~30 ideas; a quadrant with six
   dots is noise.
5. **Groq assists** (auto-tag, expand a one-liner, flag near-duplicates) — the
   call pattern already exists in [standup.py](../standup.py). Duplicate
   detection also needs a corpus before it says anything useful.
6. **`[[idea title]]` backlinks.** The `idea_links` table is already there.

Items 2 and 3 share an open question: this service is multi-user, but ntfy and
the deck dashboard are yours alone. Both features are realistically single-user
and need a nominated account, not a loop over every user.
