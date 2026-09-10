#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot entry point. Tracked copy of ~/.termux/boot/startup.sh —
# sync changes here to the device after editing.
#
# All service definitions (what to start, how to check, boot-eligibility)
# live in services.json; --ensure-all starts every entry with boot: true
# that isn't already running. Add a service there, not here.

termux-wake-lock
sleep 10

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "${SCRIPT_DIR}/service_registry.py" --ensure-all
