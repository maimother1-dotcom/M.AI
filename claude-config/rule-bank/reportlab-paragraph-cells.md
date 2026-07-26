---
id: reportlab-paragraph-cells
triggers: [pdf, PDF, reportlab, Table, TableStyle, FONTSIZE, table cells]
severity: hard
applies_to: [all]
created: 2026-04-09
source: correction
---

NEVER use plain strings in ReportLab table cells when you need a specific font size or when cell text is longer than ~30 characters. TableStyle FONTSIZE does NOT apply to plain strings — they always render at the default 10pt, causing text to overflow cell boundaries and bleed into adjacent columns.

Rule: if a table cell needs fontsize control OR contains wrapping text, the cell value MUST be a Paragraph object with an explicit ParagraphStyle.

Pattern that breaks:
```python
rows = [["Long text that will overflow at 10pt default"]]
t = Table(rows)
t.setStyle(TableStyle([("FONTSIZE", (0,0),(-1,-1), 8)]))  # IGNORED for plain strings
```

Pattern that works:
```python
S = ParagraphStyle("s", fontName="Helvetica", fontSize=8, leading=12)
rows = [[Paragraph("Long text that wraps correctly at 8pt", S)]]
t = Table(rows)
```

**Why:** Every broken table in the Marius PDF was caused by plain strings ignoring FONTSIZE. Text rendered at 10pt instead of 8pt and bled across cell boundaries.

**How to apply:** Before writing any Table with body text, ask: are all cells Paragraph objects? If not, make them Paragraphs. Header row with short labels can stay as strings if the column is wide enough. Body rows with >30 chars must be Paragraphs.
