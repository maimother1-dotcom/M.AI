---
id: wikilinks-bidirectional
triggers: [note, vault, obsidian, person, project, task, link, mention]
severity: hard
applies_to: [vault-notes]
created: 2026-01-01
source: system-design
---

Every vault note must have bidirectional [[wikilinks]]. No orphan notes.

If note A links to note B, note B must link back to note A.

Daily notes need a ## Links section. People notes must link to their company. Project notes must link to related people and tasks.

When creating or updating any vault note, check: does the linked note link back?

**Why:** Obsidian's graph and navigation only work when links are bidirectional. Orphan notes disappear.
**How to apply:** On every note write/update, add the backlink in the same response.
