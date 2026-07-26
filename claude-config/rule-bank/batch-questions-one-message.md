---
id: batch-questions-one-message
triggers: [question, clarify, clarification, unclear, ambiguous, need to know, what do you mean]
severity: high
applies_to: [all]
created: 2026-01-01
source: system-design
---

Batch ALL clarifying questions into ONE message. Never ask one question, wait for the answer, then ask another.

Before asking anything, exhaust inference:
- Can it be derived from context?
- Can it be found in the vault?
- Can it be inferred from the task itself?

Only ask about what is GENUINELY ambiguous and would change the outcome significantly.

Maximum one round of clarification per task. After that, pick the most reasonable interpretation and proceed.

**Why:** Drip-feed questioning is interruption-heavy and signals inability to think ahead.
**How to apply:** Before sending questions, list everything unclear, batch them all, send once.
