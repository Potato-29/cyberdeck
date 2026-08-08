#!/usr/bin/env python3
"""
Desk Buddy broker — the always-on "brain" behind the ESP32 voice assistant.

Runs INSIDE proot Ubuntu on the phone (glibc), because openWakeWord's ML runtime
(onnxruntime / tflite-runtime) only ships glibc aarch64 wheels — Termux's bionic
libc can't load them. See docs/deskbuddy.md.

Pipeline:
  ESP32 streams 16kHz/16-bit mono mic PCM over the /ws WebSocket
    -> openWakeWord listens for "hey jarvis"
    -> on wake: capture the utterance (energy-based end-of-speech)
    -> Groq Whisper STT  -> Groq LLM  -> Groq TTS
    -> play the reply on the host (phone) speaker via PulseAudio
    -> push state (idle/listening/thinking/speaking) back to the ESP32 for the eyes

HTTP + WebSocket on BUDDY_PORT (default 2125). LAN-only, no auth (like forza/).

Install (in proot Ubuntu):  pip install aiohttp openwakeword requests
                            (openwakeword pulls numpy + onnxruntime/tflite-runtime)
Run:                        python3 broker.py
"""

import asyncio
import io
import json
import os
import secrets
import subprocess
import tempfile
import time
import wave
from datetime import datetime
from pathlib import Path

import requests
from aiohttp import web


# ── Env loading (copied verbatim from webhook_new.py; kept per-service on
#    purpose so this runs standalone — do not refactor into a shared module) ──
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


# .env lives at the repo root, one level up from deskbuddy/
load_env_file(Path(__file__).resolve().parent.parent / ".env")

# ── Config ──────────────────────────────────────────────────────────────────
PORT = int(os.environ.get("BUDDY_PORT", "2125"))

GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = os.environ.get("GROQ_BASE", "https://api.groq.com/openai/v1")
STT_MODEL = os.environ.get("BUDDY_STT_MODEL", "whisper-large-v3-turbo")
LLM_MODEL = os.environ.get("BUDDY_LLM_MODEL", "llama-3.3-70b-versatile")
TTS_MODEL = os.environ.get("BUDDY_TTS_MODEL", "playai-tts")
TTS_VOICE = os.environ.get("BUDDY_TTS_VOICE", "Fritz-PlayAI")
SYSTEM_PROMPT = os.environ.get(
    "BUDDY_SYSTEM_PROMPT",
    "You are a terse, witty desk assistant. Answer in 1-3 sentences.",
)

WAKE_MODEL = os.environ.get("BUDDY_WAKE_MODEL", "hey_jarvis")
WAKE_THRESHOLD = float(os.environ.get("BUDDY_WAKE_THRESHOLD", "0.5"))

# Optional explicit playback command; "{file}" is replaced with the wav path.
# When empty, a few common players are tried in order (paplay -> ffplay -> aplay).
AUDIO_PLAYER = os.environ.get("BUDDY_PLAYER", "")

LOG_FILE = Path(os.path.expanduser(
    os.environ.get("BUDDY_LOG", "~/deskbuddy-log.jsonl")
))

# ── Audio constants ─────────────────────────────────────────────────────────
SAMPLE_RATE = 16000
FRAME_SAMPLES = 1280            # 80ms @ 16kHz — openWakeWord's expected chunk
FRAME_BYTES = FRAME_SAMPLES * 2  # 16-bit mono

# End-of-utterance detection (energy based; Silero VAD via oww is a later swap)
SILENCE_RMS = 500              # int16 RMS below this counts as silence
END_SILENCE_FRAMES = 10       # ~0.8s of trailing silence ends the capture
MIN_SPEECH_FRAMES = 4         # need ~0.32s of speech before we allow ending
MAX_CAPTURE_FRAMES = 100      # hard cap ~8s so a stuck mic can't run forever

# ── openWakeWord (optional import so the eyes/audio path is testable without it)
try:
    import numpy as np
    from openwakeword.model import Model as OWWModel
    OWW_AVAILABLE = True
    _OWW_ERR = ""
except Exception as exc:  # noqa: BLE001 — any import problem disables wake word
    OWW_AVAILABLE = False
    _OWW_ERR = str(exc)

# ── State ───────────────────────────────────────────────────────────────────
clients = set()                # connected WebSockets (the ESP32 + any dashboards)
oww_model = None

STATE = "idle"                 # idle | listening | thinking | speaking | error
processing = False             # a turn (STT/LLM/TTS) is in flight
listening = False              # currently capturing an utterance after a wake

capture_buf = bytearray()
_accum = bytearray()           # reframes arbitrary WS chunks into FRAME_BYTES
speech_frames = 0
silence_run = 0

last_wake_ts = 0.0
last_transcript = ""
last_reply = ""


# ── WebSocket broadcast (fan-out, mirrors forza/forza_listener.py) ───────────
async def broadcast(obj: dict):
    global clients
    if not clients:
        return
    msg = json.dumps(obj)
    dead = set()
    for ws in list(clients):
        try:
            await ws.send_str(msg)
        except Exception:  # noqa: BLE001
            dead.add(ws)
    clients -= dead


