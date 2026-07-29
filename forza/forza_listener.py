#!/usr/bin/env python3
"""
FH6 Telemetry Server — combined HTTP + WebSocket on port 8000
- Serves dashboard.html at /
- WebSocket at /ws
- UDP listener on port 5300
- GET /boost  → {"boost": <float, bar>}  (for ESP32 boost gauge)

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

    # Corrected index mapping after structural expansion:
    # f[0]  = IsRaceOn
    # f[1]  = TimestampMS
    # f[2]  = EngineMaxRpm
    # f[3]  = EngineIdleRpm
    # f[4]  = CurrentEngineRpm
    # f[5:8]   = Acceleration X, Y, Z
    # f[8:11]  = Velocity X, Y, Z
    # f[11:14] = AngularVelocity X, Y, Z
    # f[14] = Yaw, f[15] = Pitch, f[16] = Roll
    # f[17:21] = NormSuspTravel (4)
    # f[21:25] = TireSlipRatio (4)
    # f[25:29] = WheelRotationSpeed (4)
    # f[29:33] = WheelOnRumbleStrip (4)
    # f[33:37] = WheelInPuddleDepth (4)
    # f[37:41] = SurfaceRumble (4)
    # f[41:45] = TireSlipAngle (4)
    # f[45:49] = TireCombinedSlip (4)
    # f[49:53] = SuspTravelMeters (4)
    # f[53] = CarOrdinal, f[54] = CarClass, f[55] = CarPerformanceIndex
    # f[56] = DrivetrainType, f[57] = NumCylinders, f[58] = CarGroup
    # f[59] = SmashableVelDiff, f[60] = SmashableMass
    # f[61:64] = Position X, Y, Z
    # f[64] = Speed (m/s)
    # f[65] = Power (watts)
    # f[66] = Torque (Nm)
    # f[67:71] = TireTemp FL/FR/RL/RR
    # f[71] = Boost
    # f[72] = Fuel
    # f[73] = DistanceTraveled
    # f[74] = BestLap, f[75] = LastLap, f[76] = CurrentLap, f[77] = CurrentRaceTime
    # f[78] = LapNumber
    # f[79] = RacePosition
    # f[80] = Accel, f[81] = Brake, f[82] = Clutch, f[83] = HandBrake, f[84] = Gear
    # f[85] = Steer, f[86] = NormalizedDrivingLine, f[87] = NormalizedAIBrakeDiff

    speed_ms = f[64]
    rpm      = f[4]
    max_rpm  = f[2]
    idle_rpm = f[3]

    rpm_pct = round(max(0, min(100, (rpm - idle_rpm) / max(max_rpm - idle_rpm, 1) * 100)), 1)

    return {
        "isRaceOn":      f[0],
        "is_race_on":    f[0],
        "timestampMs":   f[1],

        "speed":         round(speed_ms * 3.6, 1),
        "speed_kmh":     round(speed_ms * 3.6, 1),
        "speed_mph":     round(speed_ms * 2.237, 1),
        "rpm":           round(rpm),
        "maxRpm":        round(max_rpm),
        "max_rpm":       round(max_rpm),
        "idleRpm":       round(idle_rpm),
        "rpmPct":        rpm_pct,
        "rpm_pct":       rpm_pct,

        "gear":          f[84],
        "accel":         round(f[80] / 255 * 100, 1),
        "throttle":      round(f[80] / 255 * 100, 1),
        "brake":         round(f[81] / 255 * 100, 1),
        "clutch":        round(f[82] / 255 * 100, 1),
        "handbrake":     round(f[83] / 255 * 100, 1),

        "gLat":  round(-f[5] / 9.81, 2),  # x-acceleration
        "gLon":  round(-f[7] / 9.81, 2),  # z-acceleration
        "g_lat": round(-f[5] / 9.81, 2),
        "g_lon": round(-f[7] / 9.81, 2),

        "tireFL":        round(f[67], 1),
        "tireFR":        round(f[68], 1),
        "tireRL":        round(f[69], 1),
        "tireRR":        round(f[70], 1),
        "tire_temp_fl":  round(f[67], 1),
        "tire_temp_fr":  round(f[68], 1),
        "tire_temp_rl":  round(f[69], 1),
        "tire_temp_rr":  round(f[70], 1),

        "lapNumber":     f[78],
        "lap_number":    f[78],
        "position":      f[79],
        "race_position": f[79],
        "bestLap":       round(f[74], 3) if f[74] > 0 else 0,
        "lastLap":       round(f[75], 3) if f[75] > 0 else 0,
        "currentLap":    round(f[76], 3),

        "boost":         round(f[71], 4),
        "fuel":          round(f[73], 2),
    }

# ── WebSocket handler ─────────────────────────────────────
async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    print(f"[WS] Client connected ({len(clients)} total)")

    if last_data:
        await ws.send_str(json.dumps(last_data))

    try:
        async for msg in ws:
            pass
    finally:
        clients.discard(ws)
        print(f"[WS] Client disconnected ({len(clients)} total)")

    return ws

# ── HTTP: serve dashboard.html ────────────────────────────
async def index_handler(request):
    html_path = Path(__file__).parent / "dashboard.html"
    if html_path.exists():
        return web.FileResponse(html_path)
    return web.Response(
        text="dashboard.html not found — place it next to forza_listener.py",
        status=404
    )

# ── HTTP: /boost — ESP32 boost gauge endpoint ─────────────
# Returns gauge pressure in bar (atmospheric subtracted).
# At idle / NA engine: 0.0
# At 0.8 bar boost (typical): ~0.8
# ESP32 converts bar → PSI on its side (1 bar = 14.5038 PSI).
async def boost_handler(request):
    raw_psi = last_data.get("boost", 0.0)
    gauge_psi = max(0.0, round(raw_psi, 4)) # Clamp negative vacuum values to 0
    return web.Response(
        text=json.dumps({"boost": gauge_psi}),
        content_type="application/json"
    )

# ── Broadcast to all WebSocket clients ───────────────────
async def broadcast(data: dict):
    global clients
    if not clients:
        return
    msg  = json.dumps(data)
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
    count    = 0
    last_log = time.time()

    while True:
        try:
            data   = await loop.sock_recv(sock, 1024)
            parsed = parse_packet(data)
            if parsed:
                last_data = parsed
                await broadcast(parsed)
                count += 1
                if time.time() - last_log > 5:
                    print(
                        f"[UDP] {count/5:.0f} pkt/s | "
                        f"{parsed['speed_kmh']} km/h | "
                        f"RPM {parsed['rpm']} | "
                        f"Gear {parsed['gear']} | "
                        f"Boost {max(0.0, parsed['boost'] - 1.0):.2f} bar"
                    )
                    count    = 0
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
    print(f"  UDP   → :{UDP_PORT}  (point FH6 Data Out here)")
    print(f"  HTTP  → http://0.0.0.0:{HTTP_PORT}")
    print(f"  WS    → ws://0.0.0.0:{HTTP_PORT}/ws")
    print(f"  ESP32 → http://0.0.0.0:{HTTP_PORT}/boost")
    print("=" * 50)

    app = web.Application()
    app.router.add_get('/',      index_handler)
    app.router.add_get('/ws',    ws_handler)
    app.router.add_get('/boost', boost_handler)  # ← ESP32 boost gauge

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', HTTP_PORT)
    await site.start()

    print(f"[HTTP] Serving on http://0.0.0.0:{HTTP_PORT}")
    await udp_listener()

if __name__ == "__main__":
    asyncio.run(main())
