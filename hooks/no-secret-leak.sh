#!/usr/bin/env bash
# no-secret-leak.sh — Claude Code PreToolUse/Write|Edit|MultiEdit hook
# Blocks writes containing secrets or credentials.
# Reads stdin JSON from Claude Code hook framework.

set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "Bloqueado: falta jq, el hook no puede comprobar nada (instálalo: apt/brew install jq)" >&2; exit 2; }
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // ([.tool_input.edits[]?.new_string] | join("\n")) // ""')

[[ -z "$content" ]] && exit 0

# Tests, fixtures y ejemplos: solo se saltan los patrones genéricos (api_key=..., URLs de BD),
# nunca los formatos de proveedor inequívocos
es_test=0
if echo "$file_path" | grep -qP '(\.test\.|\.spec\.|__fixtures__/|\.(example|sample)$)'; then
  es_test=1
fi

# AWS Access Key ID
if echo "$content" | grep -qP 'AKIA[0-9A-Z]{16}'; then
  echo "Blocked: AWS Access Key ID detected in ${file_path}" >&2
  exit 2
fi

# GitHub tokens
if echo "$content" | grep -qP 'gh[ps]_[a-zA-Z0-9]{36}'; then
  echo "Blocked: GitHub token detected in ${file_path}" >&2
  exit 2
fi

# Anthropic, OpenAI, GitHub fine-grained, Slack
if echo "$content" | grep -qP 'sk-(ant|proj)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{40,}'; then
  echo "Blocked: Anthropic/OpenAI API key detected in ${file_path}" >&2
  exit 2
fi
if echo "$content" | grep -qP 'github_pat_[A-Za-z0-9_]{22,}'; then
  echo "Blocked: GitHub fine-grained token detected in ${file_path}" >&2
  exit 2
fi
if echo "$content" | grep -qP 'xox[baprs]-[A-Za-z0-9-]{10,}'; then
  echo "Blocked: Slack token detected in ${file_path}" >&2
  exit 2
fi

# Private key blocks
if echo "$content" | grep -qP -e '-----BEGIN\s+\S*\s*PRIVATE KEY-----'; then
  echo "Blocked: private key block detected in ${file_path}" >&2
  exit 2
fi

[[ $es_test == 1 ]] && exit 0

# Generic API key / secret patterns (long values)
if echo "$content" | grep -qiP '(api_key|secret_key|auth_token|access_token)\s*[=:]\s*[a-zA-Z0-9+/]{20,}'; then
  echo "Blocked: potential API key/secret detected in ${file_path}" >&2
  exit 2
fi

# DB connection strings with embedded credentials
if echo "$content" | grep -qP '(postgresql|mysql|mongodb|redis)://[^:@\s]+:[^@\s]+@'; then
  echo "Blocked: database connection string with credentials detected in ${file_path}" >&2
  exit 2
fi

exit 0
