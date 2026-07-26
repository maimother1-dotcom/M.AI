---
id: opus-plans-sonnet-executes
triggers: [plan, planning, execution, task, automation, build, implement]
severity: hard
applies_to: [all]
created: 2026-04-15
source: correction
---

Opus handles all planning and investigation. Sonnet handles all execution and building. This is the standard operating model for every automation and every task. When [USER] starts a planning session on Opus, the output must be a self-contained execution prompt that Sonnet can pick up and run autonomously. Never have Opus do the building. Never have Sonnet do the planning from scratch.
