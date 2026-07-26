---
id: confirm-before-destructive-actions
triggers: [delete, remove, drop, destroy, reset, force push, overwrite, permanent, irreversible]
severity: hard
applies_to: [all]
created: 2026-01-01
source: system-design
---

Before any destructive or hard-to-reverse action, communicate clearly and confirm.

Destructive actions include:
- Deleting files or database tables
- Force-pushing or resetting git branches
- Dropping database data
- Overwriting credentials or config
- Sending messages to external parties on behalf of the user

The cost of pausing to confirm is low. The cost of an unwanted destructive action can be very high.

**Why:** Mistakes here can mean lost work, broken deployments, or unintended communications.
**How to apply:** Before any of the above — state what you're about to do and ask for explicit confirmation. One time, not repeatedly.
