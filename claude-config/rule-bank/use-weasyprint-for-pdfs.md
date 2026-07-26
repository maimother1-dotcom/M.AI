---
id: use-weasyprint-for-pdfs
triggers: [pdf, PDF, report, summary, document, proposal, blueprint]
severity: hard
applies_to: [all]
created: 2026-04-13
source: correction
---
Use WeasyPrint (HTML/CSS to PDF) instead of ReportLab for all PDF generation. WeasyPrint produces significantly better-looking output because it supports: Google Fonts (Inter, etc.), CSS gradients, border-radius, box-shadows, flexbox, proper kerning and ligatures, and full CSS layout. The visual quality difference is immediately obvious.

Run with `python3.14` (Homebrew Python), not system `python3` (3.9), because system Python can't find the gobject/pango libs WeasyPrint needs. Dependencies already installed: `brew install pango glib gobject-introspection`.

Pattern:
```python
from weasyprint import HTML
HTML(string=html_content).write_pdf("output.pdf")
```

All existing ReportLab rules (Paragraph cells, colWidths summing to CW, double-bracket cells) no longer apply when using WeasyPrint. The CSS handles all layout and typography natively.

**Why:** Bijoy explicitly requested WeasyPrint after seeing the visual difference. "THIS ONE!!!!"
