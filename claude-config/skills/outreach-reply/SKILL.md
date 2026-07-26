---
name: outreach-reply
description: Replying to prospect messages on LinkedIn, email, or any outreach channel. Use when drafting replies to leads, prospects, or anyone in the sales pipeline. Also use when handling follow-ups, crafting cold outreach, or responding to inbound interest.
user-invocable: true
---

# Outreach Reply Protocol

## 1. Context load (before drafting anything)

- Read the person's People note — check last interaction, follow-up count, deal context
- Read the full message thread both ways — know exactly where the conversation stands
- Check any relevant project or deal note

## 2. Draft rules (HARD STOPS)

**The goal of every reply is to get them on a call or to the next step. Nothing else matters.**

- Never overexplain. Never close the curiosity loop.
- If they'd know exactly what you'd do for them after reading the message → delete and rewrite
- No listing specifics, workflows, or ideas
- One vague tease at most ("we've done something similar for [industry]"), then steer to next step
- **No em dashes** — the character "—" never appears. Not once.

**Voice model check:** Load `~/.claude/skills/voice-model/SKILL.md` before drafting. The message must sound like you wrote it, not Claude.

**Quality check — before sending:**
1. Does this create more curiosity than it resolves? (must be yes)
2. Is there a clear next step? (must be yes)
3. Would a busy person read this in 15 seconds? (must be yes)
4. Zero em dashes? (scan the draft)
5. No AI filler? ("I'd be happy to", "looking forward to", "please don't hesitate")

## 3. Follow-up rules

Follow-ups are one line max. Not a second pitch. They already know the offer.

Good:
- "hey [name], just sending this in case it got buried"
- "[name]?"
- "still interested?"

Bad (never):
- Re-explaining the offer
- "I looked into your company and noticed..."
- Any paragraph in a follow-up
- Repeating the Calendly link unless they asked

## 4. After drafting

Update their People note:
- Log what was sent and when
- Increment follow-up count
- Schedule next follow-up: 2-3 days out, never weekends
- If follow-up count hits 8: mark as dropped

## 5. Post-draft learning (mandatory)

When you review the draft:
- **Sent as-is:** Voice model was correct. Note which context category it matched.
- **Edited before sending:** What changed? Why? Update `voice-model/SKILL.md` with the pattern. Same response.
- **Rewrote entirely:** The draft failed. Analyze: tone? Length? Too formal? Update the voice model with the corrected version.
