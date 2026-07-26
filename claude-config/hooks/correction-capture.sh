#!/usr/bin/env bash
# UserPromptSubmit hook — Auto-captures corrections as permanent rules.
# When you correct Claude, it encodes the rule immediately so it never repeats the mistake.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('prompt',''))" 2>/dev/null || echo "")

[ -z "$PROMPT" ] && exit 0

PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

IS_CORRECTION=false

# Direct corrections aimed at Claude's behavior
if echo "$PROMPT_LOWER" | grep -qE "(from now on|every time you|you always |you keep |stop doing|never do that|that's not how|i told you to|i already said|you forgot to|you missed the|why didn't you|rule:)" 2>/dev/null; then
    IS_CORRECTION=true
fi

# Explicit correction starters
if echo "$PROMPT_LOWER" | grep -qE "^(don't ever|do not ever|stop |never |always )" 2>/dev/null; then
    IS_CORRECTION=true
fi

if [ "$IS_CORRECTION" = true ]; then
    python3 -c "
import json
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '''CORRECTION DETECTED — before doing ANYTHING else:
1. Extract the rule from what was just said
2. Create a rule file in ~/.claude/rule-bank/ with this format:
   ---
   id: kebab-case-name
   triggers: [relevant, keywords]
   severity: hard
   applies_to: [relevant domains]
   created: (today)
   source: correction
   ---
   The rule text.
3. THEN proceed with the actual request.

This correction must NEVER need to be repeated. The rule file enforces it forever.'''
    }
}))
"
    exit 0
fi

exit 0
