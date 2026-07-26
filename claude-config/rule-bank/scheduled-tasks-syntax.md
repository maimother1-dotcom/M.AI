---
id: scheduled-tasks-syntax
triggers: [scheduled, schedule, cron, fireAt, recurring, reminder, follow-up, time-delayed, mcp__scheduled-tasks]
severity: hard
applies_to: [all]
created: 2026-04-21
source: system-design
---
Use `mcp__scheduled-tasks__create_scheduled_task` for any time-delayed or recurring action.

One-time: `fireAt: "2026-03-27T10:00:00+05:30"` (always IST, +05:30)
Recurring: `cronExpression: "0 9 * * *"` (IST — cron runs in UTC, so 9am IST = 3:30am UTC = `30 3 * * *`)

Key params:
- `taskId` — kebab-case, unique, descriptive (e.g. "client-followup-apr23")
- `prompt` — fully self-contained with all UUIDs, names, context. The task runs without any conversation history.
- `description` — one line summary

Always use for: follow-ups, reply checks, reminders, any time-delayed action. Never add these to Tasks.md (they're autonomous, not manual).

IST cron conversion: subtract 5h30m from desired IST time to get UTC. Example: 9:00am IST = 3:30am UTC = `30 3 * * *`
