#!/usr/bin/env bash
# Cleanup stale session lock files older than 2 hours.
# Called by session-start.py on first start (async, non-blocking).

LOCK_DIR="$HOME/.claude/session-locks"
[ -d "$LOCK_DIR" ] || exit 0

find "$LOCK_DIR" -type f -mmin +120 -delete 2>/dev/null
exit 0
