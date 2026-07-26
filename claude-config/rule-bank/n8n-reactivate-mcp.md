---
id: n8n-reactivate-mcp
triggers: [n8n, reactivate, deactivate, MCP, availableInMCP]
severity: hard
applies_to: [n8n]
created: 2026-04-01
source: observation
---
n8n deactivate/reactivate resets availableInMCP to false. Must PUT full workflow with availableInMCP: true again.
