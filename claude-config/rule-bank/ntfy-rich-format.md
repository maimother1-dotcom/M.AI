---
id: ntfy-rich-format
triggers: [ntfy, done, complete, notification, DONE, NEEDS YOU, blocked]
severity: hard
applies_to: [all]
created: 2026-04-01
source: correction
---
**BATCH MODE (when Active Batch exists):**
Do NOT send ntfy on individual task completion. Write status to session-status file instead:
- Done: `echo '{"status":"done","summary":"SUMMARY"}' > ~/.claude/session-locks/session-status-$CLAUDE_SESSION_ID`
- Blocked: `echo '{"status":"blocked","summary":"WHAT IS NEEDED"}' > ~/.claude/session-locks/session-status-$CLAUDE_SESSION_ID`
The batch monitor cron (every 3 min) sends ONE ntfy when entire batch is complete or when blocked.

**SINGLE TASK MODE (no active batch):**
Send ntfy normally. Format:

DONE notifications:
- Title: `TaskName: DONE`
- Body: What was built + where to see it (URL, file path, or "check vault note"). One line each, max 3 lines.
- Example: `Title: Client Portal: DONE` / `Body: Added support chat widget bottom-right. Live at your-app.vercel.app. Tested on mobile + desktop.`

NEEDS YOU notifications:
- Title: `TaskName: NEEDS YOU`
- Body: What's blocked + what was tried + what decision is needed. Max 3 lines.
- Example: `Title: Outreach Workflow: NEEDS YOU` / `Body: Need ClickUp API key, not in credentials. Tried vault + Drive, not found. Add to ~/.claude/credentials/clickup.env`

Never send: vague "done" with no context, "check results", single-word bodies, or per-task notifications during a batch.
