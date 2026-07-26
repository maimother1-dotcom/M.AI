#!/usr/bin/env bash
# ntfy notification — sends a push notification to your phone.
# Usage: echo "message" | bash ntfy-notify.sh
# Or: bash ntfy-notify.sh "message"
# Set YOUR_NTFY_TOPIC to your topic (e.g. "AlexClaude")

NTFY_TOPIC="YOUR_NTFY_TOPIC"

if [ -t 0 ]; then
    MESSAGE="$1"
else
    MESSAGE=$(cat)
fi

MESSAGE=$(echo "$MESSAGE" | tr -s '[:space:]' ' ' | head -c 500)
[ -z "$MESSAGE" ] && MESSAGE="Claude needs your input."

curl -s -d "$MESSAGE" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1

exit 0
