---
id: calendly-check-before-followup
triggers: [follow-up, followup, getsales, linkedin, booked, calendly, scheduled]
severity: hard
applies_to: [getsales, outreach]
created: 2026-04-05
source: correction
---

Before sending ANY follow-up to ANY lead, check Calendly for a booking in their name. Pipeline stage in GetSales is NOT reliable — Bijoy may not update it. Calendly is the ground truth. Use the Calendly MCP to list upcoming scheduled events and fuzzy-match the lead's first + last name against invitee names. If a match is found, mark the Linear issue Done (booked: true) and skip. Never send a follow-up to someone who has already booked a call, regardless of what any CRM field says.

**Why:** Bijoy may forget to update the pipeline stage to Booked. The system cannot rely on manual data entry. Calendly always has the real booking.

**How to apply:** In the follow-up flow, always call Calendly before sendLinkedInMessage. No exceptions.
