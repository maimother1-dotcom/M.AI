#!/usr/bin/env bash
# PreToolUse hook — enforces Playwright (web-tester) for all browser testing.
# Blocks direct Chrome launches for testing. Use web-tester subagent instead.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('tool_name',''))" 2>/dev/null || echo "")
TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()).get('tool_input',{}); print(d.get('command','') if isinstance(d,dict) else '')" 2>/dev/null || echo "")

BLOCK=false

# Block Bash commands that launch Chrome for testing
if [ "$TOOL_NAME" = "Bash" ]; then
    if echo "$TOOL_INPUT" | grep -qiE "(open -a.*chrome|open.*Google Chrome|/Applications/Google Chrome|google-chrome|chromium)" 2>/dev/null; then
        # Allow for credential/auth purposes only
        if echo "$TOOL_INPUT" | grep -qi "credential\|rebind\|reconnect\|n8n" 2>/dev/null; then
            exit 0
        fi
        BLOCK=true
    fi
fi

# Block Claude_in_Chrome MCP tool calls
if echo "$TOOL_NAME" | grep -qi "Claude_in_Chrome\|mcp__Claude_in_Chrome" 2>/dev/null; then
    BLOCK=true
fi

if [ "$BLOCK" = true ]; then
    echo "BLOCKED: Use the web-tester subagent (Playwright) for ALL browser testing — navigation, clicks, screenshots, verification. Chrome is for manual tasks only." >&2
    exit 2
fi

exit 0
