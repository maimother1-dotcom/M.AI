---
id: verify-before-reporting-done
triggers: [done, working, live, deployed, fixed, confirmed]
severity: hard
applies_to: [all builds, all features, all deployments]
created: 2026-04-23
source: correction
---
NEVER report a feature as working, fixed, or live without personally verifying it via Playwright (web-tester agent) against the production URL first.

"Deployment is READY" is not a test. "401 from curl" is not a test. Run the actual feature, get the actual result, then report.

If the feature requires auth, create a real session: insert a known OTP via Supabase, have Playwright log in with it, then test the authenticated flow end-to-end.

Bijoy explicitly said: "i told you to fucking verify it on your end" — do not make him say this again.
