# First-Time Setup

You are Claude Code. This is a first-time setup for a new user. They have done exactly two things: installed Obsidian and installed Claude Code. Nothing else.

You will handle every technical step. Ask questions first. Do everything in one automated run. Do not skip steps or ask permission — just do it.

---

## PHASE 1 — Learn who I am

Ask in groups. One group at a time. Wait for answers before moving to the next group. Be conversational, not clinical.

**Group 1 — Personal:**
- What's your full name?
- How old are you?
- Where are you based?
- What's the one thing you most want to achieve in the next 12 months?

*(Wait for answers. Then Group 2.)*

**Group 2 — Work:**
- What do you do for work or business?
- Who do you work with or serve?
- What apps and tools do you use every day?
- Describe your business or project in 2-3 sentences.

*(Wait for answers. Then Group 3.)*

**Group 3 — How you want to operate:**
- Morning person or night owl?
- How do you want me to communicate? (short and direct, detailed, casual, formal, etc.)
- List 3-5 things you want me to ALWAYS do
- List 3-5 things you want me to NEVER do
- Do you have any daily rituals? (journaling, exercise, review time, etc.)

---

## PHASE 2 — Install and configure everything

After they answer, do ALL of this automatically. No permission needed. Report progress as you go.

### Step 1 — Find the setup package

```bash
SETUP_DIR=$(find "$HOME/Downloads" -name "claude-code-system-public" -type d 2>/dev/null | head -1)
[ -z "$SETUP_DIR" ] && SETUP_DIR="$HOME/Downloads/claude-code-system-public"
echo "Setup dir: $SETUP_DIR"
```

### Step 2 — Move the vault to a permanent location

```bash
VAULT_DEST="$HOME/Documents/My Vault"
mkdir -p "$HOME/Documents"
cp -r "$SETUP_DIR/vault/" "$VAULT_DEST"
echo "Vault installed at: $VAULT_DEST"
```

### Step 3 — Install Claude config

```bash
mkdir -p ~/.claude/{hooks,skills,rule-bank,session-locks,dashboard}
cp -r "$SETUP_DIR/claude-config/hooks/." ~/.claude/hooks/
cp -r "$SETUP_DIR/claude-config/skills/." ~/.claude/skills/
cp -r "$SETUP_DIR/claude-config/rule-bank/." ~/.claude/rule-bank/
cp "$SETUP_DIR/claude-config/settings.json" ~/.claude/settings.json
chmod +x ~/.claude/hooks/*.sh ~/.claude/hooks/*.py 2>/dev/null || true
echo "Claude config installed"
```

### Step 4 — Fix paths in settings.json

```bash
MY_USERNAME=$(whoami)
sed -i '' "s/YOUR_USERNAME/$MY_USERNAME/g" ~/.claude/settings.json
echo "Paths set for user: $MY_USERNAME"
```

### Step 5 — Install system dependencies

```bash
# Homebrew
if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# jq (used by hooks)
command -v jq &>/dev/null || brew install jq
echo "jq: ready"

# Python3
command -v python3 &>/dev/null || brew install python3
echo "Python3: ready"

# Ollama (for semantic vault search)
if ! command -v ollama &>/dev/null; then
    brew install --cask ollama
    open -a Ollama
    sleep 8
fi
echo "Ollama: ready"

# Pull embedding model for semantic search
ollama pull nomic-embed-text
echo "Embedding model: ready"
```

### Step 6 — Set up vault semantic search (ChromaDB + Ollama)

```bash
FIRST_NAME="[their first name]"
VAULT_PATH="$HOME/Documents/My Vault"

# Copy vault-vector files
cp -r "$SETUP_DIR/claude-config/vault-vector" ~/.claude/vault-vector

# Run setup (creates venv, installs deps, starts embedder, registers launchd, registers MCP)
VAULT_PATH="$VAULT_PATH" bash ~/.claude/vault-vector/setup.sh "$VAULT_PATH" "$FIRST_NAME"
```

### Step 7 — Set up Gmail MCP (optional but recommended)

```bash
# Copy gmail-mcp server
cp -r "$SETUP_DIR/claude-config/gmail-mcp" ~/.claude/gmail-mcp

# Install Gmail dependencies into a venv
PY=$( (command -v python3.14 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3) 2>/dev/null | head -1)
"$PY" -m venv ~/.claude/gmail-mcp/venv
~/.claude/gmail-mcp/venv/bin/pip install --quiet --upgrade pip
~/.claude/gmail-mcp/venv/bin/pip install --quiet fastmcp google-api-python-client google-auth-httplib2 google-auth-oauthlib

# Register Gmail MCP in Claude Code settings
python3 << PYEOF
import json, os
settings_path = os.path.expanduser("~/.claude/settings.json")
venv_python   = os.path.expanduser("~/.claude/gmail-mcp/venv/bin/python")
server_script = os.path.expanduser("~/.claude/gmail-mcp/server.py")

with open(settings_path) as f:
    settings = json.load(f)
settings.setdefault("mcpServers", {})
settings["mcpServers"]["gmail"] = {
    "command": venv_python,
    "args": [server_script]
}
with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
print("Gmail MCP registered")
PYEOF

echo "Gmail MCP installed."
echo "To activate: get credentials.json from Google Cloud Console → save to ~/.claude/credentials/gmail_credentials.json"
```

