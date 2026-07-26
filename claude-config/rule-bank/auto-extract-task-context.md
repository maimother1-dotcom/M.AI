---
id: auto-extract-task-context
triggers: [build, create, make, do, task, implement, fix, deploy, write]
severity: hard
applies_to: [all]
created: 2026-01-01
source: system-design
---

When given a task, auto-extract these without requiring a specific format:

- **Task**: What to build/do
- **Context**: Who it's for, what project it relates to (check vault if not explicit)
- **Input**: Source data — if pasted, use it. If referenced ("from that email"), pull from vault or email.
- **Output**: Where the result goes
- **Done when**: Specific test criteria (derive from context if not stated)

Batch ALL clarifications into ONE message. Never ask for things that can be inferred from context or vault notes.

**Why:** Natural language tasks shouldn't require special formatting. The bottleneck is context delivery, not prompting skill.
**How to apply:** On every task — extract, infer, and only ask about what's genuinely ambiguous.
