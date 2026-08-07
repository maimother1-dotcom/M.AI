---
id: trade-never-invent-spec-limits
triggers: [spec, specification, coa, monograph, usp, ep monograph, pharmacopoeia, pharmacopeia, assay, psd, particle size, loss on drying, heavy metals, residual solvent, limit]
severity: hard
applies_to: [all]
created: 2026-08-07
source: trading-desk
---
A specification limit enters the trading system from a document, or not at all.

Never write a pharmacopoeial or specification value recalled from memory. Never write a "typical" or "usual" limit. Never fill a USP, EP, BP, IP, JP, or FCC number that was not read from a document in front of you.

If the document is not available, the cell reads `not stated` and the parameter is unresolved. Every filled limit records a `source:` naming the document it came from. A value with no source is a bug: blank it.

Reason: a half-remembered limit written into a spec master gets quoted to a customer months later as though it were sourced. That is how a trader commits to a specification the material cannot meet.
