---
type: register
area: trading
updated: 2026-08-07
last_number: PO-2026-000
---

# Order Register

Every order, and the money position. For a solo trader the cash position is
survival, so keep the receivables table current above everything else here.

Status: `opened` · `paid-advance` · `in-production` · `batch-coa-matched` ·
`shipped` · `delivered` · `invoiced` · `paid` · `closed`

---

## Open orders

| PO | Date | Buyer | Supplier | Product | Qty | Value | Mode | Status | Next action | Next date |
|---|---|---|---|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - | - | - | - | - |

Mode: direct · white-label · repack

---

## Money out: payable to suppliers

| PO | Supplier | Milestone | Amount | Due | Paid |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

Balance released only against shipping documents **and** a spec-matched batch COA.

---

## Money in: receivable from buyers

| Invoice | PO | Buyer | Amount | Due | Days overdue | Last chased |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

Chase at 3 days before due, on due date, at 7 days over. At 15 days over, stop new
shipments to that buyer until it clears. Decide that here, on the register, not
on the phone under pressure.

**Total outstanding:** -
**Total overdue:** -

---

## Closed orders

| PO | Buyer | Product | Value | Quoted margin | Realised margin | Gap | Delivered vs promised |
|---|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - | - |

The gap column is where you learn what shipping actually costs. Feed it back into
[[Notes/Business/Trading/Reference/Incoterms and Landed Cost]].

---

Links: [[Notes/Business/Trading/README]] ·
[[Notes/Business/Trading/Registers/Enquiry Register]]
