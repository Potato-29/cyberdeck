# ideas

Idea board for **ideas.prayas.space**. Standalone Flask service on port 2124
with its own user accounts and a SQLite database — it does *not* use
`WEBHOOK_TOKEN` like the rest of the deck.

Full documentation: [../docs/ideas.md](../docs/ideas.md).

## Run it locally

```sh
# terminal 1 — API on 2124 (--dev allows cookies over http)
python3 server.py --dev

# terminal 2 — UI on 5173, proxies /api to 2124
cd web && npm install && npm run dev
```

Needs `IDEAS_SESSION_SECRET` in the repo-root `.env`. See `../.env.example`.

## Build for the deck

```sh
cd web && npm run build     # -> web/dist/, which is committed
```

`web/dist/` is checked in on purpose: the phone has no node toolchain, so it
pulls the built bundle rather than building it. Rebuild and commit whenever
anything under `web/src/` changes.

## Layout

| Path | Role |
| --- | --- |
| `server.py` | Flask app — JSON API + serves the SPA |
| `db.py` | Per-request SQLite connection, WAL, schema bootstrap |
| `auth.py` | Password hashing, sessions, login throttle |
| `schema.sql` | Tables + indexes, applied on every boot |
| `web/src/` | Vite + React + TypeScript source |

The database lives at `~/ideas.db` — outside the repo, because it holds other
people's password hashes.
