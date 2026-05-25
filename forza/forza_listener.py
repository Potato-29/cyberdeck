#!/usr/bin/env python3
"""
FH6 Telemetry Server — combined HTTP + WebSocket on port 8000
- Serves dashboard.html at /
- WebSocket at /ws
- UDP listener on port 5300

Install: pip install aiohttp
Run:     python3 forza_listener.py
"""

import asyncio
import json
import socket
import struct
import time
from aiohttp import web
import aiohttp
from pathlib import Path

UDP_PORT  = 5300
HTTP_PORT = 8000

# ── FH6 packet (324 bytes) ────────────────────────────────────────────────────
PACKET_FMT = struct.Struct('<'
    'i'   # 0   IsRaceOn
    'I'   # 4   TimestampMS
    'f'   # 8   EngineMaxRpm
    'f'   # 12  EngineIdleRpm
    'f'   # 16  CurrentEngineRpm
    'fff' # 20  AccelerationX/Y/Z
    'fff' # 32  VelocityX/Y/Z
    'fff' # 44  AngularVelocityX/Y/Z
    'f'   # 56  Yaw
    'f'   # 60  Pitch
    'f'   # 64  Roll
    'ffff'# 68  NormSuspTravel FL/FR/RL/RR
    'ffff'# 84  TireSlipRatio FL/FR/RL/RR
    'ffff'# 100 WheelRotationSpeed FL/FR/RL/RR
    'iiii'# 116 WheelOnRumbleStrip FL/FR/RL/RR
    'ffff'# 132 WheelInPuddleDepth FL/FR/RL/RR
    'ffff'# 148 SurfaceRumble FL/FR/RL/RR
    'ffff'# 164 TireSlipAngle FL/FR/RL/RR
    'ffff'# 180 TireCombinedSlip FL/FR/RL/RR
    'ffff'# 196 SuspTravelMeters FL/FR/RL/RR
    'i'   # 212 CarOrdinal
    'i'   # 216 CarClass
    'i'   # 220 CarPerformanceIndex
    'i'   # 224 DrivetrainType
    'i'   # 228 NumCylinders
    'i'   # 232 CarGroup       (FH6 only)
    'f'   # 236 SmashableVelDiff (FH6 only)
    'f'   # 240 SmashableMass  (FH6 only)
    'fff' # 244 PositionX/Y/Z
    'f'   # 256 Speed (m/s)
    'f'   # 260 Power (watts)
    'f'   # 264 Torque (Nm)
    'ffff'# 268 TireTemp FL/FR/RL/RR
    'f'   # 284 Boost
    'f'   # 288 Fuel
    'f'   # 292 DistanceTraveled
    'f'   # 296 BestLap (s)
    'f'   # 300 LastLap (s)
    'f'   # 304 CurrentLap (s)
    'f'   # 308 CurrentRaceTime (s)
    'H'   # 312 LapNumber
    'B'   # 314 RacePosition
    'B'   # 315 Accel (0-255)
    'B'   # 316 Brake (0-255)
    'B'   # 317 Clutch (0-255)
    'B'   # 318 HandBrake (0-255)
    'B'   # 319 Gear
    'b'   # 320 Steer (-127 to 127)
    'b'   # 321 NormalizedDrivingLine
    'b'   # 322 NormalizedAIBrakeDiff
    'x'   # 323 padding
)

EXPECTED_SIZE = 324

# ── State ─────────────────────────────────────────────────
clients   = set()
last_data = {}

