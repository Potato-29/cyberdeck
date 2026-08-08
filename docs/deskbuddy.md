# Desk Buddy

[← Documentation index](README.md)

A desk voice assistant. An ESP32 listens 24/7, wakes on **"hey jarvis"**, and
answers spoken queries through **Groq** (the same key `standup` uses). An SSD1306
OLED shows animated **eyes** that react to what it's doing.

The ESP32 is a thin client — mic in + display out. The always-on phone does the
work: a broker (`deskbuddy/broker.py`) runs the wake word and every Groq call. A
plain ESP32 DevKit v1 has no PSRAM, so on-device wake word and Whisper aren't an
option; the phone is the brain, which also matches the rest of the deck.

**Phase 1 (this doc):** replies play on the **phone speaker** — there is no
speaker wired to the ESP32 yet, so the firmware has no audio-out code.
**Phase 2 (roadmap):** the GF1002 (PAM8403) amp + speaker on the ESP32's DAC.

## Flow

```
┌──────── ESP32 ────────┐   Wi-Fi/LAN   ┌──────── phone: proot Ubuntu ────────┐
│ INMP441 ─I2S─▶ 16kHz  │──ws binary──▶ │ broker.py :2125                     │
│ PCM ──────────────────│               │  openWakeWord "hey_jarvis" + VAD    │
│ SSD1306 eyes ◀────────│◀──ws json ────│  Groq STT ▶ Groq LLM ▶ Groq TTS     │
│  idle/listen/think/…  │  {"state":…}  │   └─▶ paplay ─▶ Termux PulseAudio ──▶ phone speaker
└───────────────────────┘               └─────────────────────────────────────┘
```

Turn: mic streams continuously → oWW watches for "hey jarvis" → on wake the eyes
go `listening` and the broker captures until you stop talking → `thinking` while
Groq transcribes + answers → `speaking` while the reply plays on the phone → back
to `idle`.

## Files

| File                                   | Role                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| `deskbuddy/broker.py`                  | aiohttp HTTP + WebSocket on port 2125; wake word + Groq STT/LLM/TTS |
| `deskbuddy/dashboard.html`             | HUD: live state, eyes preview, a `/say` test box                    |
| `deskbuddy/firmware/deskbuddy/deskbuddy.ino`     | ESP32 sketch — I2S mic streaming + OLED eyes                        |
| `deskbuddy/firmware/deskbuddy/secrets.h.example` | Wi-Fi + broker config template (`secrets.h` is gitignored)          |
| `~/deskbuddy-log.jsonl`                | Append-only transcript/reply log (outside the repo)                 |

## Hardware

| Signal             | ESP32 pin       | Notes                                                   |
| ------------------ | --------------- | ------------------------------------------------------- |
| INMP441 SCK (BCLK) | GPIO14          | I2S bit clock                                           |
| INMP441 WS (LRCL)  | GPIO15          | I2S word select                                         |
| INMP441 SD (DOUT)  | GPIO32          | I2S data in                                             |
| INMP441 L/R        | GND             | selects the left channel                                |
| INMP441 VDD / GND  | 3V3 / GND       |                                                         |
| SSD1306 SDA / SCL  | GPIO21 / GPIO22 | default I2C, address `0x3C`                             |
| SSD1306 VCC / GND  | 3V3 / GND       |                                                         |
| BOOT button        | GPIO0           | onboard; holds "listening" eyes as a local display test |

**Phase 2, when speaker wire arrives:** DAC **GPIO25** → GF1002 (=PAM8403,
**analog** input, _not_ I2S) → speaker; amp VCC→5V, GND→GND. PAM8403 output is
bridge-tied (BTL): the speaker goes across OUT+/OUT-, do **not** ground the
return. 4Ω or 8Ω both work. "Speaker wire" isn't a special part — any insulated
conductor (jumper wires, a stripped spare cable, alligator clips into the amp's
screw terminals) is fine at this power.

## Setup

### 1. Broker (in proot Ubuntu — _not_ Termux)

The broker must run under proot's glibc: openWakeWord's runtime
(onnxruntime / tflite-runtime) only ships glibc aarch64 wheels, which Termux's
bionic libc can't load.

```sh
ubuntu                       # enter proot Ubuntu
# Ubuntu's system Python is "externally managed" (PEP 668) and openWakeWord is
# PyPI-only (no apt package), so install it with pip's override — this matches
# the deck's global-pip convention on a single-purpose appliance:
pip install --break-system-packages aiohttp openwakeword requests
cd ~/cyberdeck/deskbuddy
python3 broker.py            # first run downloads the oWW models
```

Prefer isolation? Use a venv instead — but then run the broker with its Python
(`~/buddy-venv/bin/python broker.py`) and update the `buddy` `start` in
`services.json` to match:

```sh
apt install python3-venv
python3 -m venv ~/buddy-venv
~/buddy-venv/bin/pip install aiohttp openwakeword requests
```

If `onnxruntime` won't install on aarch64, `pip install --break-system-packages tflite-runtime` — oWW's lighter default backend — and it'll use that instead.

`GROQ_API_KEY` already lives in the repo-root `.env` (shared with standup). Add
the `BUDDY_*` keys from `[.env.example](../.env.example)` if you want to override
any default.

