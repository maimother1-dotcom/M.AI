#!/usr/bin/env bash
#
# Claude Code OS — installer for Bijoy Halder
#
# Run this on the machine you actually work on:
#   git clone https://github.com/maimother1-dotcom/M.AI.git
#   cd M.AI && ./install.sh
#
# Safe to re-run. Existing files are backed up before being replaced.
#
# Flags:
#   --skip-ollama   Skip Ollama and the semantic vault search setup
#   --skip-gmail    Skip the Gmail MCP server setup
#   --dry-run       Print what would happen, change nothing

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRST_NAME="Bijoy"
NTFY_TOPIC="BijoyClaude"
VAULT_DEST="$HOME/Documents/My Vault"
CLAUDE_DIR="$HOME/.claude"
STAMP="$(date +%Y%m%d-%H%M%S)"

SKIP_OLLAMA=0
SKIP_GMAIL=0
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --skip-ollama) SKIP_OLLAMA=1 ;;
        --skip-gmail)  SKIP_GMAIL=1 ;;
        --dry-run)     DRY_RUN=1 ;;
        -h|--help)     sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown flag: $arg" >&2; exit 1 ;;
    esac
done

# --- platform detection ------------------------------------------------------
# sed -i takes an argument on BSD/macOS and none on GNU/Linux. Branch on it
# rather than assuming, so this works on both.
OS="$(uname -s)"
case "$OS" in
    Darwin) IS_MAC=1 ;;
    Linux)  IS_MAC=0 ;;
    *) echo "Unsupported OS: $OS. This installer handles macOS and Linux." >&2; exit 1 ;;
esac

