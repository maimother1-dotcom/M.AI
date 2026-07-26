#!/usr/bin/env bash
# UserPromptSubmit hook — session tracking + prompt timing.
# Stamps prompt time for the Stop hook's maintenance check.

LOCK_DIR="$HOME/.claude/session-locks"
SESSION_ID="${CLAUDE_SESSION_ID:-$PPID}"
PROMPT_COUNT_FILE="$LOCK_DIR/count-$SESSION_ID"

mkdir -p "$LOCK_DIR"

# Track prompt count
if [ -f "$PROMPT_COUNT_FILE" ]; then
    COUNT=$(cat "$PROMPT_COUNT_FILE" 2>/dev/null || echo "0")
    case "$COUNT" in ''|*[!0-9]*) COUNT=0 ;; esac
    COUNT=$((COUNT + 1))
else
    COUNT=1
fi
echo "$COUNT" > "$PROMPT_COUNT_FILE"

# Stamp prompt time for Stop hooks (both session-specific and global)
TS=$(date +%s)
echo "$TS" > "$LOCK_DIR/prompt-$SESSION_ID"
echo "$TS" > "$HOME/.claude/last-prompt-time"

# Save prompt text for ntfy hook
INPUT=$(cat /dev/stdin 2>/dev/null || echo "")
PROMPT_TEXT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('prompt',''))" 2>/dev/null || echo "")
[ -n "$PROMPT_TEXT" ] && echo "$PROMPT_TEXT" > "$LOCK_DIR/prompt-text-$SESSION_ID"

exit 0
