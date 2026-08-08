# deskbuddy

A "hey jarvis" voice assistant: an ESP32 (INMP441 mic + SSD1306 OLED "eyes")
that streams audio to a broker on the phone, which runs the wake word and calls
**Groq** for speech-to-text, chat, and text-to-speech. Replies play on the phone
speaker (phase 1); the ESP32 speaker path lands in phase 2.

Full documentation: [../docs/deskbuddy.md](../docs/deskbuddy.md).

## Layout

| Path | Role |
| --- | --- |
| `broker.py` | aiohttp HTTP + WebSocket service on port 2125 — wake word + Groq pipeline |
| `dashboard.html` | Single-file HUD: live state, eyes preview, a text box to test the loop |
| `firmware/deskbuddy.ino` | ESP32 sketch — I2S mic streaming + OLED eyes |
| `firmware/secrets.h.example` | Template for Wi-Fi + broker config (real `secrets.h` is gitignored) |

## Run the broker (in proot Ubuntu)

```sh
pip install aiohttp openwakeword requests
python3 broker.py            # serves http://0.0.0.0:2125, ws :2125/ws
```

Needs `GROQ_API_KEY` in the repo-root `.env` (already there for standup). See
`../.env.example` for the `BUDDY_*` keys.

## Test without hardware

Open `http://<phone>:2125/` and type a query in the box — it runs LLM → TTS →
phone speaker and drives the eyes preview, bypassing the mic and wake word.
Audio playback needs the Termux PulseAudio bridge — see the docs.
