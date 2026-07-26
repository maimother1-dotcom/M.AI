---
id: n8n-put-exact-payload
triggers: [n8n, PUT, workflow, update workflow, additional properties]
severity: hard
applies_to: [n8n]
created: 2026-04-14
source: observation
---

n8n PUT /api/v1/workflows/{id} accepts EXACTLY these top-level fields — nothing else:

```
name, nodes, connections, settings, staticData
```

DO NOT include: `pinData`, `description`, `meta`, `active`, `tags`, `id`, `versionId`, `activeVersionId`, `versionCounter`, `createdAt`, `updatedAt`, `isArchived`, `triggerCount`, `shared`, `activeVersion`

`pinData` is the most common silent trap — it looks harmless but causes `"request/body must NOT have additional properties"`.

**Settings** — only these sub-fields are safe:
```json
{
  "executionOrder": "v1",
  "saveManualExecutions": true,
  "callerPolicy": "workflowsFromSameOwner"
}
```
Do NOT include `availableInMCP`, `errorWorkflow` (empty string causes issues on some versions).

**staticData** — always set to `null`, never `{}` or omit.

**Correct minimal payload:**
```python
payload = {
    "name": wf["name"],
    "nodes": cleaned_nodes,
    "connections": wf["connections"],
    "settings": {"executionOrder": "v1", "saveManualExecutions": True, "callerPolicy": "workflowsFromSameOwner"},
    "staticData": None,
}
```

**After every PUT:** credentials are stripped from nodes. Reconnect immediately via web-tester (Playwright) — do not ask [USER] to do it manually.

**How to apply:** Before any PUT, filter the fetched workflow object to only the 5 allowed keys above. Never pass the raw fetched object back.
