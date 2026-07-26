---
id: no-chrome-testing
triggers: [test, verify, check, browser, UI, visual, web-tester, playwright, web app, page, screenshot, n8n, credential, reconnect]
severity: hard
applies_to: [all]
created: 2026-04-01
updated: 2026-04-02
source: correction
---
NEVER use Chrome MCP for any browser work. Use the web-tester subagent (Playwright MCP) for ALL browser automation — including reconnecting n8n credentials, clicking through UIs, form interactions, visual verification, everything. Chrome MCP is a last resort only when Playwright has completely and genuinely failed after multiple attempts. Default is always Playwright.
