---
id: pdf-lib-edge
triggers: [PDF, edge function, Supabase, pdf-lib, Deno]
severity: hard
applies_to: [supabase, code]
created: 2026-04-01
source: observation
---
pdf-lib works in Deno edge functions. Keep under 2MB. Import from esm.sh. Always use safe() function to strip non-WinAnsi characters.