async def set_state(state: str):
    global STATE
    STATE = state
    await broadcast({"state": state})


# ── Groq calls (blocking `requests`; run in an executor. Auth + empty-key guard
#    follow standup.py's pattern) ──────────────────────────────────────────────
def groq_stt(wav_bytes: bytes) -> str:
    """Whisper transcription. Multipart upload — new vs the repo's chat-only use."""
    if not GROQ_KEY:
        return ""
    try:
        resp = requests.post(
            f"{GROQ_BASE}/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_KEY}"},
            files={"file": ("query.wav", wav_bytes, "audio/wav")},
            data={"model": STT_MODEL, "language": "en", "response_format": "json"},
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[buddy] stt {resp.status_code}: {resp.text[:200]}")
            return ""
        return resp.json().get("text", "").strip()
    except (requests.exceptions.RequestException, ValueError, KeyError) as exc:
        print(f"[buddy] stt failed: {exc}")
        return ""


def groq_llm(user_text: str) -> str:
    if not GROQ_KEY:
        return "My brain's offline — no Groq key set."
    try:
        resp = requests.post(
            f"{GROQ_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_text},
                ],
                "temperature": 0.5,
                "max_tokens": 300,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[buddy] llm {resp.status_code}: {resp.text[:200]}")
            return "Sorry, I glitched."
        return resp.json()["choices"][0]["message"]["content"].strip()
    except (requests.exceptions.RequestException, ValueError, KeyError,
            IndexError) as exc:
        print(f"[buddy] llm failed: {exc}")
        return "Sorry, I glitched."


def groq_tts(text: str) -> bytes:
    """Text-to-speech. Groq TTS is preview; model/voice are env-swappable."""
    if not GROQ_KEY or not text:
        return b""
    try:
        resp = requests.post(
            f"{GROQ_BASE}/audio/speech",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": TTS_MODEL,
                "voice": TTS_VOICE,
                "input": text,
                "response_format": "wav",
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"[buddy] tts {resp.status_code}: {resp.text[:200]}")
            return b""
        return resp.content
    except requests.exceptions.RequestException as exc:
        print(f"[buddy] tts failed: {exc}")
        return b""


def play_audio(wav_bytes: bytes) -> None:
    """Play a wav on the host speaker. On the phone this reaches the speaker via
    the Termux PulseAudio bridge (PULSE_SERVER); see docs/deskbuddy.md."""
    if not wav_bytes:
        return
    tmp = Path(tempfile.gettempdir()) / "buddy_reply.wav"
    tmp.write_bytes(wav_bytes)
    if AUDIO_PLAYER:
        players = [AUDIO_PLAYER.format(file=str(tmp))]
    else:
        players = [
            f'paplay "{tmp}"',
            f'ffplay -nodisp -autoexit -loglevel quiet "{tmp}"',
            f'aplay "{tmp}"',
        ]
    for cmd in players:
        try:
            if subprocess.run(cmd, shell=True, capture_output=True).returncode == 0:
                return
        except Exception:  # noqa: BLE001
            continue
    print("[buddy] no audio player succeeded — is the PulseAudio bridge up?")


def pcm_to_wav(pcm_bytes: bytes, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


def append_turn(transcript: str, reply: str) -> None:
    entry = {
        "id": secrets.token_hex(4),
        "ts": datetime.now().isoformat(timespec="seconds"),
        "transcript": transcript,
        "reply": reply,
    }
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        print(f"[buddy] could not write log: {exc}")


# ── Turn orchestration ──────────────────────────────────────────────────────
async def _respond(user_text: str) -> None:
    """LLM -> TTS -> play. Assumes state is already 'thinking' and `processing`."""
    global last_transcript, last_reply
    loop = asyncio.get_event_loop()
    last_transcript = user_text
    reply = await loop.run_in_executor(None, groq_llm, user_text)
    last_reply = reply
    print(f"[buddy] reply: {reply}")
    await set_state("speaking")
    audio = await loop.run_in_executor(None, groq_tts, reply)
    await loop.run_in_executor(None, play_audio, audio)
    append_turn(user_text, reply)


async def run_turn(pcm: bytes) -> None:
    """Full loop from captured mic audio: STT -> LLM -> TTS -> play."""
    global processing
    if processing:
        return
    processing = True
    loop = asyncio.get_event_loop()
    try:
        await set_state("thinking")
        text = await loop.run_in_executor(None, groq_stt, pcm_to_wav(pcm))
        print(f"[buddy] heard: {text!r}")
        if not text:
            await set_state("error")
            await asyncio.sleep(0.8)
            return
        await _respond(text)
    except Exception as exc:  # noqa: BLE001
        print(f"[buddy] turn failed: {exc}")
        await set_state("error")
        await asyncio.sleep(1)
    finally:
        if oww_model is not None:
            try:
                oww_model.reset()
            except Exception:  # noqa: BLE001
                pass
        await set_state("idle")
        processing = False


async def run_reply(user_text: str) -> None:
    """Text-in loop (the /say test endpoint): LLM -> TTS -> play, no STT."""
    global processing
    if processing:
        return
    processing = True
    try:
        await set_state("thinking")
        await _respond(user_text)
    except Exception as exc:  # noqa: BLE001
        print(f"[buddy] reply failed: {exc}")
        await set_state("error")
        await asyncio.sleep(1)
    finally:
        await set_state("idle")
        processing = False


# ── Mic frame processing ────────────────────────────────────────────────────
def _rms(arr) -> float:
    if arr.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(arr.astype(np.float32)))))