### Step 8 — Set up credentials folder

```bash
cp -r "$SETUP_DIR/claude-config/credentials" ~/.claude/credentials
echo "Credentials folder ready at ~/.claude/credentials"
echo "Add your API keys there as .env files: servicename.env"
```

Then ask them (one message, all at once):
> "A few optional things that make the system more powerful — drop these in if you have them:
> 1. **Anthropic API key** (for Claude API access): paste it and I'll save it
> 2. **Gmail credentials**: if you want Claude to read/send email, follow the guide in ~/.claude/credentials/README.md
> 3. **Any other API keys** you use regularly (e.g. OpenAI, Airtable, Notion, Slack): tell me the service name and key
>
> You can skip any of these and add them later. The core system works without them."

For any API key they provide:
```bash
echo "SERVICE_API_KEY=their_key_here" > ~/.claude/credentials/servicename.env
```

For Anthropic API key specifically:
```bash
echo "ANTHROPIC_API_KEY=their_key" > ~/.claude/credentials/anthropic.env
```

### Step 9 — Open the vault in Obsidian

```bash
open -a Obsidian "$HOME/Documents/My Vault"
```

### Step 10 — Personalize CLAUDE.md

Using their answers from Phase 1, rewrite `~/Documents/My Vault/CLAUDE.md`:
- Replace `[YOUR_NAME]` with full name
- Replace `[YOUR_AGE]` with age
- Replace `[YOUR_LOCATION]` with city, country
- Replace `[YOUR_BUSINESS_OR_ROLE]` with what they do
- Replace `[YOUR_PRIMARY_GOAL]` with their stated goal
- Replace `[YOUR_TOOLS]` with their daily tools
- Update the communication preferences section with their stated preferences
- Add their ALWAYS and NEVER lists to the appropriate sections
- Replace `[YOUR_NTFY_TOPIC]` with `[FirstName]Claude` (e.g. "AlexClaude")

### Step 11 — Personalize the memory system

Write their real profile to `~/Documents/My Vault/Notes/Claude Memory/MEMORY.md`:
- Name, role, goals
- Tools they use
- Communication style preferences
- Working schedule (if stated)
- Any other useful context from Phase 1

### Step 12 — Create today's daily note

```bash
# Get today's date in the correct format (ordinal: "5th April 2026")
python3 -c "
from datetime import datetime
now = datetime.now()
day = now.day
suffix = 'th' if 11 <= day <= 13 else {1:'st', 2:'nd', 3:'rd'}.get(day % 10, 'th')
print(f'{day}{suffix} {now.strftime(\"%B %Y\")}')
"
```

Create `~/Documents/My Vault/Daily Notes/[today's date].md`:
```
## [Date]

System setup complete. [Their name] is now using the Claude Code OS.

## Links
```

### Step 13 — Update hooks with first name

```bash
FIRST_NAME="[their first name]"
for hook in ~/.claude/hooks/enforce-claude-md.sh ~/.claude/hooks/correction-capture.sh ~/.claude/hooks/vault-check.sh; do
    sed -i '' "s/\[USER\]/$FIRST_NAME/g" "$hook" 2>/dev/null || true
done
echo "Hooks personalized"
```

### Step 14 — Set up ntfy notifications

```bash
FIRST_NAME="[their first name]"
NTFY_TOPIC="${FIRST_NAME}Claude"

# Update ntfy hook
sed -i '' "s/YOUR_NTFY_TOPIC/$NTFY_TOPIC/g" ~/.claude/hooks/ntfy-notify.sh

# Update CLAUDE.md
sed -i '' "s/\[YOUR_NTFY_TOPIC\]/$NTFY_TOPIC/g" "$HOME/Documents/My Vault/CLAUDE.md"

# Test it
curl -s -H "Title: Setup: DONE" -d "Your Claude Code OS is live. Quit and reopen Claude Code to activate vault search." "ntfy.sh/$NTFY_TOPIC" || true
echo "ntfy topic: $NTFY_TOPIC"
```

### Step 15 — Vault Index

Update `~/Documents/My Vault/Vault Index.md` — replace `[YOUR_NAME]` with their real name.

---

## PHASE 3 — Report and hand off

Tell them:

1. **Vault is at** `~/Documents/My Vault` — it should be open in Obsidian now
2. **One thing to do right now:** Quit Claude Code completely and reopen it. This activates vault search and Gmail MCP.
3. **ntfy:** Install the ntfy app on your phone, subscribe to `[their ntfy topic]` — you'll get notified when I finish long tasks
4. **Playwright testing:** Claude Code has a built-in `web-tester` subagent that runs real browser tests automatically. No setup needed — it fires automatically when you build web features.
5. **Gmail:** If they provided OAuth credentials, it's ready. If not: "Drop credentials.json from Google Cloud Console into `~/.claude/credentials/gmail_credentials.json` when you're ready — I'll walk you through it first time."
6. **Credentials:** Any API keys they provided are saved in `~/.claude/credentials/`. Add more any time.

Then ask: "What's the first thing you want to work on?"

Do NOT ask if setup went well. Just tell them what was done and ask what they want to build.
