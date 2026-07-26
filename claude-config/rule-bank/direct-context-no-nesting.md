---
id: direct-context-no-nesting
triggers: [build, code, feature, fix, deploy, implement, add, create, update, change, edit, workflow]
severity: hard
applies_to: [all]
created: 2026-04-01
source: correction
---
When gathering context for a task, be DIRECT. Never spawn subagents to explore or search. Instead:
1. One `search_vault` call for the person/project
2. One file read for the work state note
3. One file read for CLAUDE.md or relevant playbook
4. Start building

Never: spawn an agent to "explore repo structure", spawn an agent to "search vault for context", read code line by line to understand a codebase. The vault notes and work state notes exist specifically so you don't need to explore. Read them and go.
