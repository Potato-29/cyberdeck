#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/.env"
set +a

while IFS=$'\t' read -r NAME LABEL RESTARTABLE; do
    [[ -z "$NAME" ]] && continue
    ACTION_ARGS=()
    if [[ "$RESTARTABLE" == "1" ]]; then
        ACTION_ARGS=(-H "Actions: http, Restart $LABEL, $RESTART_URL/restart?service=$NAME&token=$WEBHOOK_TOKEN, method=GET")
    fi
    curl -s \
        -u "$NTFY_USER:$NTFY_PASS" \
        -H "Title: ⚠️ Service Down" \
        -H "Priority: high" \
        -H "Tags: warning,cyberdeck" \
        "${ACTION_ARGS[@]}" \
        -d "$LABEL is not running on your cyberdeck!" \
        "$NTFY_URL/$NTFY_TOPIC"
done < <(python3 "${SCRIPT_DIR}/service_registry.py" --down)
