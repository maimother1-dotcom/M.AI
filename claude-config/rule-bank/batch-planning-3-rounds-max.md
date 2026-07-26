---
id: batch-planning-3-rounds-max
triggers: [plan, batch, planning, scope, tasks, today, session]
severity: hard
applies_to: [all]
created: 2026-04-08
source: system-design
---

When scoping multiple tasks in a planning session:

**Round 1**: For ALL tasks at once, present what Claude already knows and batch ALL questions together. Group by task but ask everything in one message.

**Round 2**: Follow-ups on anything still unclear from Bijoy's answers.

**Round 3**: Edge cases and pre-flight concerns.

Maximum 3 rounds of Q&A. If Claude needs more than 3 rounds, the task scope wasn't clear enough, state what assumptions are being made and proceed.

After scoping, auto-generate:
1. One self-contained prompt per task (displayed directly in response for copy-paste)
2. Active Batch.md with all tasks listed
3. Director's Brief: "X sessions to launch. Estimated total: ~Y min. You need to provide: [blocked items]. Deliverables: [list]. ONE notification when all done."

**Why:** Bijoy wants to enter plan mode, scope 6 tasks, get 6 prompts, and paste them into parallel sessions. All thinking happens in one place.
