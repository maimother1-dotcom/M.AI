#!/usr/bin/env bash
# Stop hook — writes session completion status to batch-status.json
# Part of the batch production system. Sessions write their status here.
# When the full batch is done, you get ONE ntfy notification.

STATUS_FILE="$HOME/.claude/dashboard/batch-status.json"
SESSION_ID="${CLAUDE_SESSION_ID:-$$}"
LOCK_DIR="$HOME/.claude/session-locks"

TASK_NAME_FILE="$LOCK_DIR/task-name-$SESSION_ID"
TASK_NAME=""
[ -f "$TASK_NAME_FILE" ] && TASK_NAME=$(cat "$TASK_NAME_FILE" 2>/dev/null)

# Only write if part of an active batch
[ -z "$TASK_NAME" ] && exit 0

SESSION_STATUS_FILE="$LOCK_DIR/session-status-$SESSION_ID"
SESSION_STATUS="working"
SESSION_SUMMARY=""

if [ -f "$SESSION_STATUS_FILE" ]; then
    SESSION_STATUS=$(python3 -c "
import json
try:
    data = json.load(open('$SESSION_STATUS_FILE'))
    print(data.get('status', 'working'))
except:
    print('working')
" 2>/dev/null || echo "working")
    SESSION_SUMMARY=$(python3 -c "
import json
try:
    data = json.load(open('$SESSION_STATUS_FILE'))
    print(data.get('summary', ''))
except:
    print('')
" 2>/dev/null || echo "")
fi

mkdir -p "$(dirname "$STATUS_FILE")"

python3 -c "
import json, os
from datetime import datetime

status_file = '$STATUS_FILE'
session_id  = '$SESSION_ID'
task_name   = '$TASK_NAME'
status      = '$SESSION_STATUS'
summary     = '''$SESSION_SUMMARY'''

try:
    with open(status_file) as f:
        data = json.load(f)
except:
    data = {'batchDate': None, 'tasks': []}

found = False
for task in data['tasks']:
    if task.get('sessionId') == session_id:
        task['status'] = status
        task['summary'] = summary
        if status == 'done':
            task['completedAt'] = datetime.now().isoformat()
        found = True
        break

if not found:
    data['tasks'].append({
        'name': task_name,
        'sessionId': session_id,
        'status': status,
        'summary': summary,
        'completedAt': datetime.now().isoformat() if status == 'done' else None
    })

with open(status_file, 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null

exit 0
