---
id: reportlab-column-widths
triggers: [pdf, PDF, reportlab, Table, colWidths, column width]
severity: hard
applies_to: [all]
created: 2026-04-09
source: correction
---

ReportLab table column widths MUST sum exactly to CW (content width = page_width - left_margin - right_margin). If they sum to less than CW, the table is narrower than the content area, wasting space and making the layout look cheap. If they sum to more, content clips past the right margin.

Before finalizing any Table, verify: sum(colWidths) == CW.

Standard page: W=210mm, ML=MR=18mm, CW=174mm.
For a 4-column table: widths like [28, 58, 66, 22] = 174mm. Right.
Wrong: [28, 52, 54, 22] = 156mm. 18mm of wasted space on the right.

**Why:** The Marius network table had columns summing to 156mm instead of 174mm, leaving a gap and making the "Best Automation Angle" column too narrow to wrap properly.

**How to apply:** After defining any colWidths list, add an assertion or comment: `# sum = {X}mm = CW`. If it doesn't match, redistribute the extra to the widest content column.
