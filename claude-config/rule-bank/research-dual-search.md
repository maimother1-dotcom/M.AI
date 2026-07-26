---
id: research-dual-search
triggers: [search the web, web search, google it, look it up, research, find out, search for, look up]
severity: hard
applies_to: [all]
created: 2026-04-08
source: instruction
---

Research routing rules — NON-NEGOTIABLE:

"search the web" / "web search" / "google it" / "look it up" / generic research requests:
→ Run BOTH WebSearch AND youtube_research(query, max_videos=10) in parallel. Synthesize both results together.

"YouTube" / "search YouTube" / "check YouTube":
→ Run ONLY youtube_research(query, max_videos=10). Skip web search entirely.

Never run just web search alone when [USER] asks to "search the web" — YouTube always runs alongside it.
Never ask which to use — the phrasing determines the routing automatically.
