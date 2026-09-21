# Vaultwarden

[← Documentation index](README.md)

Bitwarden-compatible password manager, port **2129**, served at `vault.prayas.space`.
Runs inside proot Ubuntu — see [Services](services.md#descriptions) for how it's
wired into `services.json`.

## Why proot, and why built from source

Vaultwarden doesn't publish standalone Linux binaries — only Docker images. proot
has no Docker, so there's no image to pull. The fix is to build the Rust binary
from source once, inside proot (Termux's bionic libc can't run a glibc/musl Linux
binary directly, which is also why this can't run straight in Termux the way
Syncthing does).

## One-time build

Inside proot Ubuntu (`proot-distro login ubuntu` from Termux):

```sh
apt update
apt install -y build-essential git pkg-config libssl-dev libsqlite3-dev curl

# Rust via rustup, not apt — apt's rustc is often below vaultwarden's MSRV
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

git clone https://github.com/dani-garcia/vaultwarden.git
cd vaultwarden
cargo build --features sqlite --release
```

`cargo build` compiles the server itself — this is the slow, CPU-heavy step on a
phone SoC. Expect it to take a while; keep the phone plugged in and don't run
anything else heavy alongside it. It needs modest RAM for the server binary
itself, but linking can spike — if the build gets OOM-killed, that's the signal
to free up memory (close other proot sessions) and retry rather than a build bug.

Install the resulting binary onto `PATH` inside proot, so the `services.json`
start command (which just invokes `vaultwarden`) can find it:

```sh
cp target/release/vaultwarden /usr/local/bin/vaultwarden
```

## Web vault UI

The web UI is a separate prebuilt download (Vaultwarden doesn't bundle or build
it) — grab it from `bw_web_builds` rather than compiling Bitwarden's own clients
repo (which needs Node/npm):

```sh
WEB_VAULT_VERSION=$(curl -s https://api.github.com/repos/dani-garcia/bw_web_builds/releases/latest \
  | grep -oP '"tag_name": "\K[^"]+')
cd ~
curl -L -o web-vault.tar.gz \
  "https://github.com/dani-garcia/bw_web_builds/releases/download/${WEB_VAULT_VERSION}/bw_web_${WEB_VAULT_VERSION#v}.tar.gz"
tar xzf web-vault.tar.gz
rm web-vault.tar.gz
```

This extracts to `~/web-vault` (i.e. `/root/web-vault` in proot). Vaultwarden
looks for a `web-vault/` folder relative to its working directory by default,
and the `services.json` start command's `bash -c` runs from `/root` — so as long
as it lands at exactly `/root/web-vault`, no `WEB_VAULT_FOLDER` env var is
needed. If you put it anywhere else, add `WEB_VAULT_FOLDER=/absolute/path` to
the `start` command in `services.json`.

## First run / account setup

1. Generate an admin token: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
   and put it in `.env` as `VAULTWARDEN_ADMIN_TOKEN`.
2. Start it (via the dashboard, or `service_registry.py --ensure-all`, or directly
   for the first run to watch the logs — see the `start` command in `services.json`).
3. Visit `https://vault.prayas.space` and create your account.
4. Once it exists, set `SIGNUPS_ALLOWED=false` (already the default in the
   `services.json` start command) and restart — the endpoint stays reachable for
   login but stops accepting new registrations.
5. `/admin` is gated by `VAULTWARDEN_ADMIN_TOKEN`, not your account password —
   keep that token private, it's a full bypass of per-user auth for admin actions.

## Upgrading later

Re-run the `git clone`/`cargo build` steps in a fresh checkout (or `git pull` +
rebuild in place), swap the binary, and re-download `bw_web_builds` if there's a
newer web vault release. Vault data in `/root/vaultwarden-data` is untouched by
any of this — it's outside the vaultwarden source checkout.
