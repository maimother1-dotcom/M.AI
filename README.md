# M.AI — Claude Code OS

Personal operating system for Claude Code, configured for **Bijoy Halder**.

An Obsidian vault that acts as long-term memory, plus a hook and rule layer that makes Claude read that memory, follow a fixed set of standards, and update itself on every message.

---

## goldbot — XAU/USD trading system

An autonomous gold trading bot lives in [`goldbot/`](goldbot/README.md): seventeen
strategies vote on every closed bar, an ensemble weighs them by market regime and
by their own realised performance, and a risk manager sizes and manages the trade
from entry to exit without further input.

```bash
pip install -r requirements.txt
python -m goldbot doctor          # validate config, risk budget and data
python -m goldbot backtest        # historical simulation
python -m goldbot paper --replay  # the live engine, driven from history
python -m goldbot live            # trade a real account (two safety switches)
```

Full documentation, including the strategy list, the risk model and the
go-live checklist: **[goldbot/README.md](goldbot/README.md)**.

---

## Install

On the machine you actually work on:

```bash
git clone https://github.com/maimother1-dotcom/M.AI.git
cd M.AI
./install.sh
```

Then **quit Claude Code completely and reopen it**. The hooks and MCP servers do not load until you restart.

```
./install.sh --dry-run       # show what would happen, change nothing
./install.sh --skip-ollama   # skip semantic vault search
./install.sh --skip-gmail    # skip the Gmail MCP server
```

Safe to re-run. An existing vault is never overwritten — your notes are left alone, and any file the installer replaces is backed up with a `.bak-<timestamp>` suffix.

---

## What gets installed

| Path | What it is |
|---|---|
| `~/Documents/My Vault` | Obsidian vault. Notes, tasks, daily journal, playbooks. |
| `~/.claude/hooks/` | 14 hooks firing on session start, prompt submit, tool use, stop, and compact. |
| `~/.claude/rule-bank/` | 117 rules. The rule engine injects the relevant ones per prompt. |
| `~/.claude/skills/` | 5 skills: voice model, self-learn, client delivery, outreach reply, PDF generation. |
| `~/.claude/vault-vector/` | Semantic vault search over Ollama + ChromaDB, exposed as an MCP server. |
| `~/.claude/gmail-mcp/` | Gmail MCP server. Needs OAuth before it works. |
| `~/.claude/credentials/` | API keys. `chmod 700`, contents `600`, never committed. |

---

## Repo layout

```
install.sh                  one-command installer, macOS and Linux
vault/                      the Obsidian vault, personalized
  CLAUDE.md                 behavior blueprint, read every session
  Tasks.md                  single source of truth for work
  Notes/Claude Memory/      what Claude has learned and keeps
  Notes/Playbooks/          repeatable workflows
claude-config/              everything that lands in ~/.claude
```

---

## Daily morning ritual

Three LinkedIn posts a day, each with an image, each researched from real news that day:

| Topic | Sent to |
|---|---|
| Indian finance | mishtisaka417@gmail.com |
| International finance | mishtisaka417@gmail.com |
| Indian pharma | bijoy10987@gmail.com |

Drafts only. Nothing sends without approval. Full procedure in `vault/Notes/Playbooks/Morning Content Ritual.md`.

---

## Security posture

Encoded in `vault/CLAUDE.md` and enforced on every build:

- Every revenue-protecting check is validated **server-side**. Client-side checks are UX only, never the gate.
- **Two-factor required** on any account or admin surface. No shared logins, no bypass.
- **TLS everywhere.** No plain HTTP, no disabled certificate verification.
- **Secrets never in git.** `.gitignore` covers `*.env` and OAuth JSON. Templates only are tracked.
- Source code is assumed public. Obfuscation is not security.

---

## Notifications

ntfy topic: **`BijoyClaude`**

Install the [ntfy app](https://ntfy.sh) and subscribe. Note that ntfy.sh topics are public to anyone who knows the name, so nothing sensitive should ever go through it.

---

## After install

1. Restart Claude Code. Nothing works until you do.
2. Open the vault in Obsidian: `~/Documents/My Vault`
3. Subscribe to `BijoyClaude` in the ntfy app.
4. Add your Anthropic key:
   ```bash
   echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.claude/credentials/anthropic.env
   chmod 600 ~/.claude/credentials/anthropic.env
   ```
5. For Gmail, drop `credentials.json` from Google Cloud Console into
   `~/.claude/credentials/gmail_credentials.json`.
