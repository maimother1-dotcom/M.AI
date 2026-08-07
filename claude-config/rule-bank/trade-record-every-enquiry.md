---
id: trade-record-every-enquiry
triggers: [enquiry, inquiry, buyer asked, requirement, trading record, enq-, register, declined, lead]
severity: high
applies_to: [all]
created: 2026-08-07
source: trading-desk
---
Every trading enquiry becomes a file in `Trading/Enquiries/` and a row in `Trading/Registers/Enquiry Register.md` before it is answered. Including the ones you decline.

Declined enquiries are the most valuable demand data a new trader owns. Three formulators asking for the same material you could not supply is the signal telling you what to source next, and it is invisible unless the declines were recorded.

Fields the buyer did not state are written `not stated`. Never infer a grade from a quantity, a standard from a country, or a requirement from a previous enquiry by the same buyer.

Backlinks both ways: the enquiry links to the buyer note, the buyer note links to the enquiry. Nothing is left without a next action and a date.
