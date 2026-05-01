#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/.env"
set +a

SERVICES=(
    "sshd|pgrep -x sshd"
    "cloudflared|pgrep -f cloudflared"
    "picoclaw|tmux has-session -t picoclaw"
    "ntfy|pgrep -f '[n]tfy serve'"
    "battery_alert|pgrep -f battery_[alert.sh](http://alert.sh)"
)
for entry in "${SERVICES[@]}"; do
    NAME="${entry%%|*}"
    CHECK="${entry##*|}"
    eval "$CHECK" > /dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        curl -s \
            -u "$NTFY_USER:$NTFY_PASS" \
            -H "Title: ⚠️ Service Down" \
            -H "Priority: high" \
            -H "Tags: warning,cyberdeck" \
            -H "Actions: http, Restart $NAME, $RESTART_URL/restart?service=$NAME&token=$WEBHOOK_TOKEN, method=GET" \
            -d "$NAME is not running on your cyberdeck!" \
            "$NTFY_URL/$NTFY_TOPIC"
    fi
done
