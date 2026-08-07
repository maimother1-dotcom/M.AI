---
type: reference
area: trading
updated: 2026-08-07
---

# Incoterms and Landed Cost

A price without an incoterm is not a price.

---

## The incoterms you will actually use

| Term | Seller pays to | You take over at | Typical use |
|---|---|---|---|
| **EXW** | Factory gate | The factory. You arrange everything | Rarely worth it from China |
| **FOB** | Loaded on the vessel at origin port | The vessel | The normal buying term from China |
| **CFR** | Destination port, freight paid | Destination port. **You carry the insurance** | Common |
| **CIF** | Destination port, freight and insurance paid | Destination port | Common buying and selling term |
| **DAP** | Delivered to the buyer's place | On arrival, duty unpaid | Selling term |
| **DDP** | Delivered, duty paid | Nothing. You carry everything | Highest price, highest risk |

Two traps:

- **CFR carries no insurance.** Uninsured cargo on the water is an unhedged bet on
  your whole margin.
- **DDP means you clear customs in a country where you may have no entity.** Quote
  DDP only where you have confirmed you can actually clear.

---

## The landed cost build-up

Build it line by line. Never take FOB and add a percentage.

```
  Ex-works or FOB price            per kg × quantity
+ Inland freight in China          if buying ex-works
+ Export clearance                 if buying ex-works
+ Sea or air freight
+ Insurance
+ Duty and cess at destination     on the correct HS code
+ Customs clearing and port charges
+ Inland transport to the buyer
+ Repack / white label / print     only in that fulfilment mode
+ Testing at destination           if you retest before delivery
+ Bank and remittance charges
+ Finance cost                     real days your money is tied up
+ FX buffer
+ Wastage and rejection allowance
= LANDED COST
+ Margin
= SELLING PRICE
```

### The two lines that quietly eat solo traders

**Finance cost.** Pay the supplier 30% on order and 70% against the bill of
lading, get paid by your buyer 30 days after delivery, and your money is out for
considerably longer than the shipping time. Count the actual days at your actual
cost of funds and put the number in the quote.

**FX.** You buy in USD. If you sell in another currency and it moves 3% against
you between quote and payment, a 3% margin is gone. Either quote in your buying
currency, keep the validity window short, or carry a buffer.

### Getting the numbers right

- **HS code**: get it confirmed before quoting DDP or DAP. A wrong code means a
  wrong duty, and the difference comes out of your margin
- **Freight**: quote it for the shipment you are actually making. LCL, FCL and
  air behave completely differently per kg, and LCL has port charges that surprise
  people
- **Minimums**: many charges have a minimum. A small first order can carry
  disproportionate cost. Price it honestly rather than absorbing it to look
  competitive

---

## After every order

Put quoted against actual, line by line, in the order file. Freight, duty,
clearing and finance days are where the gaps appear. Feed the real numbers back
into this file so the next quote is built on what things actually cost you.

| Line | Quoted | Actual | Gap | Why |
|---|---|---|---|---|

An order that made less than quoted is normal. An order whose gap nobody looked at
is how a trader stays wrong for a year.

---

## Standing rules

- Every price carries its incoterm and a validity date
- Never quote a lead time the supplier has not confirmed in writing
- Never discount below your floor to win a first order. The first price sets the
  expectation for every order after it

Links: [[Notes/Business/Trading/README]] ·
[[Notes/Business/Trading/Reference/Payment and Risk]]
