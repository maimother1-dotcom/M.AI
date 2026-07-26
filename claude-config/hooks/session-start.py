#!/usr/bin/env python3
"""
SessionStart hook — injects session startup context into Claude.
Per-session lock file prevents re-injection after compaction (PostCompact handles that).
"""
import json, os, time

HOME = os.path.expanduser("~")
LOCK_DIR = os.path.join(HOME, ".claude", "session-locks")
os.makedirs(LOCK_DIR, exist_ok=True)

SESSION_ID = os.environ.get("CLAUDE_SESSION_ID", str(os.getppid()))
LOCK_FILE = os.path.join(LOCK_DIR, f"start-{SESSION_ID}")

# Check if this session already started (prevents re-fire after compaction)
already_started = False
try:
    if os.path.exists(LOCK_FILE):
        age = time.time() - os.path.getmtime(LOCK_FILE)
        if age < 3600:  # lock valid for 1 hour
            already_started = True
except Exception:
    pass

if already_started:
    # After compaction: output nothing. PostCompact handles the reminder.
    print(json.dumps({}))
    raise SystemExit(0)

# First start for this session — write lock
try:
    fd = os.open(LOCK_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, str(time.time()).encode())
    os.close(fd)
except FileExistsError:
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(time.time()))
    except Exception:
        pass
except Exception:
    try:
        with open(LOCK_FILE, "w") as f:
            f.write(str(time.time()))
    except Exception:
        pass

# Clean up stale session locks (async, non-blocking)
import subprocess as _sp
_sp.Popen(
    ["bash", os.path.join(HOME, ".claude", "hooks", "cleanup-session-locks.sh")],
    stdout=_sp.DEVNULL, stderr=_sp.DEVNULL
)

# Preserve OAuth token for autonomous sessions
token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
if token:
    token_file = os.path.join(HOME, ".claude", ".fresh_token")
    try:
        with open(token_file, "w") as f:
            f.write(token)
        os.chmod(token_file, 0o600)
    except Exception:
        pass

# Build context injection
context_parts = ["SESSION START: Execute the CLAUDE.md session start checklist now."]
context_parts.append("Read Tasks.md, check the Inbox, glance at the last 2-3 Daily Notes.")
context_parts.append("Do this silently before responding.")

# Get today's date for daily note check
import subprocess
try:
    result = subprocess.run(
        ["date", "+%-d %B %Y"],
        capture_output=True, text=True, timeout=2
    )
    if result.returncode == 0:
        date_str = result.stdout.strip()
        day = int(date_str.split()[0])
        suffix = "th" if 11 <= day <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        daily_note_name = f"{day}{suffix} {' '.join(date_str.split()[1:])}"
        context_parts.append(f"Today's daily note should be: {daily_note_name}.md")
except Exception:
    pass

output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": " ".join(context_parts)
    }
}
print(json.dumps(output))
