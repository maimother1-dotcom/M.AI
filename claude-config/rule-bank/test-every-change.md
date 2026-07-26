---
id: test-every-change
triggers: [edit, change, update, fix, build, code, write, create, modify, implement, add, remove, refactor, deploy, workflow, function, component, endpoint, API, webhook, page, feature, live, clean, deployed, ready, done, ship, push, commit]
severity: hard
applies_to: [all]
created: 2026-04-01
source: correction
---
After EVERY change, you MUST run a real test BEFORE saying it works. This is not optional. The sequence is: make change -> test it -> confirm it works -> THEN report.

For web apps: use web-tester subagent (Playwright) to load the page, verify the element exists, click it, check console for errors. Do NOT just check deployment status or curl the URL — actually open the page and verify the feature.

For n8n workflows: trigger the workflow and check execution history for success.

For API endpoints: curl the endpoint with real data and verify the response.

"Deployment is READY" is NOT a test. "Zero JS errors" from a curl is NOT a test. You must interact with the actual feature in a browser/endpoint and verify it does what it's supposed to do.

If you say "done" or "working" or "live" without having run a real test, you have failed.
