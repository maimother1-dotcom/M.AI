---
id: no-manual-steps-for-client-builds
triggers: [supabase, sql, apps script, manually, "you need to", "run this", "paste this"]
severity: hard
applies_to: [all]
created: 2026-04-06
source: correction
---
Never tell [USER] to manually run SQL, paste scripts, or perform any setup step that Claude can do autonomously. For Supabase: try MCP first, then Supabase Management API with access token from passwords.csv, then osascript to open existing Chrome session. For Google Apps Script: replace with n8n workflows watching the sheet instead. If something genuinely cannot be done without manual action, exhaust ALL autonomous approaches first before asking.
