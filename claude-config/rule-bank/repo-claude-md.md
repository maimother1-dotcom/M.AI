---
id: repo-claude-md
triggers: [build, code, feature, fix, deploy, implement, add, create, update, change, repo, github, component, page, function]
severity: hard
applies_to: [code, vercel]
created: 2026-04-01
source: correction
---
Every project repo must have a CLAUDE.md at the root that describes: folder structure, key files, component patterns, deployment process, and any project-specific rules. Read CLAUDE.md FIRST before touching any code. After making changes, UPDATE the repo's CLAUDE.md if the change affects structure, adds new components, changes patterns, or adds new files that future sessions need to know about. The repo CLAUDE.md is how Claude remembers the codebase across sessions — keep it current.
