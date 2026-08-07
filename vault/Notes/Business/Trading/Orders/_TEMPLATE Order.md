---
type: order
area: trading
id: PO-2026-nnn
enquiry: -
buyer: -
supplier: -
product: -
mode: - (direct / white-label / repack)
status: opened
next_action: -
next_date: -
---

# PO-2026-nnn: <<BUYER>>, <<PRODUCT>>

Status: `opened` → `paid-advance` → `in-production` → `batch-coa-matched` →
`shipped` → `delivered` → `invoiced` → `paid` → `closed`

---

## Commercial

| Field | Buyer side | Supplier side |
|---|---|---|
| Reference | - | - |
| Product | - | - |
| Grade / standard | - | - |
| Quantity | - | - |
| Packing | - | - |
| Price | - | - |
| Incoterm | - | - |
| Delivery place | - | - |
| Lead time | - | - |
| Payment terms | - | - |
| Country of origin | - | - |

**Check every row across.** A mismatch between the buyer PO and the supplier PI is
your loss, not theirs. Five minutes here prevents the expensive kind of problem.

---

## The spec sold against

Copy the agreed spec here. This copy, not the supplier's general spec, is what
the delivered batch COA gets matched against.

| Parameter | Limit | Method | Source |
|---|---|---|---|

---

## Landed cost

| Line | Quoted | Actual | Gap |
|---|---|---|---|
| FOB / ex-works | - | - | |
| Inland freight origin | - | - | |
| Export clearance | - | - | |
| Sea / air freight | - | - | |
| Insurance | - | - | |
| Duty and cess | - | - | |
| Clearing and port | - | - | |
| Inland transport | - | - | |
| Repack / label | - | - | |
| Testing | - | - | |
| Bank charges | - | - | |
| Finance cost | - | - | |
| FX movement | - | - | |
| Wastage allowance | - | - | |
| **Landed cost** | - | - | |
| **Margin** | - | - | |

Reconcile after closing. Feed the actuals back into
[[Notes/Business/Trading/Reference/Incoterms and Landed Cost]].

---

## Payment

| Milestone | Due | Amount | Paid on |
|---|---|---|---|
| Supplier advance | - | - | - |
| Supplier balance (against BL + COA) | - | - | - |
| Buyer advance | - | - | - |
| Buyer balance | - | - | - |

Balance to the supplier only after shipping documents **and** a batch COA that
passed spec match. Bank details verified by voice.

---

## Production and inspection

| Step | Date | Note |
|---|---|---|
| Order placed | - | |
| Production start | - | |
| Production complete | - | |
| Batch COA received | - | |
| **Batch COA spec matched** | - | verdict: - |
| Inspection | - | |
| Dispatch | - | |

Batch number: - · Manufacturing date: - · Expiry / retest: -

---

## Documents

| Document | Received | Checked against others |
|---|---|---|
| Commercial invoice | - | |
| Packing list | - | |
| Bill of lading / AWB | - | |
| Certificate of origin | - | |
| Batch COA | - | |
| MSDS | - | |
| Insurance certificate | - | |
| Other | - | |

Names, quantities, weights and numbers must agree across all of them.

---

## Shipment

| Field | Value |
|---|---|
| Mode | sea / air |
| Vessel / flight | - |
| Container / AWB | - |
| ETD | - |
| ETA | - |
| Actual arrival | - |
| Delivered on | - |
| **Promised vs actual** | - days |

Tell the buyer the ETA before they ask.

For direct shipment: packing list neutralised, marks checked so neither side
learns the other's identity.
For repack or white label: output pack traced to manufacturer batch. Record the
link here.

---

## Invoice and close

| Field | Value |
|---|---|
| Invoice number | - |
| Invoice date | - |
| Amount | - |
| Due date | - |
| Paid on | - |
| **Realised margin** | - |

## Issues

Anything that went wrong, and what it changed.

Links: [[Notes/Business/Trading/README]] ·
[[Notes/Business/Trading/Registers/Order Register]]
