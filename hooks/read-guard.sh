#!/usr/bin/env bash
# read-guard.sh — Claude Code PreToolUse/Read hook
# Blocks reading lockfiles and generated folders (dist/, .next/): lots of tokens, no signal.

set -euo pipefail

# Registro mínimo de bloqueos para /retro (no cambia la decisión del hook).
bloqueo() {
  mkdir -p "$HOME/.cache/claude-guard" 2>/dev/null
  jq -cn --arg ts "$(date -Is)" --arg hook "read-guard" --arg motivo "$1" --arg cwd "$PWD" '{ts:$ts,hook:$hook,motivo:$motivo,cwd:$cwd}' >> "$HOME/.cache/claude-guard/bloqueos.jsonl" 2>/dev/null || true
}

input=$(cat)
RE_LOCK='(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)'

command -v jq >/dev/null 2>&1 || { echo "Bloqueado: falta jq, el hook no puede comprobar nada (instálalo: apt/brew install jq)" >&2; exit 2; }
file=$(echo "$input" | jq -r '.tool_input.file_path // ""')

[[ -z "$file" ]] && exit 0

if [[ "${file##*/}" =~ ^${RE_LOCK}$ ]]; then
  bloqueo "lockfile ${file##*/}"
  echo "Blocked: reading lockfile ${file##*/} (huge, no useful signal). Use package.json or 'npm ls' instead" >&2
  exit 2
fi
if [[ "/$file" =~ /(dist|\.next)/ ]]; then
  bloqueo "carpeta generada: $file"
  echo "Blocked: $file is generated output (dist/ or .next/). Read the source instead" >&2
  exit 2
fi

exit 0
