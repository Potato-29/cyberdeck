import requests
import sys

# --- CONFIG ---
PC_IP = "192.168.1.9" # Replace with your actual PC IP
PORT = "8085"

# ANSI Color Codes for terminal prettification
BLUE = "\033[38;5;75m"
ORANGE = "\033[38;5;208m"
GREEN = "\033[38;5;121m"
RED = "\033[38;5;196m"
RESET = "\033[0m"
BOLD = "\033[1m"

def find_sensor(data, sensor_id):
    if isinstance(data, dict):
        if data.get('SensorId') == sensor_id:
            return data.get('Value')
        for key in ['Children', 'Sensors']:
            if key in data:
                result = find_sensor(data[key], sensor_id)
                if result: return result
    elif isinstance(data, list):
        for item in data:
            result = find_sensor(item, sensor_id)
            if result: return result
    return None

def run_once():
    url = f"http://{PC_IP}:{PORT}/data.json"
    try:
        response = requests.get(url, timeout=1)
        data = response.json()

        # Extracting Data
        cpu_temp = find_sensor(data, "/amdcpu/0/temperature/2")
        cpu_load = find_sensor(data, "/amdcpu/0/load/0")
        gpu_temp = find_sensor(data, "/gpu-nvidia/0/temperature/0")
        gpu_load = find_sensor(data, "/gpu-nvidia/0/load/0")
        ram_load = find_sensor(data, "/ram/load/0")
        cpu_fan  = find_sensor(data, "/lpc/it8686e/0/fan/0")

        # Formatting Output with Icons
        print("\n")
        print(f"{BLUE}  CPU:{RESET} {BOLD}{cpu_load}{RESET} @ {ORANGE}{cpu_temp}{RESET}")
        print(f"{GREEN}󰢮  GPU:{RESET} {BOLD}{gpu_load}{RESET} @ {ORANGE}{gpu_temp}{RESET}")
        print(f"{BLUE}  RAM:{RESET} {BOLD}{ram_load}{RESET}")
        print(f"{GREEN}󰈐  FAN:{RESET} {BOLD}{cpu_fan}{RESET}")

    except Exception:
        print(f"{RED} fence_off  PC OFFLINE{RESET}")
        sys.exit(0) # Exit cleanly so wtfutil shows the offline msg

if __name__ == "__main__":
    run_once()