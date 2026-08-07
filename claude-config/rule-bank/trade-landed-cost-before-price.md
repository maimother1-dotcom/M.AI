---
id: trade-landed-cost-before-price
triggers: [landed cost, fob, cif, cfr, ddp, incoterm, freight, margin, selling price, quotation, duty, customs]
severity: hard
applies_to: [all]
created: 2026-08-07
source: trading-desk
---
Build every selling price from a line-by-line landed cost. Never take the supplier FOB price and add a percentage.

Lines: ex-works or FOB, inland freight in origin country, export clearance, sea or air freight, insurance, duty and cess on the correct HS code, clearing and port charges, inland transport, repack or label cost, destination testing, bank charges, finance cost for the real number of days your money is tied up, FX buffer, wastage allowance. Then margin.

The two lines solo traders forget and then absorb: finance cost when you pay the supplier before the buyer pays you, and FX movement when you buy in USD and sell in another currency. A 3% currency move erases a 3% margin.

Every price carries its incoterm and a validity date. A number without an incoterm means nothing.
