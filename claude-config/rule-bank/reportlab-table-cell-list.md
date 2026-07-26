---
id: reportlab-table-cell-list
triggers: [pdf, PDF, reportlab, Table, demo box, dark box, multi-flowable cell]
severity: hard
applies_to: [all]
created: 2026-04-09
source: correction
---

When a ReportLab table cell should contain multiple stacked flowables (e.g. a title Paragraph + body Paragraph), wrap the list with DOUBLE brackets: `Table([[list_of_flowables]])`, NOT `Table([list_of_flowables])`.

Wrong — creates a 2-COLUMN table, splitting flowables across columns:
```python
content = [Paragraph("Title", h_style), Paragraph("Body", b_style)]
t = Table([content], colWidths=[CW])  # BUG: 2 columns, each gets CW/2 width
```

Correct — creates a 1-column table with one cell containing both flowables:
```python
content = [Paragraph("Title", h_style), Paragraph("Body", b_style)]
t = Table([[content]], colWidths=[CW])  # 1 cell, full CW width, stacks flowables
```

**Why:** The Marius PDF demo box showed text split in half because `[content]` was interpreted as a row with N columns, not a 1-cell row.

**How to apply:** Any time building a styled box (dark box, pull quote, CTA block) that contains more than one flowable in a single cell, always double-wrap: `[[list]]`.
