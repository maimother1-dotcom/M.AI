---
name: trade-desk
description: The front door of the pharmaceutical and nutraceutical trading business. Use when anything arrives that relates to trading raw materials: an enquiry, a specification, a COA, a supplier quote, a purchase order, a shipment update, an invoice question, or a complaint. Routes the work to the right desk. Also use when unsure which trading agent should handle something.
user-invocable: true
---

# Trade Desk: the front door

Paste anything trade related here and this decides who handles it.

Trading folder: `~/Documents/My Vault/Notes/Business/Trading/`
Read `Trading/README.md` if you have not this session.

## 1. Work out what you are looking at

| What arrived | Desk | Agent |
|---|---|---|
| Buyer asking for a material, price, or availability | Enquiry | `enquiry-desk` |
| A spec sheet, monograph, COA, or TDS | Spec | `spec-matcher` |
| Supplier quote, supplier documents, sample update | Vendor | `vendor-desk` |
| Need a price, writing a quotation, quote gone quiet | Sales | `sales-desk` |
| PO received, PI to check, production or shipment update | Order | `order-desk` |
| Invoice, payment, overdue money | Billing | `billing-desk` |
| Complaint, out-of-spec result, return, reorder timing | Support | `support-desk` |
| Prospecting, catalogue, campaign, competitor research | Market | `market-desk` |

Ambiguous? Take the earliest desk in that list. It is cheaper to route forward
than to unwind a quote that should never have been given.

Several things at once, like an enquiry with a spec attached, is the normal
case. Run `enquiry-desk` first to open the record, then `spec-matcher`. Records before
analysis, always.

## 2. Route it

Spawn the agent with the Agent tool. Give it the ENQ or PO number and paste the
content. Agents do not share your conversation, so a reference without the
content is a wasted run.

Simple and obvious? Do it yourself following that desk's file in
`~/.claude/agents/`. The desks are procedures first and agents second.

## 3. The four rules that override anything a desk says

1. **No spec, no quote.** No price leaves this business before a spec-match gap
   report exists with zero `FAIL` and zero `MISSING` rows, or a written buyer
   acceptance of each deviation.
2. **No limit from memory.** A specification number enters the system from a
   document or it is written `not stated`.
3. **Drafts only.** Every message to a buyer or supplier is drafted into Gmail.
   Nothing sends without approval.
4. **Record first.** Every enquiry gets a file and a register row, including the
   ones you decline.

## 4. Always finish with

- The record written or updated in the Trading folder
- Both backlinks in place
- The next action and its date. Nothing sits with no next date on it
- Two sentences in today's Daily Note

## Where things live

```
Enquiries/ENQ-2026-001.md      one per enquiry
Orders/PO-2026-001.md          one per order
Buyers/  Suppliers/            one per company
Products/                      spec masters
Registers/                     Enquiry · Order · Supplier Scorecard · Price History
Reference/                     glossary, documents, landed cost, payment, company
```

Flowchart of the whole loop: `Notes/Playbooks/Trading Flow.md`