async def process_frame(frame: bytes) -> None:
    global listening, speech_frames, silence_run, last_wake_ts
    arr = np.frombuffer(frame, dtype=np.int16)

    if not listening:
        if oww_model is None:
            return
        scores = oww_model.predict(arr)
        score = scores.get(WAKE_MODEL, max(scores.values(), default=0.0))
        if score >= WAKE_THRESHOLD:
            listening = True
            capture_buf.clear()
            speech_frames = 0
            silence_run = 0
            last_wake_ts = time.time()
            print(f"[buddy] wake '{WAKE_MODEL}' ({score:.2f})")
            await set_state("listening")
        return

    # capturing the utterance
    capture_buf.extend(frame)
    if _rms(arr) >= SILENCE_RMS:
        speech_frames += 1
        silence_run = 0
    else:
        silence_run += 1

    frames_total = len(capture_buf) // FRAME_BYTES
    ended = (speech_frames >= MIN_SPEECH_FRAMES and silence_run >= END_SILENCE_FRAMES)
    if ended or frames_total >= MAX_CAPTURE_FRAMES:
        listening = False
        pcm = bytes(capture_buf)
        capture_buf.clear()
        if speech_frames >= MIN_SPEECH_FRAMES:
            asyncio.create_task(run_turn(pcm))
        else:
            await set_state("idle")  # wake with no real speech — reset quietly


async def handle_audio(chunk: bytes) -> None:
    if processing or not OWW_AVAILABLE:
        return
    _accum.extend(chunk)
    while len(_accum) >= FRAME_BYTES:
        frame = bytes(_accum[:FRAME_BYTES])
        del _accum[:FRAME_BYTES]
        await process_frame(frame)


# ── Routes ──────────────────────────────────────────────────────────────────
async def ws_handler(request):
    ws = web.WebSocketResponse(max_msg_size=0, heartbeat=30)
    await ws.prepare(request)
    clients.add(ws)
    print(f"[buddy] client connected ({len(clients)} total)")
    await ws.send_str(json.dumps({"state": STATE}))  # sync eyes on connect
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.BINARY:
                await handle_audio(msg.data)
            # text frames from the device are ignored for now
    finally:
        clients.discard(ws)
        print(f"[buddy] client disconnected ({len(clients)} total)")
    return ws


async def state_handler(request):
    return web.json_response({
        "state": STATE,
        "wake_word": WAKE_MODEL,
        "wake_enabled": oww_model is not None,
        "last_wake": last_wake_ts,
        "last_transcript": last_transcript,
        "last_reply": last_reply,
        "clients": len(clients),
        "has_groq_key": bool(GROQ_KEY),
    })


async def say_handler(request):
    """Test the LLM+TTS+eyes loop without a mic: GET /say?text=hello there"""
    text = request.query.get("text", "").strip()
    if not text:
        return web.json_response({"error": "?text= is required"}, status=400)
    if processing:
        return web.json_response({"error": "busy"}, status=409)
    asyncio.create_task(run_reply(text))
    return web.json_response({"ok": True, "heard": text})


async def index_handler(request):
    html = Path(__file__).parent / "dashboard.html"
    if html.exists():
        return web.FileResponse(html)
    return web.Response(text="dashboard.html not found", status=404)


# ── Main ────────────────────────────────────────────────────────────────────
def init_oww():
    if not OWW_AVAILABLE:
        print(f"[buddy] openWakeWord unavailable ({_OWW_ERR}); wake word DISABLED.")
        print("[buddy]   -> pip install openwakeword  (in proot Ubuntu)")
        return None
    try:
        from openwakeword import utils as oww_utils
        oww_utils.download_models([WAKE_MODEL])
    except Exception as exc:  # noqa: BLE001
        print(f"[buddy] model download note: {exc}")
    try:
        model = OWWModel(wakeword_models=[WAKE_MODEL])
        print(f"[buddy] wake word ready: '{WAKE_MODEL}' (threshold {WAKE_THRESHOLD})")
        return model
    except Exception as exc:  # noqa: BLE001
        print(f"[buddy] oww init failed ({exc}); wake word DISABLED.")
        return None


async def main():
    global oww_model
    oww_model = init_oww()

    print("=" * 52)
    print("  Desk Buddy broker")
    print(f"  HTTP/WS -> http://0.0.0.0:{PORT}  (ws {PORT}/ws)")
    print(f"  Groq    -> key {'set' if GROQ_KEY else 'MISSING'} | "
          f"stt={STT_MODEL} llm={LLM_MODEL} tts={TTS_MODEL}")
    print("=" * 52)

    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/state", state_handler)
    app.router.add_get("/say", say_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    print(f"[buddy] serving on http://0.0.0.0:{PORT}")

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
