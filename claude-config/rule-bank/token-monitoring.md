---
id: token-monitoring
triggers: [context, tokens, session, /context, limit, window, how much, how many tokens, token count]
severity: hard
applies_to: [all]
created: 2026-04-21
source: system-design
---
Context management rules:

SESSION START: Run /context to check baseline token count before doing any work. If baseline > 10,000 tokens, flag which files or MCPs are contributing bloat before proceeding.

DURING SESSION: The 0-20% range is prime time — model is sharpest here. Target: never exceed 120,000 tokens (12% of 1M window) in a single session. At ~100K tokens, proactively suggest running /session-handoff.

AT 120K TOKENS: Trigger session handoff. Type /session-handoff, copy the output, run /clear, paste the output, continue fresh. This is not a hard cutoff — finish the current thought first, but don't start new major tasks.

WHY: Retrieval accuracy drops from 92% at 256K tokens to 78% at 1M tokens. Thinking depth drops 67% in long sessions. Context rot = AI dementia. Reset early, reset often. The 1M token window is insurance, not a budget to spend.

NEVER let auto-compaction fire at 95% — it fires at peak context rot and only preserves 20-30% of detail. Manual handoff at 120K preserves 100%.
