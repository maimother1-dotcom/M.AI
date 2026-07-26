---
id: test-full-roundtrip
triggers: [test, verify, check, email, form, automation, workflow, submit]
severity: high
applies_to: [all]
created: 2026-01-01
source: system-design
---

Test the FULL round-trip from the end user's perspective, not the developer's.

Before testing, ask: "What is this supposed to DO for the end user?" Then test exactly that.

Examples:
- Email automation → did the email ARRIVE in the inbox? (not "did the request succeed")
- Form submission → did the data land in the database? (not "did the form post")
- API endpoint → did it return the right data? (not "did it respond 200")
- Automation workflow → did it produce the correct output? (not "did it execute")

**Why:** "The form submitted successfully" is not a complete test. The whole flow must be verified.
**How to apply:** On every test, ask "what does the user experience?" and test that, not the internals.
