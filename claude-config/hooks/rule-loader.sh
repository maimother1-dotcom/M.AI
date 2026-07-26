#!/usr/bin/env bash
# UserPromptSubmit hook — Dynamic Rule Engine
# Reads ~/.claude/rule-bank/ and injects relevant rules based on prompt content.
# Smarter matching: requires 2+ broad trigger hits OR an exact-phrase match.
# Caps at 8 rules max. Prioritizes by severity.

set -euo pipefail

RULES_DIR="$HOME/.claude/rule-bank"
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('prompt',''))" 2>/dev/null || echo "")

[ -z "$PROMPT" ] && exit 0
[ ! -d "$RULES_DIR" ] && exit 0

python3 -c "
import os, re, json, sys

prompt = sys.argv[1].lower()
rules_dir = '$RULES_DIR'
candidates = []
max_rules = 8

BROAD_TRIGGERS = {'test', 'build', 'deploy', 'email', 'send', 'update', 'change', 'edit',
                  'client', 'done', 'check', 'fix', 'add', 'create', 'model', 'ai',
                  'automation', 'workflow', 'status', 'report', 'contact', 'notify',
                  'complete', 'finished', 'rule', 'config', 'swap', 'switch'}

for fname in os.listdir(rules_dir):
    if not fname.endswith('.md'):
        continue
    fpath = os.path.join(rules_dir, fname)
    try:
        with open(fpath) as f:
            content = f.read()
    except:
        continue

    m = re.search(r'^triggers:\s*\[([^\]]*)\]', content, re.MULTILINE)
    if not m:
        continue
    triggers = [t.strip().strip('\"').strip(\"'\").lower() for t in m.group(1).split(',')]

    hits = [t for t in triggers if t and t in prompt]
    if not hits:
        continue

    all_broad = all(h in BROAD_TRIGGERS for h in hits)
    if all_broad and len(hits) < 2:
        continue

    sev_match = re.search(r'^severity:\s*(\w+)', content, re.MULTILINE)
    severity = sev_match.group(1) if sev_match else 'normal'
    sev_score = {'hard': 3, 'high': 2, 'normal': 1}.get(severity, 1)

    parts = content.split('---')
    if len(parts) >= 3:
        body = '---'.join(parts[2:]).strip()
        if body:
            candidates.append((sev_score, len(hits), body))

if not candidates:
    sys.exit(0)

candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
matched = [c[2] for c in candidates[:max_rules]]

rules_text = 'RULE ENGINE — {} rules loaded for this prompt. These are NON-NEGOTIABLE:\n\n'.format(len(matched))
for r in matched:
    rules_text += '[RULE] ' + r + '\n'

print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': rules_text
    }
}))
" "$PROMPT" 2>/dev/null || exit 0

exit 0
