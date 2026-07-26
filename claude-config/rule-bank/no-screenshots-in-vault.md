---
id: no-screenshots-in-vault
triggers: [screenshot, png, image, save, playwright, test, verify, capture, photo]
severity: hard
applies_to: [all]
created: 2026-04-01
source: correction
---
NEVER save screenshots, PNGs, or test images to the vault, Downloads, or the current working directory. All test screenshots go to /tmp/ with a descriptive name. Delete them after testing is complete. If Playwright MCP auto-saves screenshots, clean up the .playwright-mcp/ directory after each test run. The vault is for notes, not images.
