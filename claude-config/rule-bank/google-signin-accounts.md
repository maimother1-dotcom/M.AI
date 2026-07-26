---
id: google-signin-accounts
triggers: [google, signin, sign in, login, oauth, linear, resend, api key, credentials, account]
severity: hard
applies_to: [all]
created: 2026-04-04
source: correction
---
When accessing business tools or SaaS platforms that require Google sign-in, always attempt authentication autonomously using Playwright — do NOT ask Bijoy to provide API keys or credentials manually unless the automated sign-in fails after genuine attempts.

Sign-in order:
1. Business/agency tools (Linear, Resend, Notion, Slack, etc.): try YOUR_BUSINESS_EMAIL first
2. Personal/general tools: try YOUR_PERSONAL_EMAIL
3. Google OAuth: use the stored Google session via `python3 ~/.claude/credentials/auth-helper.py session google` to get storageState path for Playwright

When retrieving API keys from platforms (Linear, Resend, etc.):
- Use Playwright (web-tester agent) to sign in → navigate to API/settings page → create key → return value
- Save the key to `~/.claude/credentials/{service}.env` immediately
- Add to Vercel env vars if the portal needs it
- Never ask Bijoy to do this manually when a browser can do it.
