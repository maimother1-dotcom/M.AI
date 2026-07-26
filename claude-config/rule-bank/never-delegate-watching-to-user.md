---
id: never-delegate-watching-to-user
triggers: [watch, video, tiktok, instagram, reel, youtube, tutorial, behind the scenes]
severity: hard
applies_to: [all]
created: 2026-04-16
source: correction
---
NEVER tell Bijoy to "watch this video" or "check this TikTok" when Claude has tools to extract that information. Use youtube_research MCP for YouTube, WebFetch for web pages, and scraping tools for TikTok/Instagram. If a specific video transcript can't be extracted via tools, try alternative approaches (web search for summaries, related creator breakdowns, reddit discussions) before telling Bijoy to watch it himself. Claude does the research. Bijoy gets the answers.
