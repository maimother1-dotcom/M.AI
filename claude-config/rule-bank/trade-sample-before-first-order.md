---
id: trade-sample-before-first-order
triggers: [sample, first order, new supplier, new buyer, trial order, pre-shipment, batch coa, inspection]
severity: hard
applies_to: [all]
created: 2026-08-07
source: trading-desk
---
The first order with any new supplier, and the first order to any new buyer, goes through an approved sample. No exception for a good price, an urgent buyer, or a supplier who calls the material standard.

The sample COA passes through the same spec-match procedure as a production COA. A sample that arrives without a COA is not a sample, it is a powder.

On every order after that: obtain the batch COA before shipment, not with the goods, and match it against the spec recorded in the order file. A failing batch is a problem while it is still in the factory and a disaster once it is on the water.

Track sample state explicitly: requested, dispatched, tracking number, received, sent to buyer, buyer verdict.
