# Session Handoff Skill

**Trigger:** `/session-handoff` — run when approaching 100-120K tokens or at natural task boundaries.

**Purpose:** Generate a structured handoff so you can /clear and continue fresh without losing any context. Preserves 100% of critical state vs. 20-30% from auto-compaction.

---

## When to Use

- Token count approaching 100K (12% of 1M window)
- Natural task boundary (one major task done, next about to start)
- Session has been running > 1 hour
- Output quality feels like it's degrading
- NEVER before 80K tokens — too early, not enough to hand off

If invoked before 80K tokens, respond: "Too early to hand off — continue until 80K+ tokens. Currently at [X] tokens."

---

## Skill Behavior

When `/session-handoff` is invoked:

1. Check current token count via internal state
2. Analyze the full conversation: what was asked, what was built, what decisions were made, what's still open
3. Read any task lists, plan files, or work state notes created this session to confirm accuracy
4. Output the handoff document in the exact format below
5. End with the reset instructions

---

## Output Format

```
HANDOFF — [date, e.g. 21st April 2026] — [session topic in 3-5 words]

TOKENS USED: [X] / 1,000,000 ([X]%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DECISIONS LOCKED:
• [Decision 1 — be specific. Include WHY if non-obvious]
• [Decision 2]
• [Things NOT to retry — approaches that failed and why]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT SHIPPED:
• [File created/edited: full path]
• [Workflow built: name + ID]
• [URL deployed: full URL]
• [Nothing if nothing shipped yet]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY FILES — read these first in next session:
• [path/to/file.md] — [why it matters / what it contains]
• [path/to/plan.md] — [current status]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RUNNING STATE:
• [What's in progress right now]
• [What's half-done and where it stopped]
• [Any current blocker]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPEN QUESTIONS / DEFERRED:
• [Unresolved item — what's needed to resolve it]
• [Thing deferred to next session]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PICK UP HERE:
• [Exact next action — specific enough that a fresh session knows immediately what to do]
• [Second step if applicable]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## After Generating the Handoff

Say this exactly:

> "Handoff complete. Copy everything above, then:
> 1. Type `/clear`
> 2. Paste the handoff output
> 3. Press enter — fresh session will pick up exactly here."

---

## Quality Check Before Outputting

Before generating, verify:
- [ ] DECISIONS LOCKED includes any approaches that failed (prevents re-trying them)
- [ ] KEY FILES includes the exact paths Claude will need to read to resume
- [ ] PICK UP HERE is specific enough that a fresh Claude can start without asking questions
- [ ] Nothing critical is missing from RUNNING STATE

If any section would be empty, note "Nothing to report" — don't omit the section.
