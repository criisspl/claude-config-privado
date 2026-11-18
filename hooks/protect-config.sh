#!/usr/bin/env bash
# protect-config.sh — Claude Code PreToolUse/Edit|Write hook
# Bloquea editar configs de lint, tipos y tests (para que no se debiliten); pide confirmación en package.json,
# workflows de CI y vite.config.
set -euo pipefail

input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // ""')

[[ -z "$file" ]] && exit 0
name=$(basename "$file")

if [[ "$name" =~ ^(\.eslintrc(\..+)?|tsconfig(\..+)?\.json|jest\.config\..+|vitest\.config\..+)$ ]]; then
  echo "Blocked: $name es config de lint/tipos/tests; no se edita para que pase la CI" >&2
  exit 2
fi

if [[ "$name" == "package.json" || "$name" =~ ^vite\.config\..+$ || "$file" == */.github/workflows/* ]]; then
  jq -n --arg r "Vas a editar $name (config del proyecto/CI). ¿Seguro?" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
fi

exit 0
