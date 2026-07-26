---
id: mcp-desktop-config
triggers: [MCP, config, settings, desktop app, mcpServers]
severity: hard
applies_to: [all]
created: 2026-04-01
source: observation
---
Desktop app reads MCPs from ~/Library/Application Support/Claude/claude_desktop_config.json. ~/.claude/settings.json MCPs only load in CLI mode. After editing config, fully quit and reopen desktop app.
