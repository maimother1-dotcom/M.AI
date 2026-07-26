---
id: auto-health-check-on-hot-missions
triggers: [workflow, automation, build, calendar, n8n, deploy, live, active]
severity: hard
applies_to: [n8n, client-delivery, all]
created: 2026-04-06
source: observation
---
Every "hot mission" (live client automation, active n8n workflow, deployed integration) must have an automated health check scheduled at build time -- not as an afterthought. Use `mcp__scheduled-tasks__create_scheduled_task` with a daily cron. The check must: (1) verify the workflow is still active, (2) scan last 24h executions for errors, (3) auto-fix simple issues (expired webhook, inactive workflow), (4) ntfy [USER]_Claude only if something needs human intervention. Never notify the client. Schedule the health check in the SAME response that activates the workflow.
