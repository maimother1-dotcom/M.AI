---
name: pdf-generation
description: Generate professional branded PDF reports using Supabase Edge Functions + pdf-lib. Triggers when building PDF deliverables for any client. Contains the exact architecture, styling system, and page-break logic that produces production-quality output.
user-invocable: false
---

# PDF Generation Skill

## Architecture

**Stack:** Supabase Edge Functions (Deno) + `npm:pdf-lib@1.17.1`
**How it works:** n8n (or any caller) POSTs JSON data to the edge function. The function builds the PDF programmatically using pdf-lib and returns the binary.
**Deploy:** `deploy_edge_function` via Supabase MCP (project `YOUR_SUPABASE_PROJECT_ID`)
**JWT:** `verify_jwt: false` (edge functions called from n8n, not from authenticated users)

## Core Pattern

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

Deno.serve(async (req: Request) => {
  const data = await req.json();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  // ... build pages ...
  return new Response(await doc.save(), {
    headers: { 'Content-Type': 'application/pdf' }
  });
});
```

## Page Layout Constants

```
PAGE_W = 595.28 (A4)
PAGE_H = 841.89
MARGIN = 54 (left and right)
CONTENT_WIDTH = PAGE_W - 2 * MARGIN = 487.28
FOOTER_Y = 70 (content must stay above this)
```

## The Drawing Context Pattern

Every PDF uses a `DrawCtx` object that tracks position and handles page breaks:

```typescript
interface DrawCtx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;        // current vertical position, decrements as content is added
  font: PDFFont;
  fontBold: PDFFont;
  fontOblique: PDFFont;
}
```

Key functions:
- `ensureSpace(ctx, needed)` — if `ctx.y - needed < FOOTER_Y`, add new page
- `drawText(ctx, text, opts)` — wraps text, checks if full block fits before drawing
- `wrap(text, maxW, sz, font)` — word-wraps text to fit within maxW
- `textHeight(text, maxW, sz, font, lineH)` — pre-calculates block height
- `centerText(page, text, bx, bw, y, sz, font, color)` — centers text within a box

## Page Break Rules (CRITICAL)

These rules prevent text from being cut off between pages:

1. **Pre-calculate block heights** before drawing. Use `textHeight()` to measure paragraphs.
2. **Keep related content together.** Title + body text should `ensureSpace` for both combined.
3. **Quote blocks:** Calculate full quote height (text lines + attribution) and `ensureSpace` for the entire block.
4. **Prevent orphaned quotes:** When drawing the second-to-last quote, check if both remaining quotes fit. If not, move both to a new page.
5. **Theme blocks:** If entire theme (header + analysis + all quotes) fits on one page, force it as a unit. If too tall, at minimum keep header + analysis together.
6. **Cap ensureSpace** at ~200-250px to avoid infinite page creation for very long blocks.

```typescript
// Example: keep title + description together
const titleH = textHeight(title, CW - 34, 10.5, fontBold);
const descH = textHeight(desc, CW - 34, 9, font, 14.5);
ctx = ensureSpace(ctx, Math.min(titleH + descH + 36, 250));
```

## Text Safety

pdf-lib only supports WinAnsi characters. Always run text through `safe()`:

```typescript
function safe(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')           // strip HTML
    .replace(/&amp;/g, '&')            // decode entities
    .replace(/[\u2018\u2019]/g, "'")   // smart quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, ' - ')         // em dash
    .replace(/[^\x00-\xFF]/g, '')      // strip non-WinAnsi
    .trim();
}
```

## Visual Components Library

### Title/Header Band
Navy rectangle across full width at page top, red accent stripe below, gold brand name, white title text.

### KPI Metric Cards
Three equal-width cards with:
- Light gray background
- Color-coded top bar (green >= 80%, yellow >= 60%, red < 60%)
- Centered label, large centered percentage, change text, season avg (italic)
- Use `centerText()` for all text within cards

### Trend Line Chart
Plot data points with `drawCircle` and connect with `drawLine`. Grid lines at 25% intervals. Current game dot is larger (4px) in navy; historical dots are smaller (2.5px) in red. Label every Nth point to avoid overcrowding.

### Horizontal Rating Bars
Category name (left) | Score/5 (middle, color-coded) | Fill bar (right) | YTD tag (far right).
Colors: green >= 4.5, yellow >= 4.0, red < 4.0. Bar background in light gray, fill in score color.

### Sentiment Bar
Stacked horizontal bar (green/gray/red). Minimum width of 12px for any non-zero segment so small percentages are visible. Color legend with squares below.

### Keyword Pills
Sized by importance: top 3 bold/10pt, next 3 normal/9pt, rest 8pt. Light gray background rectangles. Wrap to next row if exceeding page width.

### Quote Blocks
Light background rectangle with 2.5px red accent bar on left. Italic text. Attribution below in gray italic. Pre-calculate full height to prevent page-break splits.

### Numbered Badges
24x22px colored rectangle (red for themes, navy for opportunities) with white number centered inside.

### Type Badges
Small colored rectangles (green for "Quick Win", amber for "Long-Term") with white bold text inside.

### Section Bands
Full-width colored rectangles (18px height) with white bold text for recommendation categories (red = urgent, amber = medium, green = positive).

### Conclusion Box
Full-width navy rectangle with red accent bar on top, gold section label, light-colored body text.

### Footer
Red line at y=44, gray text with system name + page numbers. Consistent across all pages.

---

## Deployment Checklist

1. Write the edge function code
2. Deploy via Supabase MCP: `deploy_edge_function(project_id, name, entrypoint_path, verify_jwt: false, files)`
3. Test with `curl -X POST` and real payload data
4. Verify PDF visually using the Read tool (it renders PDFs)
5. Check: no text cutoffs at page breaks, all content present, branding correct
6. If called from n8n: wire an HTTP Request node with `responseFormat: "file"` to get binary output

## Common Mistakes to Avoid

- **Forgetting `safe()`**: Crashes on smart quotes, emojis, or HTML entities
- **Not pre-calculating heights**: Text splits across pages
- **Using `ensureSpace` per-line instead of per-block**: Related content separates
- **Hardcoding y-positions**: Breaks when content length varies. Always use the DrawCtx.y cursor.
- **Missing CORS headers**: Edge function returns 403 from n8n without `Access-Control-Allow-Origin: *`
- **Large payloads**: Keep edge function under 2MB. If data is huge, trim arrays before sending.
