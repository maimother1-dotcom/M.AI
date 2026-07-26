---
id: markdown-first
triggers: [pdf, docx, xlsx, document, doc, read this file, convert, attachment]
severity: hard
applies_to: [all]
created: 2026-04-21
source: system-design
---
Before reading any PDF, DOCX, or XLSX into context, convert it to markdown first. Never pass raw binary document content to Claude — it's massively wasteful.

Token savings: HTML → 90% fewer tokens | PDF → 65-70% fewer tokens | DOCX → 33% fewer tokens. A 40-page PDF at raw takes ~40K tokens. As markdown: ~14K tokens.

Conversion command:
```bash
pandoc "$INPUT" -o /tmp/converted.md 2>/dev/null
```

If pandoc fails, try: `python3 -m docling "$INPUT" --output /tmp/`

EXCEPTION: If OCR is needed (scanned PDFs, images with embedded text), skip conversion and use vision-capable API directly. This rule applies to text-based documents only.

After converting, read the markdown file — not the original. Discard the original after reading.
