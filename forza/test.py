#!/usr/bin/env python3
import socket
import struct
import os
import time

UDP_PORT = 5300

# Your exact packet structure (324 bytes, mixed ints and floats)
PACKET_FMT = struct.Struct('<'
    'i' 'I' 'f' 'f' 'f' 'fff' 'fff' 'fff' 'f' 'f' 'f' 'ffff' 'ffff' 'ffff' 'iiii' 
    'ffff' 'ffff' 'ffff' 'ffff' 'ffff' 'i' 'i' 'i' 'i' 'i' 'i' 'f' 'f' 'fff' 'f' 
    'f' 'f' 'ffff' 'f' 'f' 'f' 'f' 'f' 'f' 'f' 'H' 'B' 'B' 'B' 'B' 'B' 'b' 'b' 'b' '2x'
)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", UDP_PORT))

print(f"Listening on port {UDP_PORT}... Drive around to see data change.")
time.sleep(2)

try:
    while True:
        data, addr = sock.recvfrom(1024)
        if len(data) == 324:
            f = PACKET_FMT.unpack(data)
            
            # Clear terminal screen dynamically for a clean dashboard view
            os.system('cls' if os.name == 'nt' else 'clear')
            
            print("=" * 60)
            print("         FORZA TELEMETRY LIVE TUPLE INDEX INSPECTOR")
            print("=" * 60)
            print("Drive, accelerate, and look for variables changing in real-time.")
            print("Press Ctrl+C to exit.\n")
            
            # Print elements in a clean grid showing their exact tuple index
            for idx, val in enumerate(f):
                # Format to look clean whether it's an int or float
                val_str = f"{val:.4f}" if isinstance(val, float) else str(val)
                print(f"f[{idx}]: {val_str:<12}", end=" | " if (idx + 1) % 4 != 0 else "\n")
                
            print("\n" + "=" * 60)
            time.sleep(0.1) # Caps updates to ~10 Hz so your terminal doesn't flicker wildly

except KeyboardInterrupt:
    print("\n[INFO] Inspector stopped.")#!/usr/bin/env python3
import socket
import struct
import os
import time

UDP_PORT = 5300

# Your exact packet structure (324 bytes, mixed ints and floats)
PACKET_FMT = struct.Struct('<'
    'i' 'I' 'f' 'f' 'f' 'fff' 'fff' 'fff' 'f' 'f' 'f' 'ffff' 'ffff' 'ffff' 'iiii' 
    'ffff' 'ffff' 'ffff' 'ffff' 'ffff' 'i' 'i' 'i' 'i' 'i' 'i' 'f' 'f' 'fff' 'f' 
    'f' 'f' 'ffff' 'f' 'f' 'f' 'f' 'f' 'f' 'f' 'H' 'B' 'B' 'B' 'B' 'B' 'b' 'b' 'b' 'x'
)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", UDP_PORT))

print(f"Listening on port {UDP_PORT}... Drive around to see data change.")
time.sleep(2)

try:
    while True:
        data, addr = sock.recvfrom(1024)
        if len(data) == 324:
            f = PACKET_FMT.unpack(data)
            
            # Clear terminal screen dynamically for a clean dashboard view
            os.system('cls' if os.name == 'nt' else 'clear')
            
            print("=" * 60)
            print("         FORZA TELEMETRY LIVE TUPLE INDEX INSPECTOR")
            print("=" * 60)
            print("Drive, accelerate, and look for variables changing in real-time.")
            print("Press Ctrl+C to exit.\n")
            
            # Print elements in a clean grid showing their exact tuple index
            for idx, val in enumerate(f):
                # Format to look clean whether it's an int or float
                val_str = f"{val:.4f}" if isinstance(val, float) else str(val)
                print(f"f[{idx}]: {val_str:<12}", end=" | " if (idx + 1) % 4 != 0 else "\n")
                
            print("\n" + "=" * 60)
            time.sleep(0.1) # Caps updates to ~10 Hz so your terminal doesn't flicker wildly

except KeyboardInterrupt:
    print("\n[INFO] Inspector stopped.")#!/usr/bin/env python3
import socket
import struct
import os
import time

UDP_PORT = 5300

# Your exact packet structure (324 bytes, mixed ints and floats)
PACKET_FMT = struct.Struct('<'
    'i' 'I' 'f' 'f' 'f' 'fff' 'fff' 'fff' 'f' 'f' 'f' 'ffff' 'ffff' 'ffff' 'iiii' 
    'ffff' 'ffff' 'ffff' 'ffff' 'ffff' 'i' 'i' 'i' 'i' 'i' 'i' 'f' 'f' 'fff' 'f' 
    'f' 'f' 'ffff' 'f' 'f' 'f' 'f' 'f' 'f' 'f' 'H' 'B' 'B' 'B' 'B' 'B' 'b' 'b' 'b' 'x'
)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", UDP_PORT))

print(f"Listening on port {UDP_PORT}... Drive around to see data change.")
time.sleep(2)

try:
    while True:
        data, addr = sock.recvfrom(1024)
        if len(data) == 324:
            f = PACKET_FMT.unpack(data)
            
            # Clear terminal screen dynamically for a clean dashboard view
            os.system('cls' if os.name == 'nt' else 'clear')
            
            print("=" * 60)
            print("         FORZA TELEMETRY LIVE TUPLE INDEX INSPECTOR")
            print("=" * 60)
            print("Drive, accelerate, and look for variables changing in real-time.")
            print("Press Ctrl+C to exit.\n")
            
            # Print elements in a clean grid showing their exact tuple index
            for idx, val in enumerate(f):
                # Format to look clean whether it's an int or float
                val_str = f"{val:.4f}" if isinstance(val, float) else str(val)
                print(f"f[{idx}]: {val_str:<12}", end=" | " if (idx + 1) % 4 != 0 else "\n")
                
            print("\n" + "=" * 60)
            time.sleep(0.1) # Caps updates to ~10 Hz so your terminal doesn't flicker wildly

except KeyboardInterrupt:
    print("\n[INFO] Inspector stopped.")
