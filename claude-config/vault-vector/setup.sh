#!/bin/bash
set -e

HOME_DIR="$HOME"
VAULT_PATH="${1:-$HOME_DIR/Documents/My Vault}"
VECTOR_DIR="$HOME_DIR/.claude/vault-vector"
VENV_DIR="$VECTOR_DIR/venv"
FIRST_NAME="${2:-User}"
# macOS ships bash 3.2, which has no ${VAR,,} lowercase expansion. Use tr.
FIRST_NAME_LC=$(printf '%s' "$FIRST_NAME" | tr '[:upper:]' '[:lower:]')
PLIST_LABEL="com.${FIRST_NAME_LC}.vault-embedder"
PLIST_PATH="$HOME_DIR/Library/LaunchAgents/$PLIST_LABEL.plist"
SETTINGS_PATH="$HOME_DIR/.claude/settings.json"

echo "=== Vault Vector Search Setup ==="

# 1. Homebrew
if ! command -v brew &>/dev/null; then
    echo "[1/7] Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "[1/7] Homebrew ✓"
fi

# 2. Ollama
if ! command -v ollama &>/dev/null; then
    echo "[2/7] Installing Ollama..."
    brew install --cask ollama
else
    echo "[2/7] Ollama ✓"
fi

if ! pgrep -x "ollama" &>/dev/null; then
    echo "      Starting Ollama..."
    open -a Ollama 2>/dev/null || ollama serve &>/dev/null &
    sleep 8
fi

# 3. Pull embedding model
echo "[3/7] Pulling nomic-embed-text (one-time, ~274MB)..."
ollama pull nomic-embed-text

# 4. Python venv
echo "[4/7] Creating Python environment..."
PY=$( (command -v python3.14 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3) 2>/dev/null | head -1)
"$PY" -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r "$VECTOR_DIR/requirements.txt"
echo "      Dependencies installed ✓"

# 5. Initial embedding
echo "[5/7] Starting initial vault embedding (runs in background)..."
"$VENV_DIR/bin/python" "$VECTOR_DIR/embedder.py" &
sleep 10
echo "      Initial sync started ✓"

# 6. Install launchd agent (auto-start on login)
echo "[6/7] Installing launchd agent..."
mkdir -p "$(dirname "$PLIST_PATH")"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$VENV_DIR/bin/python</string>
        <string>$VECTOR_DIR/embedder.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$VECTOR_DIR/embedder.log</string>
    <key>StandardErrorPath</key>
    <string>$VECTOR_DIR/embedder.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "      launchd agent loaded ✓"

# 7. Register MCP in Claude Code settings
echo "[7/7] Registering MCP server..."
python3 << PYEOF
import json, os
settings_path = os.path.expanduser("~/.claude/settings.json")
venv_python   = os.path.expanduser("~/.claude/vault-vector/venv/bin/python")
server_script = os.path.expanduser("~/.claude/vault-vector/mcp_server.py")

with open(settings_path) as f:
    settings = json.load(f)

settings.setdefault("mcpServers", {})
settings["mcpServers"]["vault-search"] = {
    "command": venv_python,
    "args": [server_script]
}

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
print("      vault-search MCP registered ✓")
PYEOF

echo ""
echo "=== Vault search setup complete ==="
echo "Restart Claude Code to activate vault-search MCP."
echo "Logs: tail -f $VECTOR_DIR/embedder.log"
