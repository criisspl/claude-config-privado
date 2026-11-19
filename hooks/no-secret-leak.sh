#!/usr/bin/env bash
# no-secret-leak.sh — Claude Code PreToolUse/Write|Edit|MultiEdit hook
# Blocks writes containing secrets or credentials.
# Reads stdin JSON from Claude Code hook framework.

set -euo pipefail

# shellcheck source=lib/secret-patterns
source "$(dirname "$(readlink -f "$0")")/lib/secret-patterns"

command -v jq >/dev/null 2>&1 || { echo "Bloqueado: falta jq, el hook no puede comprobar nada (instálalo: apt/brew install jq)" >&2; exit 2; }
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // ([.tool_input.edits[]?.new_string] | join("\n")) // ""')

[[ -z "$content" ]] && exit 0

# Test fixtures, examples and samples: skip only the generic patterns (api_key=..., DB URLs);
# provider-format tokens (AWS, GitHub, Slack, Anthropic...) are still blocked
mode=""
if echo "$file_path" | grep -qP '(\.test\.|\.spec\.|__fixtures__/|\.(example|sample)$)'; then
  mode=providers-only
fi

if label=$(find_secret "$content" $mode); then
  echo "Blocked: ${label} detected in ${file_path}" >&2
  exit 2
fi

exit 0
