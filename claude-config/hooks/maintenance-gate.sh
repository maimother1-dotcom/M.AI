#!/bin/bash
# Stop hook — compares last-prompt-time vs vault-maintenance-done.
# If maintenance wasn't stamped after the last user prompt, re-wakes Claude (exit 2).
# This catches the case where Claude finished a response without doing vault maintenance.

LAST_PROMPT=$(cat ~/.claude/last-prompt-time 2>/dev/null || echo "0")
LAST_MAINT=$(cat ~/.claude/vault-maintenance-done 2>/dev/null || echo "0")

# If maintenance was stamped AFTER the last prompt was submitted, we're good.
if [ "$LAST_MAINT" -gt "$LAST_PROMPT" ]; then
    rm -f ~/.claude/.rewake-attempted
    exit 0
fi

# Only re-wake ONCE per response. If we already tried and Claude still didn't
# stamp maintenance-done, accept it and move on to prevent an infinite loop.
REWAKE_FLAG=~/.claude/.rewake-attempted
if [ -f "$REWAKE_FLAG" ]; then
    rm -f "$REWAKE_FLAG"
    exit 0
fi
touch "$REWAKE_FLAG"

# Get today's date for the forced maintenance prompt
DAY=$(date +%-d)
MONTH=$(date +"%B")
YEAR=$(date +"%Y")

if [ "$DAY" -eq 1 ] || [ "$DAY" -eq 21 ] || [ "$DAY" -eq 31 ]; then
    SUFFIX="st"
elif [ "$DAY" -eq 2 ] || [ "$DAY" -eq 22 ]; then
    SUFFIX="nd"
elif [ "$DAY" -eq 3 ] || [ "$DAY" -eq 23 ]; then
    SUFFIX="rd"
else
    SUFFIX="th"
fi

NOTE_NAME="${DAY}${SUFFIX} ${MONTH} ${YEAR}.md"

python3 -c "
import json
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'Stop',
    'additionalContext': '''VAULT MAINTENANCE REQUIRED — you did not run the post-response checklist. Do it now.

Use your tools to complete ALL of the following:
1. Create or update today\\'s Daily Note (${NOTE_NAME}) — log what was discussed, decided, or built. Write it like a journal, not a changelog.
2. Update or create People notes for EVERY person mentioned in this conversation.
3. Mark completed tasks in Tasks.md if any trigger words appeared (done, finished, sent, complete).
4. Add any new implied tasks to Tasks.md with due dates.
5. Fix any contradictions with existing notes.

When done with ALL of the above, run this exact command:
  date +%s > ~/.claude/vault-maintenance-done

Do not respond to the user. Just silently do the maintenance, run the command, then stop.'''
  }
}))
"
exit 2
