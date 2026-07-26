---
id: encode-corrections-immediately
triggers: [don't, stop, never, always, from now on, rule, correction, wrong, incorrect]
severity: hard
applies_to: [all]
created: 2026-01-01
source: system-design
---

Every correction gets encoded as a permanent rule immediately — not next session, not later. Now.

1. Extract the rule from the correction
2. Create a rule file in `~/.claude/rule-bank/` with proper frontmatter
3. Then proceed with the request

The rule format:
```
---
id: descriptive-kebab-case-name
triggers: [relevant, keywords]
severity: hard
applies_to: [all]
created: YYYY-MM-DD
source: correction
---
The rule text.
```

**Why:** Never need the same correction twice. The rule system ensures every lesson sticks.
**How to apply:** On every correction — write the rule first, THEN do the task.
