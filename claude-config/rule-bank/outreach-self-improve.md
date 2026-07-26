---
id: outreach-self-improve
triggers: [draft, edit, message, sent, rewrite, voice model]
severity: hard
applies_to: [outreach]
created: 2026-04-01
source: correction
---
Self-improvement after every outreach interaction: if [USER] edits a draft before sending, analyze the diff and update voice model skill in the SAME response. If [USER] sends as-is, note what worked. If [USER] rewrites entirely, the draft failed — analyze why and update.
