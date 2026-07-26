---
id: always-qa-gate
triggers: [done, complete, deliverable, DONE, finished, shipped, deployed, ntfy]
severity: hard
applies_to: [client-delivery]
created: 2026-04-01
source: system-design
---
Run qa-gate subagent before reporting any task as DONE. No exceptions. If qa-gate finds issues, fix them before sending the DONE ntfy.
