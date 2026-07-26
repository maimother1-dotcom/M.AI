---
id: use-playwright-for-saas-access
triggers: [api key, get api key, linear, resend, sign in, login, credentials, access token, platform]
severity: hard
applies_to: [all]
created: 2026-04-04
source: correction
---
Never ask Bijoy to manually retrieve API keys, check domains, or perform any action in a SaaS platform that Playwright can do. Use the web-tester agent to sign into platforms, navigate to API/settings pages, create keys, and return them autonomously.

Sign-in order for Google OAuth:
1. Business tools (Linear, Resend, Notion, etc.): YOUR_BUSINESS_EMAIL
2. Personal tools: YOUR_PERSONAL_EMAIL

For Playwright Google OAuth: the stored Google session at `~/.claude/credentials/sessions/google.json` may have corrupted binary cookie values — if auth fails, go directly to the platform login page and use `page.click('text=Continue with Google')` or `page.click('text=Sign in with Google')`, then enter the email manually.

**Why:** Bijoy explicitly corrected: "you have the playwright browser, why can't you get the API key yourself?" Asking Bijoy to manually do things Claude can automate is a failure.

**How to apply:** If a task requires credentials from a SaaS platform — just use Playwright. Don't ask. Don't wait. Get it.
