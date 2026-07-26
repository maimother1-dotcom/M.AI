---
id: voice-prompts-no-default-phrases
triggers: [system prompt, outreach, voice, personalization, claude, linkedin, message, email, template, abby]
severity: hard
applies_to: [claude api prompts, n8n workflows, outreach systems, message generation]
created: 2026-04-24
source: correction
---

Never put specific default phrases, CTAs, or closing lines in a voice/personalization system prompt. Claude will anchor to them and reuse them verbatim in every output, making every message sound identical. This is the opposite of personalization.

Specifically banned from voice prompts:
- "Default CTA: X" — kills variation
- Example sections that only show messages ending the same way
- Specific catchphrases instructed as "use this anchor phrase"

Instead:
- Show MULTIPLE varied examples, explicitly point out what differs between them (different CTAs, different openers, different lengths)
- Tell Claude explicitly: "DO NOT copy any exact phrase verbatim from the examples. Write each message in your own words in this voice."
- Rely on extended thinking to reason about what's unique to each profile
- List 3-5 CTA options and instruct Claude to vary based on what fits the person

Why: [USER] shipped a LinkedIn outreach tool with "Happy to share more context on the live roles if you accept this email :)" listed as "default CTA" in the system prompt. Every single one of the 8 generated emails ended with that exact line. Abby would have flagged it immediately.

How to apply: Before shipping any message generation system, test with 5+ profiles and diff the outputs. If ANY exact multi-word phrase appears across 3+ outputs, the prompt is templated. Fix the prompt, not just the example.

Also: Opus is overkill for message personalization when Sonnet with extended thinking is sufficient. Default to Sonnet 4.6. Upgrade to Opus only when Sonnet provably fails.

Also: never declare a voice/personalization task "done" until the user has seen the actual output and signed off. "It deployed" and "it generated without errors" are not approval.