### 2. Host audio bridge (Termux → phone speaker)

proot has no audio device, so route playback to a PulseAudio server running in
**Termux**:

```sh
# in Termux (not proot)
pkg install pulseaudio
pulseaudio --start \
  --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1 auth-anonymous=1" \
  --exit-idle-time=-1
```

The broker's `services.json` start command sets `PULSE_SERVER=tcp:127.0.0.1:4713`
so `paplay` inside proot reaches it. Add the `pulseaudio --start …` line to
`~/.termux/boot/startup.sh` so it survives a reboot. Verify with
`PULSE_SERVER=tcp:127.0.0.1:4713 paplay some.wav` from inside proot.

### 3. Firmware

1. Arduino IDE → install **ESP32** board support, board = _ESP32 Dev Module_.
2. Library Manager → install **WebSockets** (links2004), **Adafruit SSD1306**,
   **Adafruit GFX**.
3. `cp firmware/deskbuddy/secrets.h.example firmware/deskbuddy/secrets.h` and fill
   in Wi-Fi + the phone's LAN IP + `BROKER_PORT` 2125.
4. Flash. The OLED should show idle eyes and the serial log `[ws] connected`.

## Configuration

All keys are optional (sensible defaults); reuse the existing `GROQ_API_KEY`.

| Key                    | Default                   | Notes                                      |
| ---------------------- | ------------------------- | ------------------------------------------ |
| `BUDDY_PORT`           | `2125`                    | HTTP + WebSocket port                      |
| `GROQ_API_KEY`         | _(shared)_                | Same key as standup                        |
| `BUDDY_STT_MODEL`      | `whisper-large-v3-turbo`  | Groq Whisper                               |
| `BUDDY_LLM_MODEL`      | `llama-3.3-70b-versatile` | Groq chat                                  |
| `BUDDY_TTS_MODEL`      | `playai-tts`              | Groq TTS (preview — swap if retired)       |
| `BUDDY_TTS_VOICE`      | `Fritz-PlayAI`            | TTS voice                                  |
| `BUDDY_WAKE_MODEL`     | `hey_jarvis`              | openWakeWord pretrained model name         |
| `BUDDY_WAKE_THRESHOLD` | `0.5`                     | 0–1; raise to cut false wakes              |
| `BUDDY_SYSTEM_PROMPT`  | _(terse persona)_         | LLM system message                         |
| `BUDDY_PLAYER`         | _(auto)_                  | Override play command; `{file}` = wav path |
| `BUDDY_LOG`            | `~/deskbuddy-log.jsonl`   | Turn log                                   |

## Endpoints

| Method | Path          | Purpose                                                        |
| ------ | ------------- | -------------------------------------------------------------- |
| GET    | `/`           | Dashboard HUD                                                  |
| GET    | `/ws`         | WebSocket — ESP32 sends binary mic PCM, receives `{"state":…}` |
| GET    | `/state`      | JSON status (state, wake armed?, last transcript/reply)        |
| GET    | `/say?text=…` | Test the loop without a mic: LLM → TTS → phone speaker         |

LAN-only, no auth — like `forza`. It is not exposed through the Cloudflare tunnel.

## Troubleshooting

| Symptom                                 | Cause / fix                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error: externally-managed-environment` | Ubuntu PEP 668. Use `pip install --break-system-packages …` (matches the deck's global-pip convention) or a venv. openWakeWord is **PyPI-only** — there is no `python3-openwakeword` apt package |
| `wake word DISABLED` on boot            | `openwakeword` not importable in proot — install per Setup step 1; if `onnxruntime` wheels fail, `pip install --break-system-packages tflite-runtime`                                            |
| Never wakes                             | Mic gain too low (`MIC_GAIN` in `secrets.h`) or threshold too high; watch the broker log for wake scores and tune                                                                                |
| Wakes constantly                        | Raise `BUDDY_WAKE_THRESHOLD` (e.g. 0.6–0.7)                                                                                                                                                      |
| Cuts off mid-sentence                   | Trailing-silence too eager — raise `END_SILENCE_FRAMES` in `broker.py`                                                                                                                           |
| `no audio player succeeded`             | PulseAudio bridge not running, or `PULSE_SERVER` unset — see Setup step 2                                                                                                                        |
| TTS 4xx/none                            | Groq TTS is preview; accept the model terms in the console or swap `BUDDY_TTS_MODEL`                                                                                                             |
| ESP32 stuck on `error` eyes             | Can't reach the broker — check `BROKER_HOST`/port and that both are on the same LAN                                                                                                              |
| OLED blank                              | Wrong I2C address (`0x3C` vs `0x3D`) or SDA/SCL swapped                                                                                                                                          |

## Roadmap

- **Phase 2 — ESP32 speaker:** DAC → GF1002 → speaker; broker streams TTS audio
  to the device instead of the phone.
- Multi-turn memory (rolling history), barge-in.
- **Intent hooks:** let "hey jarvis" trigger deck actions (restart a service,
  feed the cat) via [webhook_new.py](../webhook_new.py).
- Swap in a lighter nanoWakeWord/LiveKit-trained ONNX model if CPU ever matters
  (oWW consumes standard ONNX, so the pipeline doesn't change).
