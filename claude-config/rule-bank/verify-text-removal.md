---
id: verify-text-removal
triggers: [remove, delete, line, text, strip, take out]
severity: hard
applies_to: [all]
created: 2026-04-21
source: correction
---
When asked to remove a specific line or piece of text from a file, always grep the file after the edit to confirm the text is actually gone before regenerating or reporting done. Never assume the edit succeeded — verify with a search. If the text is still present, fix it before proceeding.
