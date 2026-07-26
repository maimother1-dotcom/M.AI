---
id: vercel-commit-before-deploy
triggers: [vercel, deploy, git, commit, npx vercel]
severity: hard
applies_to: [vercel, code]
created: 2026-04-04
source: correction
---
ALWAYS run `git add` + `git commit` before `vercel deploy --prod --yes`. Vercel CLI deploys from git HEAD, not the local filesystem. Uncommitted files are silently excluded from the deployment — the build succeeds but the features are missing. There is no warning.

Sequence: write code → git add → git commit → vercel deploy. Never skip the commit step even if it seems redundant.

**Why:** This was discovered when NotificationToggle.tsx and /api/internal/update were written but never committed. The deploy succeeded, QA failed, and a full redeploy cycle was wasted.

**How to apply:** Before every `vercel deploy`, run `git status` first. If there are modified or untracked files that are part of the intended changes, commit them first.