def parse_packet(data):
    f = PACKET_FMT.unpack(data)
    
    # Extract structural bases
    speed_ms = f[64]
    rpm = f[4]
    max_rpm = f[2]
    idle_rpm = f[3]

    # Calculate dynamic RPM percentage safely
    rpm_pct = round(max(0, min(100, (rpm - idle_rpm) / max(max_rpm - idle_rpm, 1) * 100)), 1)

    # Multi-dashboard compatible mapping payload
    return {
        # Metadata & Status
        "isRaceOn": f[0],
        "is_race_on": f[0],
        "timestampMs": f[1],
        
        # Speed & Engine
        "speed": round(speed_ms * 3.6, 1),            # Standardized fallback
        "speed_kmh": round(speed_ms * 3.6, 1),
        "speed_mph": round(speed_ms * 2.237, 1),
        "rpm": round(rpm),
        "maxRpm": round(max_rpm),
        "max_rpm": round(max_rpm),
        "idleRpm": round(idle_rpm),
        "rpmPct": rpm_pct,
        "rpm_pct": rpm_pct,
        
        # Rig Core Inputs & Gear
        "gear": f[84],
        "accel": round(f[80] / 255 * 100, 1),         # Some dashboards use 'accel'
        "throttle": round(f[80] / 255 * 100, 1),      # Others use 'throttle'
        "brake": round(f[81] / 255 * 100, 1),
        "clutch": round(f[82] / 255 * 100, 1),
        "handbrake": round(f[83] / 255 * 100, 1),
        
        # Physics / G-Forces
        # Invert the signs by adding a minus (-) before the tuple index
        "gLat":       round(-f[5] / 9.81, 2),  # Inverted: Turning right pushes the G-dot left
        "gLon":       round(-f[7] / 9.81, 2),  # Inverted: Accelerating pushes G-dot back, braking pushes it forward

        # Make sure to update your snake_case aliases too if your UI uses them:
        "g_lat":      round(-f[5] / 9.81, 2),
        "g_lon":      round(-f[7] / 9.81, 2),
        
        # Tires (Temperatures)
        "tireFL": round(f[67], 1),
        "tireFR": round(f[68], 1),
        "tireRL": round(f[69], 1),
        "tireRR": round(f[70], 1),
        "tire_temp_fl": round(f[67], 1),
        "tire_temp_fr": round(f[68], 1),
        "tire_temp_rl": round(f[69], 1),
        "tire_temp_rr": round(f[70], 1),
        
        # Session Metrics
        "lapNumber": f[78],
        "lap_number": f[78],
        "position": f[79],
        "race_position": f[79],
        "bestLap": round(f[74], 3) if f[74] > 0 else 0,
        "lastLap": round(f[75], 3) if f[75] > 0 else 0,
        "currentLap": round(f[76], 3),
        "boost": round(f[71], 2),
        "fuel": round(f[72], 2),
    }

# ── WebSocket handler ─────────────────────────────────────
async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    print(f"[WS] Client connected ({len(clients)} total)")

    # send last known data immediately
    if last_data:
        await ws.send_str(json.dumps(last_data))

    try:
        async for msg in ws:
            pass  # we don't expect messages from client
    finally:
        clients.discard(ws)
        print(f"[WS] Client disconnected ({len(clients)} total)")

    return ws

# ── HTTP: serve dashboard.html ────────────────────────────
async def index_handler(request):
    html_path = Path(__file__).parent / "dashboard.html"
    if html_path.exists():
        return web.FileResponse(html_path)
    return web.Response(text="dashboard.html not found — place it next to forza_listener.py", status=404)

# ── Broadcast to all WebSocket clients ───────────────────
async def broadcast(data: dict):
    global clients
    if not clients:
        return
    msg = json.dumps(data)
    dead = set()
    for ws in list(clients):
        try:
            await ws.send_str(msg)
        except Exception:
            dead.add(ws)
    clients -= dead

# ── UDP listener ──────────────────────────────────────────
async def udp_listener():
    global last_data
    loop = asyncio.get_event_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", UDP_PORT))
    sock.setblocking(False)

    print(f"[UDP] Listening on :{UDP_PORT}")
    count = 0
    last_log = time.time()

    while True:
        try:
            data = await loop.sock_recv(sock, 1024)
            parsed = parse_packet(data)
            if parsed:
                last_data = parsed
                await broadcast(parsed)
                count += 1
                if time.time() - last_log > 5:
                    print(f"[UDP] {count/5:.0f} pkt/s | {parsed['speed_kmh']} km/h | RPM {parsed['rpm']} | Gear {parsed['gear']}")
                    count = 0
                    last_log = time.time()
            else:
                if len(data) != EXPECTED_SIZE:
                    print(f"[UDP] Bad packet: {len(data)}B (want {EXPECTED_SIZE})")
        except BlockingIOError:
            await asyncio.sleep(0.001)
        except Exception as e:
            print(f"[UDP] Error: {e}")
            await asyncio.sleep(0.1)

# ── Main ──────────────────────────────────────────────────
async def main():
    print("=" * 50)
    print("  FH6 Telemetry Server")
    print(f"  UDP  → :{UDP_PORT}  (point FH6 Data Out here)")
    print(f"  HTTP → http://0.0.0.0:{HTTP_PORT}")
    print(f"  WS   → ws://0.0.0.0:{HTTP_PORT}/ws")
    print("=" * 50)

    app = web.Application()
    app.router.add_get('/',    index_handler)
    app.router.add_get('/ws',  ws_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', HTTP_PORT)
    await site.start()

    print(f"[HTTP] Serving on http://0.0.0.0:{HTTP_PORT}")
    await udp_listener()

if __name__ == "__main__":
    asyncio.run(main())
