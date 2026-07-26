#!/usr/bin/env bash
# PostCompact hook — reinjects critical context after context compression.
# Has a per-session compaction guard to prevent compact→inject→compact loops.

LOCK_DIR="$HOME/.claude/session-locks"
mkdir -p "$LOCK_DIR" 2>/dev/null

SESSION_ID="${CLAUDE_SESSION_ID:-$PPID}"
COMPACT_LOCK="$LOCK_DIR/compact-$SESSION_ID"

NOW=$(date +%s)

# Guard: if we compacted within the last 30 seconds, output NOTHING to break the loop
if [ -f "$COMPACT_LOCK" ]; then
    LAST_COMPACT=$(cat "$COMPACT_LOCK" 2>/dev/null || echo "0")
    case "$LAST_COMPACT" in
        ''|*[!0-9]*) LAST_COMPACT=0 ;;
    esac
    ELAPSED=$((NOW - LAST_COMPACT))
    if [ "$ELAPSED" -lt 30 ]; then
        # Output empty JSON — inject nothing, break the loop
        echo '{}'
        exit 0
    fi
fi

# Write compact timestamp
echo "$NOW" > "$COMPACT_LOCK"

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostCompact",
    "additionalContext": "Context compacted. Rules: (1) Time estimate first. (2) Vault maintenance every response. (3) ntfy on deliverables. (4) Read playbooks before workflows."
  }
}
EOF
