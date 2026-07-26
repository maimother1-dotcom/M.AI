---
id: no-code-comments-by-default
triggers: [code, function, script, implement, write, build, refactor]
severity: normal
applies_to: [code]
created: 2026-01-01
source: system-design
---

Default to writing no comments in code.

Only add a comment when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment wouldn't confuse a future reader, don't write it.

Don't explain WHAT the code does (well-named identifiers do that). Don't reference the current task, issue, or caller ("used by X", "added for Y flow") — those belong in commit messages.

Never write multi-paragraph docstrings or multi-line comment blocks.

**Why:** Comments that explain the obvious are noise. They dilute the signal of comments that actually matter.
**How to apply:** Before writing a comment, ask "would this confuse a competent reader without the comment?" If no, skip it.
