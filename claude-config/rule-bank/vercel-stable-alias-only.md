---
id: vercel-stable-alias-only
triggers: [vercel, deploy, deployment, url, alias, report, ship, live, production]
severity: hard
applies_to: [all, vercel, client-delivery]
created: 2026-04-19
source: correction
---
Never report the per-deployment hash URL (e.g. `my-app-abc123xyz-team.vercel.app`) when telling Bijoy something is live. Always use the stable production alias: `<project>.vercel.app` or `<project>-<team>.vercel.app`. Vercel automatically aliases the latest prod deployment to these — they don't change across deploys.

**Why:** Bijoy doesn't want a new URL after every deploy. Changing URLs break Supabase `site_url`, OAuth redirects, client bookmarks, and anything pointing at the app.

**How to apply:**
1. After `vercel --prod --yes`, run `vercel alias ls --scope <team> | grep <project>` to confirm the stable alias is up-to-date.
2. Always report the stable alias in commit messages, vault notes, and responses. Never the hash URL.
3. When configuring Supabase `site_url` / redirect URLs, OAuth callbacks, or any external integration, always pin to the stable alias — never the hash URL.
4. If the stable alias doesn't exist yet (first deploy), create one: `vercel alias set <hash-url> <project>.vercel.app --scope <team>`.
