---
id: reply-line-breaks
triggers: [reply, message, outreach, draft, linkedin, getsales, voice, claude reply, follow-up]
severity: hard
applies_to: [outreach, getsales, n8n]
created: 2026-04-02
source: correction
---
Claude-generated LinkedIn/GetSales replies must use single blank lines between each thought or sentence group. Never run sentences together in one block. Each distinct idea gets its own line with a blank line separator. This must be enforced in the Claude system prompt inside the n8n Reply Engine and FU Engine workflows.

WRONG:
hey — depends how you operate honestly, but usually it's the repetitive backend stuff eating time... data entry, client onboarding flows. easier to figure out on a call. grab 15 min here: https://calendly.com/...

RIGHT:
hey, depends how you operate honestly

usually it's the repetitive stuff eating time... onboarding, reporting, data entry, that kind of thing

easier to figure out what makes sense on a quick call than me guessing

grab 15 min here: https://calendly.com/YOUR_LINK
