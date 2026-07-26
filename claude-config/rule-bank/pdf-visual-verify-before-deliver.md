---
id: pdf-visual-verify-before-deliver
triggers: [pdf, PDF, reportlab, generate pdf, create pdf]
severity: hard
applies_to: [all]
created: 2026-04-09
source: correction
---

Before delivering ANY PDF, take a screenshot of every page and verify visually that:
1. No content from page N bleeds onto page N+1
2. No overlapping text or elements
3. White background on inner pages (not dark/transparent)
4. All tables fit within margins, no clipping
5. Metric cards show clean text with no box artifacts from newlines

Use the web-tester agent (Playwright) to open the PDF in the browser and screenshot each page, OR use `pdftoppm` / `pdf2image` to render pages to PNG and inspect them before reporting done.

"It built without errors" is NOT verification. Open the file, look at it page by page.

**Why:** Bijoy has received multiple broken PDFs where cover page content overlaid on inner pages, metric card labels showed box characters, and backgrounds were wrong. Repeated himself multiple times.

**How to apply:** After every `doc.build()` or `c.save()`, render the PDF to images and check each page before calling done.
