---
id: vercel-env-no-echo
triggers: [vercel env add, env add, environment variable, INTERNAL_API_KEY, api key, vercel env]
severity: hard
applies_to: [vercel]
created: 2026-04-04
source: correction
---
NEVER use `echo "value" | vercel env add KEY env` to set Vercel env vars. `echo` appends a trailing newline `\n` to the value, which gets stored as part of the secret. Any exact-match check against that value will silently fail with 401/403.

Always use `printf "value" | vercel env add KEY env` — printf does not append a newline.

**Why:** INTERNAL_API_KEY was added with a trailing newline via echo. Every request to /api/internal/update returned 401 even with the correct key in the header. Required a full rm + re-add + redeploy cycle to fix.

**How to apply:** Any time piping a value to `vercel env add`, use printf not echo.
