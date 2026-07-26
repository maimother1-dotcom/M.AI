---
id: no-playwright-when-api-exists
triggers: [n8n, playwright, chrome, workflow, credential, node, web-tester]
severity: hard
applies_to: [n8n, all]
created: 2026-04-07
source: correction
---
For n8n: ONLY use the n8n REST API (via Bash curl or Python urllib) or the n8n MCP tools. NEVER use Playwright, web-tester agent, or Chrome MCP to interact with n8n. No exceptions. n8n has a full REST API — every operation (create, update, activate, deactivate, fetch executions, reconnect credentials) is doable via API. Using the browser for n8n is always wrong.

This extends to ALL tools with an API: if an API key exists for a platform, use the API. Playwright/web-tester is ONLY for platforms with zero API access.

**Why:** [USER] explicitly corrected this multiple times — "You have an API key, stop messing around." Browser automation for API-accessible tools wastes time and is fragile.

**How to apply:** Before spawning web-tester or using Chrome for ANY tool interaction, ask: does this tool have an API? If yes, use the API. Only fall back to browser if the specific operation has NO API equivalent.
