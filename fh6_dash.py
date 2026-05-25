#!/usr/bin/env python3
import socket
import struct
import sys
import time

# --- CONFIGURATION ---
UDP_IP = "0.0.0.0"   # Listen on all network interfaces
UDP_PORT = 20440     # Match this port in your FH6 game settings

# --- ANSI CRT PALETTE (Bright Fallout Green) ---
GREEN = "\033[38;5;46m"
BRIGHT_GREEN = "\033[1;38;5;82m"
RESET = "\033[0m"
BOLD = "\033[1m"
CLEAR_SCREEN = "\033[2J\033[H"
CURSOR_HOME = "\033[H"

def parse_packet(p):
    if len(p) < 324:
        return None
        
    # Helper lambda functions for quick struct unpacking
    f = lambda o: struct.unpack_from("<f", p, o)[0]
    i = lambda o: struct.unpack_from("<i", p, o)[0]
    B = lambda o: struct.unpack_from("<B", p, o)[0]
    b = lambda o: struct.unpack_from("<b", p, o)[0]
    
    try:
        return {
            "is_race_on": i(0),
            "max_rpm": f(8),
            "idle_rpm": f(12),
            "rpm": f(16),
            "accel_x": f(20),  # Lateral G
            "accel_y": f(24),  # Vertical G
            "accel_z": f(28),  # Longitudinal G
            
            # Tire Slip (0.0 = full grip, absolute value > 1.0 = sliding)
            "slip_fl": f(84), "slip_fr": f(88),
            "slip_rl": f(92), "slip_rr": f(96),
            
            # Dash Engine metrics (Offset 244+)
            "speed": f(256),   # m/s
            "power": f(260),   # Watts
            "torque": f(264),  # N·m
            "boost": f(284),   # PSI
            
            # Driver Raw Inputs (0-255)
            "accel": B(315),
            "brake": B(316),
            "clutch": B(317),
            "handbrake": B(318),
            "gear": B(319),
            "steer": b(320)
        }
    except Exception:
        return None

def draw_bar(val, max_val, width=16):
    if max_val <= 0: 
        return "░" * width
    ratio = min(max(val / max_val, 0.0), 1.0)
    filled = int(ratio * width)
    return "█" * filled + "░" * (width - filled)

def parse_gear(g):
    if g == 0: return "R"
    if g == 1: return "N"
    return str(g - 1)

def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    sock.setblocking(False)
    
    # Initialize terminal state
    sys.stdout.write(CLEAR_SCREEN)
    sys.stdout.flush()
    
    last_refresh = 0
    print(f"{GREEN}┌──────────────────────────────────────────────────────────────────────────────┐")
    print(f"│ {BRIGHT_GREEN}CYBERDECK TELEMETRY INSTANCE RUNNING...                                     {GREEN}│")
    print(f"│ Listening for FH6 UDP packets on port {UDP_PORT}...                          │")
    print(f"└──────────────────────────────────────────────────────────────────────────────┘{RESET}")
    
    while True:
        try:
            # Drain the UDP socket buffer completely to process only the freshest frame
            packet = None
            while True:
                try:
                    data, _ = sock.recvfrom(1024)
                    packet = data
                except BlockingIOError:
                    break
            
            if not packet:
                time.sleep(0.01)
                continue
                
            telemetry = parse_packet(packet)
            if not telemetry or telemetry["is_race_on"] == 0:
                continue
                
            # Throttle terminal updates to ~30 FPS to prevent render choking
            now = time.time()
            if now - last_refresh < 0.033:
                continue
            last_refresh = now
            
            # Conversions
            speed_kmh = telemetry["speed"] * 3.6
            power_hp = max(0.0, telemetry["power"] / 745.7) # Clamp negative braking anomalies
            max_rpm = telemetry["max_rpm"] if telemetry["max_rpm"] > 0 else 8000.0
            
            # Form UI layout array
            ui = [
                # Jump cursor back to upper left row
                CURSOR_HOME,
                f"{BRIGHT_GREEN}┌──────────────────────────────────────────────────────────────────────────────┐{RESET}\n",
                f"{BRIGHT_GREEN}│  FORZA HORIZON 6 // CYBERDECK DIGITAL CRT HUD                                │{RESET}\n",
                f"{BRIGHT_GREEN}├──────────────────────────────────────────────────────────────────────────────┤{RESET}\n",
                
                # Core Engine Row
                f"{GREEN}│  GEAR: {BOLD}[{parse_gear(telemetry['gear'])}]{RESET}{GREEN}   RPM: {int(telemetry['rpm']):4d}/{int(max_rpm):4d} [{draw_bar(telemetry['rpm'], max_rpm, 20)}]   SPD: {BOLD}{speed_kmh:5.1f} km/h{RESET}{GREEN} │{RESET}\n",
                f"{BRIGHT_GREEN}├──────────────────────────────┬──────────────────────────────┬────────────────┤{RESET}\n",
                
                # Metrics Columns
                f"{GREEN}│  PEDAL INPUTS                │  TIRE SLIP RATIOS            │  ENGINE STATS  │{RESET}\n",
                f"{GREEN}│  Throttle: [{draw_bar(telemetry['accel'], 255, 10)}] {int(telemetry['accel']/2.55):3d}% │  FL: {telemetry['slip_fl']:5.2f}    FR: {telemetry['slip_fr']:5.2f} │  HP:  {power_hp:5.1f}   │{RESET}\n",
                f"{GREEN}│  Brake:    [{draw_bar(telemetry['brake'], 255, 10)}] {int(telemetry['brake']/2.55):3d}% │  RL: {telemetry['slip_rl']:5.2f}    RR: {telemetry['slip_rr']:5.2f} │  N·m: {telemetry['torque']:5.1f}   │{RESET}\n",
                f"{GREEN}│  Clutch:   [{draw_bar(telemetry['clutch'], 255, 10)}] {int(telemetry['clutch']/2.55):3d}% │                              │  PSI: {telemetry['boost']:5.2f}   │{RESET}\n",
                f"{BRIGHT_GREEN}├──────────────────────────────┴──────────────────────────────┴────────────────┤{RESET}\n",
                
                # Physics/G-Force Row
                f"{GREEN}│  G-FORCES  //  LATERAL (X): {telemetry['accel_x']:5.2f}G  |  VERTICAL (Y): {telemetry['accel_y']:5.2f}G  |  LONG (Z): {telemetry['accel_z']:5.2f}G   │{RESET}\n",
                f"{BRIGHT_GREEN}└──────────────────────────────────────────────────────────────────────────────┘{RESET}\n"
            ]
            
            sys.stdout.write("".join(ui))
            sys.stdout.flush()
            
        except KeyboardInterrupt:
            print(f"\n{GREEN}Dashboard detached cleanly.{RESET}")
            break
        except Exception:
            continue

if __name__ == "__main__":
    main()
