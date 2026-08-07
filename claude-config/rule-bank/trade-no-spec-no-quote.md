---
id: trade-no-spec-no-quote
triggers: [quote, quotation, offer price, enquiry, rfq, buyer, formulator, coa, spec sheet, gap report, can supply]
severity: hard
applies_to: [all]
created: 2026-08-07
source: trading-desk
---
No price leaves the trading business before a spec-match gap report exists for that enquiry.

The gate: verdict `CAN SUPPLY`, with zero `FAIL` rows and zero `MISSING` rows. The only alternative is a written buyer acceptance of each deviation, saved into the ENQ file.

`MISSING` is never `PASS`. A parameter the supplier COA does not state has not passed, it is unanswered. Treating silence as compliance is the most common way a trader ships a rejectable batch.

Never soften a `FAIL` because the price is good, the buyer is urgent, or the supplier says it is standard material.
