---
id: self-recovery
triggers: [error, fail, blocked, stuck, broken, issue, bug, problem]
severity: hard
applies_to: [all]
created: 2026-04-01
source: system-design
---
Self-recovery protocol: 1) Read the error. 2) Search vault + web for solution. 3) Try fix #1. 4) If fails, try fundamentally different approach. 5) Check if environmental (creds, service down, permissions). 6) Only after 3 genuine attempts: ntfy with what was tried. Never stop. Never ask. Try harder.
