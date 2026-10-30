#!/usr/bin/env python3
"""
One-time Spotify login for the HUD music page.

Prints a URL; open it in any browser, approve, and you land on
http://127.0.0.1:8888/callback?code=... which fails to load (nothing listens
there). Paste that whole URL back here and the script prints the
SPOTIFY_REFRESH_TOKEN line for .env. Run it anywhere the .env (or the two
SPOTIFY_CLIENT_* vars) is available. See docs/hud.md → Music.
"""

import os
import secrets
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests

REDIRECT_URI = "http://127.0.0.1:8888/callback"
SCOPES = "user-read-playback-state user-modify-playback-state"


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


_env_path = Path(__file__).resolve().parent / ".env"
load_env_file(_env_path)

CLIENT_ID = require_env("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = require_env("SPOTIFY_CLIENT_SECRET")


def main() -> None:
    state = secrets.token_urlsafe(16)
    url = "https://accounts.spotify.com/authorize?" + urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    })
    print("1. Open this URL and approve:\n")
    print("   " + url + "\n")
    pasted = input("2. Paste the URL you were redirected to: ").strip()

    query = parse_qs(urlparse(pasted).query)
    if query.get("state", [""])[0] != state:
        sys.exit("State mismatch — paste the URL from this run's login.")
    if "code" not in query:
        sys.exit(f"No code in that URL: {query.get('error', ['?'])[0]}")

    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": query["code"][0],
            "redirect_uri": REDIRECT_URI,
        },
        auth=(CLIENT_ID, CLIENT_SECRET),
        timeout=10,
    )
    if resp.status_code != 200:
        sys.exit(f"Token exchange failed ({resp.status_code}): {resp.text[:300]}")

    print("\n3. Add this line to .env on the phone, then restart the hub:\n")
    print("SPOTIFY_REFRESH_TOKEN=" + resp.json()["refresh_token"])


if __name__ == "__main__":
    main()
