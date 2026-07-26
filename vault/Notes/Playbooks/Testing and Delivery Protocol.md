# Testing and Delivery Protocol

> Nothing ships without passing this. Every deliverable, every time.

---

## Pre-test checklist

Before running any test:
- [ ] The thing actually exists in production/staging (not just locally)
- [ ] Test data is realistic (not "test@test.com" and "123")
- [ ] You know what "success" looks like before running the test

---

## The golden path test

Test the FULL round-trip from the user's perspective, not the developer's.

Ask: **"What is this supposed to DO for the end user?"**

Then test exactly that. Not "did it compile." Not "did the request succeed." Did it actually DO the thing.

Examples:
- Email automation → did the email actually arrive in the inbox?
- Form submission → did the data land in the CRM/database?
- API endpoint → did it return the right data for the right inputs?
- n8n workflow → did the workflow execute AND produce the correct output?

---

## Error path test

What happens when things go wrong?
- [ ] What if the API returns 500?
- [ ] What if the input is empty or malformed?
- [ ] What if a required field is missing?
- [ ] What if the user does something unexpected?

At minimum, errors should fail gracefully with a clear message. No silent failures.

---

## For web apps

1. Load the page — check for console errors
2. Use the primary feature with realistic data
3. Check the output (database entry, email sent, API response)
4. Try an edge case (empty form, long text, special characters)
5. Check on mobile or smaller screen if layout matters

---

## For n8n workflows

1. Activate the workflow (production mode)
2. Trigger it with real data
3. Check execution history — is every node green?
4. Verify the actual output (email arrived? CRM updated? webhook fired?)
5. Check error path — what happens if the trigger data is malformed?

---

## For APIs

```bash
# Test success case
curl -X POST https://your-endpoint.com/api/action \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "realistic_value"}'

# Test error case
curl -X POST https://your-endpoint.com/api/action \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -d '{}'
```

---

## Definition of done

- [ ] Golden path tested with real data ✓
- [ ] Error path tested ✓
- [ ] No console errors ✓
- [ ] Output verified end-to-end (not just "it ran") ✓
- [ ] Notes updated with what was built ✓

**If any of these are unchecked, it is not done.**
