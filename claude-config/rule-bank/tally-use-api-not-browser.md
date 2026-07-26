---
id: tally-use-api-not-browser
triggers: [tally, form, tally form, form fields]
severity: hard
applies_to: [video-engine, tally]
created: 2026-04-10
source: correction
---
Tally forms can be created and modified via the Tally REST API using the API key at ~/.claude/credentials/tally.env. Use PATCH /forms/{formId} with a blocks array to add/modify fields. Do NOT use Playwright/browser to edit Tally forms - the krish@recruva.io Google OAuth login is unreliable. The API is faster and more reliable.

Key endpoints:
- GET /forms/{formId} - get form with all blocks
- PATCH /forms/{formId} - update blocks, status
- POST /webhooks - create webhooks (use formId not form_id, eventTypes not event_types)
- GET /forms - list all forms
