---
id: preflight-before-build
triggers: [build, create, deploy, implement, set up, configure, integrate]
severity: hard
applies_to: [all]
created: 2026-01-01
source: system-design
---

Before ANY build work, run the pre-flight checklist (30 seconds max):

1. **CREDENTIALS:** Does every tool/API this task needs have credentials? Test them. If missing: STOP. Tell the user exactly where to get them and where to put them.
2. **ACCESS:** Can you reach each external API? Do credentials have correct permissions?
3. **CONTEXT:** Is all input data available? Are all referenced notes current?

If pre-flight passes, proceed to build.
If any check fails: block immediately with exact, actionable instructions. Never waste 10 minutes trying when the user can fix it in 30 seconds.

**Why:** Building without credentials or context wastes time and produces incomplete work.
**How to apply:** On every build task, run pre-flight before the first line of code.