sed_inplace() {
    if [ "$IS_MAC" -eq 1 ]; then sed -i '' "$@"; else sed -i "$@"; fi
}

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[0;32mok\033[0m  %s\n' "$*"; }
warn() { printf '    \033[0;33m!\033[0m   %s\n' "$*"; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then printf '    [dry-run] %s\n' "$*"; else eval "$@"; fi; }

backup_if_exists() {
    local target="$1"
    if [ -e "$target" ]; then
        warn "exists, backing up to ${target}.bak-${STAMP}"
        run "mv \"$target\" \"${target}.bak-${STAMP}\""
    fi
}

echo
echo "  Claude Code OS — install for $FIRST_NAME"
echo "  platform: $OS   vault: $VAULT_DEST"
[ "$DRY_RUN" -eq 1 ] && echo "  DRY RUN — nothing will be changed"
echo

# --- 1. vault ----------------------------------------------------------------
say "[1/9] Installing vault"
run "mkdir -p \"$HOME/Documents\""
if [ -d "$VAULT_DEST" ]; then
    warn "vault already exists at $VAULT_DEST — leaving your notes alone"
    warn "updating CLAUDE.md, Tasks.md, Vault Index.md, and Playbooks only"
    for f in "CLAUDE.md" "Tasks.md" "Vault Index.md"; do
        [ -f "$VAULT_DEST/$f" ] && run "cp \"$VAULT_DEST/$f\" \"$VAULT_DEST/$f.bak-$STAMP\""
        run "cp \"$REPO_DIR/vault/$f\" \"$VAULT_DEST/$f\""
    done
    run "mkdir -p \"$VAULT_DEST/Notes/Playbooks\" \"$VAULT_DEST/Notes/Claude Memory\""
    run "cp -R \"$REPO_DIR/vault/Notes/Playbooks/.\" \"$VAULT_DEST/Notes/Playbooks/\""
    # Trading desk: add anything new, never clobber. Once live, this folder holds
    # real enquiries, orders, and spec masters with sourced limits in them.
    run "mkdir -p \"$VAULT_DEST/Notes/Business/Trading\""
    run "cp -Rn \"$REPO_DIR/vault/Notes/Business/Trading/.\" \"$VAULT_DEST/Notes/Business/Trading/\" 2>/dev/null || true"
    warn "Trading folder: new files added, your existing records left untouched"
else
    run "cp -R \"$REPO_DIR/vault\" \"$VAULT_DEST\""
fi
# Obsidian needs these to exist even when empty; git does not track empty dirs.
run "mkdir -p \"$VAULT_DEST/Daily Notes\" \"$VAULT_DEST/Inbox\" \
    \"$VAULT_DEST/Notes/Business\" \"$VAULT_DEST/Notes/People\" \
    \"$VAULT_DEST/Notes/Inner Work\" \"$VAULT_DEST/Notes/Claude Memory\" \
    \"$VAULT_DEST/Notes/Playbooks\" \
    \"$VAULT_DEST/Notes/Business/Trading\"/{Enquiries,Orders,Buyers,Suppliers,Products,Registers,Reference}"
ok "vault at $VAULT_DEST"

# --- 2. claude config --------------------------------------------------------
say "[2/9] Installing hooks, skills, agents, and rule bank"
run "mkdir -p \"$CLAUDE_DIR\"/{hooks,skills,agents,rule-bank,session-locks,dashboard,credentials}"
run "cp -R \"$REPO_DIR/claude-config/hooks/.\"     \"$CLAUDE_DIR/hooks/\""
run "cp -R \"$REPO_DIR/claude-config/skills/.\"    \"$CLAUDE_DIR/skills/\""
run "cp -R \"$REPO_DIR/claude-config/agents/.\"    \"$CLAUDE_DIR/agents/\""
run "cp -R \"$REPO_DIR/claude-config/rule-bank/.\" \"$CLAUDE_DIR/rule-bank/\""
run "chmod +x \"$CLAUDE_DIR\"/hooks/*.sh \"$CLAUDE_DIR\"/hooks/*.py 2>/dev/null || true"
ok "$(find "$REPO_DIR/claude-config/rule-bank" -name '*.md' | wc -l | tr -d ' ') rules, \
$(find "$REPO_DIR/claude-config/hooks" -type f | wc -l | tr -d ' ') hooks, \
$(find "$REPO_DIR/claude-config/agents" -name '*.md' | wc -l | tr -d ' ') agents installed"

# --- 3. settings.json --------------------------------------------------------
say "[3/9] Writing settings.json"
backup_if_exists "$CLAUDE_DIR/settings.json"
run "cp \"$REPO_DIR/claude-config/settings.json\" \"$CLAUDE_DIR/settings.json\""
# The template hardcodes /Users/YOUR_USERNAME. Rewrite to the real home so this
# works on Linux (/home/x) as well as macOS (/Users/x).
run "sed_inplace \"s|/Users/YOUR_USERNAME|$HOME|g\" \"$CLAUDE_DIR/settings.json\""
if [ "$IS_MAC" -eq 0 ]; then
    run "sed_inplace 's|/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin|/usr/local/bin:/usr/bin:/bin|' \"$CLAUDE_DIR/settings.json\""
fi
if [ "$DRY_RUN" -eq 0 ]; then
    python3 -c "import json,sys; json.load(open('$CLAUDE_DIR/settings.json'))" \
        && ok "settings.json valid, paths point at $HOME" \
        || { echo "settings.json is not valid JSON. Aborting." >&2; exit 1; }
fi

# --- 4. dependencies ---------------------------------------------------------
say "[4/9] Checking dependencies"
if [ "$IS_MAC" -eq 1 ]; then
    if ! command -v brew &>/dev/null; then
        warn "Homebrew missing, installing"
        run "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    else ok "homebrew"; fi
    command -v jq      &>/dev/null || run "brew install jq"
    command -v python3 &>/dev/null || run "brew install python3"
else
    command -v jq      &>/dev/null || warn "jq missing — install with your package manager (hooks use it)"
    command -v python3 &>/dev/null || warn "python3 missing — required"
fi
command -v jq      &>/dev/null && ok "jq $(jq --version 2>/dev/null)"
command -v python3 &>/dev/null && ok "$(python3 --version 2>&1)"

# --- 5. credentials ----------------------------------------------------------
say "[5/9] Credentials folder"
run "cp -R \"$REPO_DIR/claude-config/credentials/.\" \"$CLAUDE_DIR/credentials/\""
# Secrets live here. Owner-only, always.
run "chmod 700 \"$CLAUDE_DIR/credentials\""
run "chmod 600 \"$CLAUDE_DIR/credentials/\"* 2>/dev/null || true"
ok "$CLAUDE_DIR/credentials (chmod 700, contents 600)"

# --- 6. semantic vault search ------------------------------------------------
say "[6/9] Semantic vault search"
if [ "$SKIP_OLLAMA" -eq 1 ]; then
    warn "skipped (--skip-ollama)"
else
    run "cp -R \"$REPO_DIR/claude-config/vault-vector\" \"$CLAUDE_DIR/vault-vector\""
    if [ "$IS_MAC" -eq 1 ]; then
        run "VAULT_PATH=\"$VAULT_DEST\" bash \"$CLAUDE_DIR/vault-vector/setup.sh\" \"$VAULT_DEST\" \"$FIRST_NAME\""
        ok "vault-search MCP registered"
    else
        warn "setup.sh registers a macOS launchd agent — skipping that step on Linux"
        warn "files copied to $CLAUDE_DIR/vault-vector; run the embedder manually if wanted"
    fi
fi

# --- 7. gmail mcp ------------------------------------------------------------
say "[7/9] Gmail MCP"
if [ "$SKIP_GMAIL" -eq 1 ]; then
    warn "skipped (--skip-gmail)"
else
    run "cp -R \"$REPO_DIR/claude-config/gmail-mcp\" \"$CLAUDE_DIR/gmail-mcp\""
    PY=$( (command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3) 2>/dev/null | head -1)
    run "\"$PY\" -m venv \"$CLAUDE_DIR/gmail-mcp/venv\""
    run "\"$CLAUDE_DIR/gmail-mcp/venv/bin/pip\" install --quiet --upgrade pip"
    run "\"$CLAUDE_DIR/gmail-mcp/venv/bin/pip\" install --quiet fastmcp google-api-python-client google-auth-httplib2 google-auth-oauthlib"
    ok "gmail-mcp installed (already registered in settings.json)"
    warn "needs OAuth: save credentials.json to $CLAUDE_DIR/credentials/gmail_credentials.json"
fi

# --- 8. today's daily note ---------------------------------------------------
say "[8/9] Today's daily note"
if [ "$DRY_RUN" -eq 0 ]; then
    TODAY=$(python3 -c "
from datetime import datetime
n = datetime.now(); d = n.day
s = 'th' if 11 <= d <= 13 else {1:'st',2:'nd',3:'rd'}.get(d % 10, 'th')
print(f'{d}{s} {n.strftime(\"%B %Y\")}')
")
    NOTE="$VAULT_DEST/Daily Notes/$TODAY.md"
    if [ -f "$NOTE" ]; then
        ok "already exists: $TODAY.md"
    else
        printf '## %s\n\nSystem installed locally. Claude Code OS is live.\n\n## Links\n\n- [[CLAUDE.md]]\n- [[Tasks.md]]\n' "$TODAY" > "$NOTE"
        ok "created $TODAY.md"
    fi
fi

# --- 9. ntfy -----------------------------------------------------------------
say "[9/9] Notifications"
ok "topic: $NTFY_TOPIC"
if [ "$DRY_RUN" -eq 0 ]; then
    curl -s -H "Title: Setup: DONE" \
        -d "Claude Code OS is live on $(hostname -s 2>/dev/null || hostname). Restart Claude Code to activate vault search." \
        "ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 \
        && ok "test notification sent" || warn "could not reach ntfy.sh (not fatal)"
fi

# --- done --------------------------------------------------------------------
cat <<EOF

  Done.

  Next, in order:
    1. Quit Claude Code completely and reopen it. This loads the hooks,
       the vault-search MCP, and the Gmail MCP. Nothing works until you do.
    2. Open the vault in Obsidian:  $VAULT_DEST
    3. Install the ntfy app on your phone, subscribe to: $NTFY_TOPIC
    4. Add API keys as .env files in $CLAUDE_DIR/credentials/
       Anthropic:  echo "ANTHROPIC_API_KEY=sk-ant-..." > $CLAUDE_DIR/credentials/anthropic.env
                   chmod 600 $CLAUDE_DIR/credentials/anthropic.env

  Backups of anything replaced are suffixed .bak-$STAMP

EOF
