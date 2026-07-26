---
id: subagent-delegation
triggers: [agent, subagent, sub-agent, delegate, delegation, haiku, n8n-builder, web-tester, code-builder, outreach-agent, researcher, qa-gate, playwright]
severity: hard
applies_to: [all]
created: 2026-04-21
source: system-design
---
Subagent delegation is MANDATORY based on task type. Custom agents live in `.claude/agents/`. These are not optional.

| Task type | Delegate to | Why |
|-----------|-------------|-----|
| n8n workflow work | `n8n-builder` | Has all n8n quirks, API patterns, credential rules |
| Web/UI testing | `web-tester` | Uses Playwright MCP. NEVER use Chrome for testing. |
| Code/deploy work | `code-builder` | Runs in git worktree isolation, has deployment rules |
| Prospect messages | `outreach-agent` | Has voice model + outreach patterns loaded |
| Research before building | `researcher` | Runs in background, doesn't pollute main context |
| Final verification | `qa-gate` | Tests everything before reporting done. Run before writing done status or sending DONE ntfy. |

Chrome is deprecated for testing. Playwright MCP (web-tester agent) replaces it. Chrome is only for visual verification when Playwright can't cover it and for manual operations like reconnecting n8n credentials.

MODEL ROUTING FOR SUB-AGENTS — explicitly specify the model when spawning:
| Task | Model | Why |
|------|-------|-----|
| Summarization (reading docs, transcripts, articles) | Haiku | 80% cheaper, same quality for extraction |
| Code review, bug investigation | Sonnet | Balanced capability/cost |
| Architecture decisions, complex planning | Opus | Full capability required |
| Simple data extraction, regex, formatting | Haiku | Overkill for Sonnet/Opus |

When prompting for sub-agents: "Spin up a sub-agent to summarize this — use Haiku." Specify the model explicitly.
