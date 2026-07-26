#!/usr/bin/env bash
# Stop hook — stamps session done. No re-wake (that causes double responses).
# Vault maintenance is handled by the UserPromptSubmit hook, which Claude runs naturally.

# Preserve OAuth token
if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
    echo -n "$CLAUDE_CODE_OAUTH_TOKEN" > ~/.claude/.fresh_token 2>/dev/null
    chmod 600 ~/.claude/.fresh_token 2>/dev/null
fi

LOCK_DIR="$HOME/.claude/session-locks"
SESSION_ID="${CLAUDE_SESSION_ID:-$PPID}"

mkdir -p "$LOCK_DIR"
date +%s > "$LOCK_DIR/done-$SESSION_ID"

# Clean up stale flags
rm -f "$LOCK_DIR"/rewake-"$SESSION_ID"-* 2>/dev/null

exit 0
