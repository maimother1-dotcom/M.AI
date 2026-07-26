---
name: client-delivery
description: Full deliverable workflow. Use when building, testing, deploying, or delivering any project, automation, or system. Covers the complete build-test-deploy-document cycle.
user-invocable: true
---

# Client Delivery Protocol

## 1. Context load (before writing a single line)

- Read the client's People note AND any relevant project note
- Read the Testing and Delivery Protocol playbook
- If there's an existing codebase: read README and recent commits
- If there's an active email thread: read the full thread

Skip none of these. Missing context causes rework.

---

## 2. Pre-flight (before building)

Check:
- [ ] Credentials exist and work
- [ ] APIs are reachable with correct permissions
- [ ] All input data and context available
- [ ] Access to deploy environment confirmed

If ANYTHING fails: stop immediately. Tell the user exactly what they need to provide. Never waste time trying to work around a missing credential — it takes them 30 seconds to fix.

---

## 3. Build

- **Credential swap principle:** Don't have client credentials yet? Use your own account. Document every credential that needs swapping in the deliverable note.
- **Always include:** error notifications, input validation, retry logic for API calls
- For APIs: only validate at system boundaries (user input, external services)
- Prefer editing existing code over creating new files

---

## 4. Test

Read the Testing and Delivery Protocol playbook. Key points:
- Test the FULL round-trip from the user's perspective
- "Did the email arrive?" not "did the request succeed?"
- Test error paths, not just the happy path
- Screenshot or log proof of successful test

---

## 5. Deploy

- Verify deployment in production — check the actual URL, check logs
- Run any database migrations
- Confirm it works end-to-end in production (not just locally)
- **Do NOT stop before production is verified**

---

## 6. Document

- Update project note: what was built, what's pending, credentials to swap
- Log in today's Daily Note
- Mark tasks complete in Tasks.md
- If a new pattern was learned: run self-learn

---

## 7. Notify

```bash
echo "Built: [what]
Tested: [how]  
Deployed: [where]
Pending: [anything]" | bash ~/.claude/hooks/ntfy-notify.sh
```

Every deliverable. Every time.
