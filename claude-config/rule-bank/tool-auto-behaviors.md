---
id: tool-auto-behaviors
triggers: [gmail, email, drive, google drive, pipeline, calendar, meeting, commit, attio, call, recording, transcript]
severity: hard
applies_to: [all]
created: 2026-04-21
source: system-design
---
Always-active tool behaviors — trigger automatically on the listed keywords:

Gmail: When a person or deal is mentioned, pull their email thread via Gmail MCP and read the full thread before responding. Never summarize without reading first.

Google Drive: Before any deal or pipeline conversation, pull the Pipeline Tracker from your Google Drive pipeline folder (set YOUR_PIPELINE_FOLDER_ID in credentials).

CRM: When a call is mentioned: search for the person in your CRM → search call recordings → fetch full transcript. Read before responding.

Google Calendar: When a commitment or meeting is made in conversation, create a Google Calendar event immediately. Don't ask — just create it and confirm.

Git commits for Vercel-deployed repos: MUST use the correct author email (the one your Vercel account is registered under) or deployments will be blocked. Always verify before pushing.
