#!/data/data/com.termux/files/usr/bin/bash

LOW=20
HIGH=90

while true; do
    STATUS=$(termux-battery-status)
    LEVEL=$(echo $STATUS | python3 -c "import json,sys; b=json.load(sys.stdin); print(b['percentage'])")
    CHARGING=$(echo $STATUS | python3 -c "import json,sys; b=json.load(sys.stdin); print(b['status'])")

    if [[ "$CHARGING" == "DISCHARGING" && "$LEVEL" -le "$LOW" ]]; then
        termux-notification \
            --title "🔋 Battery Low" \
            --content "Battery at ${LEVEL}% — plug in!" \
            --priority high
        termux-tts-speak "Warning! Battery is at ${LEVEL} percent. Please plug in your charger."
    fi

    if [[ "$CHARGING" == "CHARGING" && "$LEVEL" -ge "$HIGH" ]]; then
        termux-notification \
            --title "🔋 Battery Full" \
            --content "Battery at ${LEVEL}% — unplug!" \
            --priority high
        termux-tts-speak "Battery is at ${LEVEL} percent. You can unplug your charger."
    fi

    # check every 5 minutes
    sleep 300
done