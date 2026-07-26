---
id: dont-ask-for-cred-ids-already-connected
triggers: [credential, connected, hubspot, mailchimp, api key, n8n credential]
severity: hard
applies_to: [n8n, all]
created: 2026-04-05
source: correction
---
If [USER] confirms a tool or API is already connected in n8n, never ask for the credential ID. Go find it yourself — search n8n's credentials list via API or check existing workflows that use that tool. Asking for credential IDs that are already confirmed as connected is a waste of his time.
