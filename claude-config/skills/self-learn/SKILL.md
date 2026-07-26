---
name: self-learn
description: When Claude discovers a new pattern, tool quirk, workflow insight, API behavior, debugging trick, or any technical knowledge worth retaining. Triggers on corrections, new discoveries, and lessons from errors.
user-invocable: false
---

# Self-Learning Protocol

## The Philosophy

**Every addition must earn its place.** Before writing anything, ask: "Will this make a future task faster, prevent a future mistake, or eliminate a future question?" If no, don't write it.

**Replace, don't accumulate.** New knowledge replaces old. If you knew X before and now know Y, replace X with Y. Don't append. Don't footnote.

**Write conclusions, not stories.** Never log the journey. Log the destination. "Z works. X and Y don't because [reason]." Future Claude needs the answer, not the narrative.

**One fact, one home.** Every piece of knowledge lives in exactly one place. If it's in memory, it's not also in a playbook. If it's in CLAUDE.md, it's not also in a rule.

---

## Where things go

| What was learned | Where it goes |
|---|---|
| Tool quirk, API behavior, error fix | `Notes/Claude Memory/MEMORY.md` |
| Multi-step procedure, full workflow | `Notes/Playbooks/` |
| Behavioral correction (how Claude should act) | `CLAUDE.md` |
| Credential, config for a tool | `Notes/Software/[tool].md` |
| Rule that should auto-apply | `~/.claude/rule-bank/` |

---

## Before writing

1. **Search first.** Check memory, playbooks, CLAUDE.md. If a similar entry exists, UPDATE it.
2. **Is this worth keeping?** One-off fixes are not worth storing. Only store things that recur.
3. **Is this the right layer?** A tool quirk is not a playbook. A full procedure is not a memory entry.

---

## How to write a rule file

```markdown
---
id: rule-name-kebab-case
triggers: [keyword1, keyword2, keyword3]
severity: hard
applies_to: [all]
created: YYYY-MM-DD
source: correction
---

The rule text. What to do. Clear and direct.

**Why:** Why this rule exists.
**How to apply:** When it kicks in.
```

---

## Maintenance

- Memory exceeds 50 entries → consolidate: merge related, delete obsolete
- Same knowledge in two places → delete the less authoritative copy
- Entry hasn't been useful in 30+ days → consider deleting
