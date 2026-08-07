---
name: spec-match
description: Compare a buyer specification against a supplier COA or TDS, parameter by parameter, and produce a gap report. Use when reading any specification, monograph, certificate of analysis, or technical data sheet, and before any quotation, sample request, or purchase order for a raw material.
user-invocable: true
---

# Spec Match

The check that decides whether a material can be sold. Same procedure whether run
by hand or by the `spec-matcher` agent.

## Rule zero

**A limit enters this system from a document, or not at all.**

No number from memory. No "typical" value. No USP or EP limit recalled rather than
read. Without the document, the cell reads `not stated` and the parameter is
unresolved.

## 1. Load

- `Trading/Reference/COA Parameter Glossary.md`
- The product spec master in `Trading/Products/`
- Buyer spec or monograph
- Supplier COA and TDS

Work from the source documents. Do not retype values into a summary and then
compare the summary.

## 2. Normalise before comparing

- **Units**: ppm ↔ %, mg/kg ↔ ppm, µm ↔ mesh
- **Basis**: "on dried basis" is not "as is"
- **Method**: a value without its method is not comparable to anything

## 3. Verdict per row

| Verdict | When |
|---|---|
| `MATCH` | Inside the limit, same basis, method stated and acceptable |
| `FAIL` | Outside the limit |
| `MISSING` | Buyer requires it, supplier COA is silent |
| `CLARIFY` | Looks compatible, but method, basis, or units unconfirmed |

**`MISSING` is never `PASS`.** A parameter the COA does not mention did not pass.

## 4. Check these traps every time

- **PSD**: method (laser vs sieve), dispersion (wet vs dry), and whether the
  numbers are D10/D50/D90 or percent-through-mesh. "100% through 80 mesh" and
  "D90 ≤ 100 µm" are not comparable. That is `CLARIFY`, not `MATCH`
- **LOD**: temperature and duration. And LOD is not Karl Fischer water
- **LOI**: a different test from LOD. Never treat one as the other
- **Assay**: basis and method (titration vs HPLC vs AAS)
- **Heavy metals**: individual elemental impurities (Pb, As, Cd, Hg) are not the
  same as a single combined "heavy metals" limit
- **Residual solvents**: a COA listing none may mean none tested
- **Micro**: TAMC, TYMC, specified organisms are separate rows
- **Bulk / tapped density**: usually omitted, often critical to the buyer
- **Liposomal Vitamin C**: also: ascorbic acid assay, free vs encapsulated,
  encapsulation efficiency and its method, phospholipid source (sunflower or soy),
  carrier, excipient declaration

## 5. Output

Table of parameter · buyer limit · supplier value · verdict · note. Then:

- **Blocking**: every `FAIL`
- **Ask the vendor**: every `MISSING` and `CLARIFY`, as exact questions.
  Not "clarify PSD" but "state PSD method, dispersion medium, and D10/D50/D90"
- **Verdict**: `CAN SUPPLY` · `CANNOT SUPPLY` · `PENDING VENDOR ANSWER`

Write it into the ENQ file. Update the product spec master with any cell you
sourced, recording the `source:` for each.

## 6. Gate

A quote is authorised only on `CAN SUPPLY` with zero `FAIL` and zero `MISSING`, or
a written buyer acceptance of each deviation saved in the ENQ file.

Never soften a `FAIL` because the price is good.
