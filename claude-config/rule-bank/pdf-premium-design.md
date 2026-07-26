---
id: pdf-premium-design
triggers: [pdf, PDF, generate pdf, create pdf, make pdf, reportlab]
severity: hard
applies_to: [all]
created: 2026-04-09
source: correction
---

Every PDF must look like $10K was spent on it. No exceptions. This means:

- Dark full-bleed cover page with white typography. No white cover pages ever.
- Premium typography hierarchy: large bold title, clear subtitle, generous whitespace.
- Accent color used strategically (not everywhere). Green #47A46D for GRR BAOW work.
- Metric callout boxes for key numbers. Never bury stats in body paragraphs.
- Clean tables with header row in accent color, alternating row shading, no clutter.
- Section headers with colored left-border accent lines, not just bold text.
- Pull quotes styled with background tint + left border, not just italic text.
- Professional page footer with page numbers and branding on every page.
- Generous padding everywhere. Tight = cheap. Breathing room = premium.
- Consistent visual language across all pages. No section should look different from another.

**Why:** [USER] explicitly said "anytime you create a PDF it HAS to look like $10k was spent on it."

**How to apply:** Before writing any PDF generation code, sketch the visual hierarchy first. Cover page, section pages, tables, callouts, footer. Every element must earn its space and look intentional.
