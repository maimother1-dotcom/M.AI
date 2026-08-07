---
type: index
area: trading
updated: 2026-08-07
---

# Trading Desk

Buy pharmaceutical and nutraceutical raw materials from Chinese manufacturers,
supply them to finished-formulation manufacturers worldwide. Direct shipment,
white label, or repack.

The whole business is one loop, and it runs on one check: does the Chinese
material actually meet the formulator's specification.

Flowchart: [[Notes/Playbooks/Trading Flow]]

---

## How to use it

Say `/trade-desk` and paste whatever arrived. It routes to the right desk.

| Desk | Owns |
|---|---|
| `enquiry-desk` | Front door. Reads the enquiry, opens the record, drafts the acknowledgement |
| `spec-matcher` | Buyer spec vs supplier COA, parameter by parameter. The gate on everything |
| `vendor-desk` | Sourcing, RFQ, supplier documents, samples, price history |
| `sales-desk` | Landed cost, quotation, follow-up |
| `order-desk` | PO to delivery. Payment, production, inspection, documents, shipment |
| `billing-desk` | Invoice, receivables, realised margin |
| `support-desk` | Complaints, CAPA, credit notes, repeat orders |
| `market-desk` | Prospecting, one-pagers, campaigns |

Agent files live in `~/.claude/agents/`. They are procedures first, agents second,
readable and usable by hand.

---

## The four standing rules

1. **No spec, no quote.** No price before a gap report with zero `FAIL` and zero
   `MISSING`, or a written buyer acceptance of each deviation.
2. **No limit from memory.** A specification number comes from a document or is
   written `not stated`.
3. **Drafts only.** Every message to a buyer or supplier is drafted, never sent
   automatically.
4. **Record first.** Every enquiry gets a file and a register row, declines
   included.

---

## Layout

```
Enquiries/     ENQ-2026-001.md, one per enquiry
Orders/        PO-2026-001.md, one per order
Buyers/        one per formulation customer
Suppliers/     one per manufacturer
Products/      spec masters, one per material
Registers/     Enquiry · Order · Supplier Scorecard · Price History
Reference/     glossary, documents, landed cost, payment, company details
```

Numbering runs in sequence per year. Check the register for the last number used.
Backlinks both ways, always.

---

## Reference

- [[Notes/Business/Trading/Reference/COA Parameter Glossary]]: what each parameter
  means and the trap in it. **Read before comparing any spec**
- [[Notes/Business/Trading/Reference/Document Checklist]]: what to collect from a
  supplier and what travels with a shipment
- [[Notes/Business/Trading/Reference/Incoterms and Landed Cost]]: how a price is
  built
- [[Notes/Business/Trading/Reference/Payment and Risk]]: terms, fraud, exposure
- [[Notes/Business/Trading/Reference/Company Details]]: your entity details, used
  by every invoice and quotation

---

## Registers

- [[Notes/Business/Trading/Registers/Enquiry Register]]
- [[Notes/Business/Trading/Registers/Order Register]]
- [[Notes/Business/Trading/Registers/Supplier Scorecard]]
- [[Notes/Business/Trading/Registers/Price History]]

---

## Status

Set up 7th August 2026. No live enquiries, suppliers, or orders yet. Product spec
masters exist with structure and blank limits. Limits get filled from real buyer
specs and monographs as they come in.

Links: [[CLAUDE.md]] · [[Vault Index]] · [[Notes/Playbooks/Trading Flow]]
