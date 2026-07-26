---
id: test-mobile-before-done
triggers: [mobile, responsive, viewport, phone, iphone, optimize mobile]
severity: hard
applies_to: [code, vercel, web]
created: 2026-04-08
source: correction
---

Never claim a page is mobile-optimized without actually testing it at mobile viewport first. After any mobile CSS change, use web-tester agent with viewport width 390px to screenshot the page and verify visually before reporting done. Text touching screen edges, overflowing tables, clipped content = failed. "I added the media queries" is NOT a test.

**Why:** Bijoy had to repeat himself about mobile optimization after being told it was already done. The page still had text touching edges and layout issues.

**How to apply:** Any time claiming "mobile optimized" or "responsive" -- run web-tester at 390x844 first. Only report done after seeing the screenshot confirms it looks good.
