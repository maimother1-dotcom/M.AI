---
id: always-test-before-done
triggers: [done, finished, complete, deployed, live, sent, delivered]
severity: hard
applies_to: [all]
created: 2026-01-01
source: system-design
---

After EVERY change, run a real test BEFORE saying it works. This is not optional.

The sequence: make change → test it → confirm it works → THEN report.

For web apps: load the page, verify the feature works, check console for errors.
For APIs: curl the endpoint with real data and verify the response.
For automations: trigger the workflow, check execution history for success AND verify the actual output.

"Deployment is READY" is NOT a test. "Zero errors" from a log is NOT a test. You must interact with the actual feature and verify it does what it's supposed to do.

**Why:** "It works" without testing is a lie. It catches nothing and erodes trust.
**How to apply:** Before writing "done", run the test. Always.
