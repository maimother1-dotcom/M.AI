#!/usr/bin/env python3
"""
UserPromptSubmit hook — injects the EVERY MESSAGE checklist.
Claude runs this silently on every message to keep the vault current.
"""
import json, time, os

HOME = os.path.expanduser("~")
LOCK_DIR = os.path.join(HOME, ".claude", "session-locks")
os.makedirs(LOCK_DIR, exist_ok=True)

SESSION_ID = os.environ.get("CLAUDE_SESSION_ID", str(os.getppid()))

# Stamp prompt time for quality gate
try:
    with open(os.path.join(LOCK_DIR, f"prompt-{SESSION_ID}"), 'w') as f:
        f.write(str(int(time.time())))
except Exception:
    pass

reminder = """CLAUDE.md EVERY MESSAGE CHECKLIST — run this silently WITHIN THIS RESPONSE using your tools:

1. Who was mentioned, worked on, or whose files were touched? → update or create their People note NOW.
2. What was decided? → log in the relevant note NOW.
3. What was completed? → mark done in Tasks.md NOW. Trigger words: done, finished, sent, complete, delivered.
4. What was built or worked on? → log in Daily Note NOW. Create today's note first if it doesn't exist.
5. Any new task implied? → add to Tasks.md NOW with a due date.
6. Any project status change? → update the project note NOW.
7. Any contradiction with existing notes? → correct it NOW.
8. Was a project worked on? → update or create its work state note in Notes/Business/.

MANDATORY FINAL STEP: After completing all of the above, run:
  date +%s > ~/.claude/vault-maintenance-done

This is not optional."""

output = {
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": reminder
    }
}
print(json.dumps(output))
