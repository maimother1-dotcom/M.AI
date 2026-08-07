---
type: playbook
area: trading
updated: 2026-08-07
---

# Trading Flow

How an enquiry becomes money. One loop, eight desks, three gates.

Desk detail: [[Notes/Business/Trading/README]]

---

## The flow

```mermaid
flowchart TD
    A[Lead or inbound message] --> B[enquiry-desk<br/>open ENQ record]
    B --> C{Spec sheet<br/>received?}
    C -- no --> C1[Draft request for spec<br/>hold at awaiting-spec] --> C
    C -- yes --> D[spec-matcher<br/>read and normalise buyer spec]

    D --> E[vendor-desk<br/>RFQ to manufacturers<br/>identity stripped]
    E --> F[Supplier COA, TDS,<br/>documents, price]
    F --> G[spec-matcher<br/>GAP REPORT]

    G --> H{Verdict}
    H -- CANNOT SUPPLY --> H1[Decline<br/>log in demand tally] --> Z2
    H -- PENDING --> E
    H -- CAN SUPPLY --> I[sales-desk<br/>landed cost build-up]

    I --> J[Quotation<br/>incoterm + validity]
    J --> K{Buyer<br/>response}
    K -- silent --> K1[Follow-up<br/>3 days] --> K
    K -- no --> Z2
    K -- yes --> L[vendor-desk<br/>sample]

    L --> M{Sample<br/>approved?}
    M -- no --> E
    M -- yes --> N[order-desk<br/>buyer PO vs supplier PI]

    N --> O[Advance payment<br/>bank details voice-verified]
    O --> P[Production]
    P --> Q[Batch COA<br/>BEFORE shipment]
    Q --> R{Batch matches<br/>sold spec?}
    R -- no --> P
    R -- yes --> S[Balance payment<br/>against BL + COA]

    S --> T{Fulfilment<br/>mode}
    T --> T1[Direct ship<br/>neutralised docs]
    T --> T2[White label]
    T --> T3[Repack<br/>batch link preserved]

    T1 --> U[Documents cross-checked]
    T2 --> U
    T3 --> U
    U --> V[Delivery + COA handover]
    V --> W[billing-desk<br/>invoice, chase, reconcile]
    W --> X[support-desk]
    X --> Y{Complaint?}
    Y -- yes --> Y1[Reconcile methods<br/>CAPA, settle<br/>update scorecard + spec master] --> X
    Y -- no --> Z1[Reorder watch]
    Z1 --> A

    Z2[Closed - lost or declined<br/>record WHY] --> A

    style G fill:#b45309,color:#fff
    style H fill:#b45309,color:#fff
    style R fill:#b45309,color:#fff
    style M fill:#b45309,color:#fff
```

---

## The three gates

Everything else is admin. These three are where money is won or lost.

**1. Spec match: `CAN SUPPLY` or nothing.** No price leaves the business before a
gap report with zero `FAIL` and zero `MISSING`, or a written buyer acceptance of
each deviation. `MISSING` is never `PASS`.

**2. Sample approved.** First order with any supplier, first order to any buyer.
No exception for a good price or an urgent buyer.

**3. Batch COA before shipment.** Matched against the spec recorded in the order
file. A failing batch is a problem in the factory and a disaster on the water.

---

## Money timeline

Where the exposure sits, and why the finance cost line exists in every quote.

```mermaid
gantt
    title Cash position on a typical order
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    section Out
    Supplier advance 30%      :milestone, 2026-01-01, 0d
    Supplier balance 70%      :milestone, 2026-02-05, 0d
    section Goods
    Production                :2026-01-01, 25d
    Transit                   :2026-02-05, 28d
    section In
    Buyer payment             :milestone, 2026-03-20, 0d
    section Exposure
    Your money is out         :crit, 2026-01-01, 78d
```

Roughly eleven weeks of exposure on a normal order. That is the number the finance
cost line prices, and it is why first orders stay small enough that a total loss
is survivable.

---

## Daily rhythm

| When | Do |
|---|---|
| Morning | New enquiries answered or acknowledged. Nothing sits a full day unanswered |
| Midday | Open orders - anything due today: payment, production date, shipment |
| Evening | Register updated, next actions dated, Daily Note written |
| Monday | Pipeline review. Quotes silent 3+ days get a one-line follow-up |
| Friday | Supplier scorecard, price history, certificate expiry check |

---

## Automation: scheduled tasks

Create with `mcp__scheduled-tasks__create_scheduled_task`. Cron runs in UTC, so
IST times are converted by subtracting 5:30, per the `scheduled-tasks-syntax` rule.

| Task | IST | Cron (UTC) | Does |
|---|---|---|---|
| `trade-enquiry-sweep` | 09:00 daily | `30 3 * * *` | Scan Gmail for new enquiries, open ENQ records, list what needs a reply today |
| `trade-order-check` | 18:30 daily | `0 13 * * *` | Open orders: payment milestones, production dates, shipments due, ETAs to pass on |
| `trade-pipeline-review` | Mon 10:00 | `30 4 * * 1` | Quotes silent 3+ working days, draft one-line follow-ups |
| `trade-vendor-refresh` | Fri 17:00 | `30 11 * * 5` | Supplier scorecard, price history, certificate expiry watch |

Every prompt must be self-contained. A scheduled task runs with no conversation
history. State the vault paths and the desk to use.

**All output is drafts and lists.** Nothing sends, nothing is ordered, nothing is
paid without you.

Set them up when there is real traffic. A sweep over an empty inbox is noise, and
noise you learn to ignore is worse than no alert.

---

## Later, deliberately not now

- **n8n** for always-on inbox watching and webhook-driven enquiry capture, so
  enquiries land without a Claude session open
- A supplier portal for document collection
- Automated freight rate lookups
- A live pipeline dashboard

Each is a real upgrade. Each is worth nothing until the loop above has run for
real, once, end to end.

Links: [[Notes/Business/Trading/README]] · [[Vault Index]] · [[CLAUDE.md]]
