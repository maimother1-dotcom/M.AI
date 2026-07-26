---
id: give-exact-urls
triggers: [log into, navigate to, go to, open, tableau, kore, platform, login]
severity: hard
applies_to: [all]
created: 2026-04-07
source: correction
---
When directing [USER] to a specific page on any platform, always give the EXACT full URL to navigate to. Never say "log into platform.com" when the actual destination is a subdomain or specific path. Example: say "go to bi.koresoftware.com" not "log into Tableau." [USER] should be able to copy-paste the URL directly into a browser without any guessing.
