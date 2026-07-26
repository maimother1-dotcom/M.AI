#!/bin/bash
# Marks the current session as "done" in the dashboard when user says /done
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

if [ -z "$PROMPT" ] || [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Match: /done, session done, this is done, we're done, mark done
if echo "$PROMPT" | grep -iqE '^\s*(/done|session done|this is done|we.re done|mark.*done)\s*$'; then
  OVERRIDE_FILE="$HOME/.claude/dashboard/status-overrides.json"

  if [ -f "$OVERRIDE_FILE" ]; then
    EXISTING=$(cat "$OVERRIDE_FILE")
  else
    EXISTING="{}"
  fi

  echo "$EXISTING" | jq --arg sid "$SESSION_ID" '. + {($sid): "red"}' > "$OVERRIDE_FILE"
  echo "Session marked as done on the dashboard."
fi

exit 0
