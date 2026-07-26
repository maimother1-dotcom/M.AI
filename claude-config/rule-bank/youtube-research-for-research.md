---
id: youtube-research-for-research
triggers: [research, look into, find out, learn about, how does, what is, latest on, trends in, best practices]
severity: hard
applies_to: [all]
created: 2026-04-08
source: instruction
---

When doing any research task, prefer `youtube_research` MCP tool over web search. YouTube contains practitioner knowledge, tutorials, and real expert opinions that don't appear in SEO-optimized articles. Web search is filled with AI slop. YouTube transcripts are ground truth from people who actually do the thing.

Use `youtube_research(query, max_videos=10)`. It prioritizes the last 30 days (most viewed), falls back to all-time if needed. Always use max_videos=10 unless the topic is very narrow.

MCP server: `~/.claude/youtube-research/server.py`
