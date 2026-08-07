---
type: reference
area: trading
updated: 2026-08-07
---

# COA Parameter Glossary

What each line on a certificate of analysis means, and the trap in it.

Read this before comparing any specification. Most apparent mismatches are unit or
basis differences. Most real mismatches hide behind numbers that look fine.

**No limits in this file.** It explains parameters, it does not state values.
Values come from the buyer's spec or the monograph they cite.
See [[Notes/Business/Trading/Reference/Document Checklist]].

---

## Identity and strength

### Description / Appearance
Colour, form, odour. Sounds trivial, and it is the first thing a buyer's QA checks
on receipt. A white powder arriving off-white gets quarantined before anyone
opens a test method.

### Identification
Confirms the material is what the label says. IR, chemical tests, or flame test
depending on the substance. A COA without an ID test is not a complete COA.

### Assay
How much active is present.

- **Basis matters.** "On dried basis" and "as is" are different numbers for the
  same material. A hygroscopic salt can differ by several percent
- **Method matters.** Titration, HPLC, and AAS do not always agree
- Some specs express assay as the salt, others as the element. Magnesium citrate
  quoted as elemental magnesium is a completely different number from the same
  material quoted as the citrate salt. **Check which one the buyer means**

---

## Physical

### Particle size distribution (PSD)
The parameter that causes the most trouble in this trade, because it looks simple.

- **Method:** laser diffraction and sieve analysis do not give the same answer for
  the same powder. State which
- **Dispersion:** wet or dry, and in what medium. A powder that agglomerates reads
  coarse dry and fine wet
- **Expression:** D10 / D50 / D90 in µm, or percent passing a mesh. These are not
  interchangeable. "100% through 80 mesh" and "D90 ≤ 100 µm" cannot be compared
  without conversion and assumptions

A PSD with no method stated is not a PSD. Verdict `CLARIFY`, never `MATCH`.

Why the buyer cares: PSD drives flow, blend uniformity, compression, dissolution,
and mouthfeel. It is often the reason they are changing supplier at all.

### Bulk density and tapped density
Mass per volume, loose and after tapping. Drives hopper sizing, capsule fill
weight, and tablet press behaviour.

Frequently absent from Chinese COAs and frequently critical to the buyer. If the
buyer specifies it and the COA is silent, that is `MISSING`.

### Sieve analysis / mesh
Percentage passing a stated mesh. Different countries use different mesh
standards, so record the standard alongside the number.

### Flowability
Angle of repose, Carr's index, or Hausner ratio. Matters for high-speed tabletting.

---

## Purity and residuals

### Loss on drying (LOD)
Moisture and volatiles lost under stated conditions.

**Meaningless without temperature and duration.** LOD at 105 °C for 2 hours and
LOD at 70 °C under vacuum are different tests producing different numbers.

### Water content (Karl Fischer)
Water specifically, not total volatiles. **Not interchangeable with LOD.** If the
buyer asks for KF and the COA gives LOD, that is `CLARIFY` at best.

### Loss on ignition (LOI)
Mass lost on strong heating. A different test from LOD. Never treat one as the
other, even though both are reported as a percentage.

### Residual solvents
Solvents left from manufacture. Which ones matter depends on the actual process,
so ask for the manufacturing flow chart, it tells you which solvents to expect
and therefore which absences are suspicious.

**A COA listing no residual solvents may mean none were tested.** Absence of a
result is not a result.

### Heavy metals / elemental impurities
Two different generations of test:

- Older style: a single combined "heavy metals" limit
- Current style: individual elements, typically lead, arsenic, cadmium and
  mercury, by ICP-MS or ICP-OES

If the buyer specifies elemental impurities individually and the supplier gives
the old combined test, that is `CLARIFY`. They are not equivalent, and a buyer's
regulatory affairs team will reject the substitution.

### Related substances / impurities
Named impurities with individual and total limits. Method must be stated.

### Sulphated ash / residue on ignition
Inorganic residue. Check which name the buyer's spec uses; they are closely
related but specified differently in different pharmacopoeias.

### Chloride, sulphate, iron
Common inorganic limit tests on mineral salts.

---

## Microbiology

Separate rows, never one line:

- **TAMC**: total aerobic microbial count
- **TYMC**: total combined yeasts and moulds
- **Specified organisms**: E. coli, Salmonella, S. aureus, P. aeruginosa, as the
  buyer's spec requires

Nutraceutical buyers selling into food channels often have tighter micro limits
than pharma buyers. Do not assume pharma grade automatically satisfies a food
spec.

---

## Liposomal Vitamin C: additional parameters

Treat this as a formulated ingredient, not a salt. Two suppliers both offering
"liposomal vitamin C 30%" can be selling materially different products.

| Parameter | Why it matters |
|---|---|
| Ascorbic acid assay | The actual vitamin C content, and on what basis |
| Free vs encapsulated ascorbate | The whole point of the product. Ask for the split |
| Encapsulation efficiency | And the method used to determine it. Methods vary widely and are not comparable across suppliers |
| Phospholipid source | Sunflower or soy. Soy is an allergen declaration in most markets |
| Phospholipid content | Often the real cost driver |
| Carrier / excipients | Maltodextrin, acacia, starch. Full declaration needed for the buyer's label |
| Particle size | Powder handling |
| Moisture | Stability. This material is hygroscopic |
| Stability / shelf life | With storage conditions stated |
| Non-GMO / allergen status | Nutraceutical buyers ask every time |

Ask specifically **how encapsulation efficiency was measured**. Without the
method, the number cannot be compared between two suppliers.

---

## Documentation lines

- **Batch number**: must trace to the manufacturer's batch, through any repack
- **Manufacturing date / retest date / expiry**: check the retest convention
- **Storage conditions**
- **Packing**: drum, bag, liner type. Liner matters for hygroscopic materials
- **Signature and date**: an unsigned or undated COA is not accepted

---

## Comparison checklist

Before writing any verdict:

- [ ] Units normalised
- [ ] Basis confirmed (dried vs as-is)
- [ ] Method stated on both sides
- [ ] Salt vs elemental basis confirmed
- [ ] Every buyer parameter has a supplier row, or is marked `MISSING`
- [ ] No limit written from memory

Links: [[Notes/Business/Trading/README]] ·
[[Notes/Business/Trading/Reference/Document Checklist]]
