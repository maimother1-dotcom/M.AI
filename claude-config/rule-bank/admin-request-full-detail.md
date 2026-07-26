---
id: admin-request-full-detail
triggers: [automation request, request card, requests tab, full request, submitted]
severity: hard
applies_to: [client-portal, admin]
created: 2026-04-05
source: correction
---

Admin automation request cards must show ALL fields the client submitted — name, description, priority, loom URL, api_keys_info (credentials/API keys notes), who submitted it, and when. Never show a truncated card without the ability to expand and read everything. Requests must be fully openable, not just a summary card with name + priority.

**Why:** Bijoy saw only name + priority in the requests tab and couldn't open the full submitted details.

**How to apply:** Any time building or modifying the requests view in admin, ensure every field from automation_requests is visible/expandable. Use a modal or expandable card pattern.
