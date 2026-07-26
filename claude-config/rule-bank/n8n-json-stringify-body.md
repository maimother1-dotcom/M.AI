---
id: n8n-json-stringify-body
triggers: [n8n, http request, specifyBody, jsonBody, body, api call]
severity: hard
applies_to: [n8n]
created: 2026-04-15
source: observation
---

n8n HTTP Request v4 `specifyBody: "string"` does NOT send raw strings. It wraps the value as a key in a key-value body, corrupting the payload. NEVER use `specifyBody: "string"` for API calls.

Correct pattern: output the request body as a JavaScript OBJECT from Code nodes (not JSON.stringify'd), then use `specifyBody: "json"` with `jsonBody: "={{ JSON.stringify($json.theObject) }}"`. This ensures n8n evaluates the object reference at runtime and serializes it cleanly.

Wrong: `JSON.stringify(body)` in Code node + `specifyBody: "string"` + `body: "={{ $json.body_string }}"`
Right: `return [{json: { request_body: bodyObject }}]` in Code node + `specifyBody: "json"` + `jsonBody: "={{ JSON.stringify($json.request_body) }}"`
