#!/usr/bin/env bash
# read-guard.sh — Claude Code PreToolUse/Read hook
# Blocks reading lockfiles and generated folders (dist/, .next/): lots of tokens, no signal.

set -euo pipefail

input=$(cat)
RE_LOCK='(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)'

# Without jq, fall back to matching the raw input
if ! command -v jq >/dev/null 2>&1; then
  if grep -qE "${RE_LOCK}|/(dist|\.next)/" <<<"$input"; then
    echo "Blocked: lockfile or generated folder (jq not found, install it for exact matching)" >&2; exit 2
  fi
  echo "read-guard: jq not found, hook inactive" >&2; exit 0
fi
file=$(echo "$input" | jq -r '.tool_input.file_path // ""')

[[ -z "$file" ]] && exit 0

if [[ "${file##*/}" =~ ^${RE_LOCK}$ ]]; then
  echo "Blocked: reading lockfile ${file##*/} (huge, no useful signal). Use package.json or 'npm ls' instead" >&2
  exit 2
fi
if [[ "/$file" =~ /(dist|\.next)/ ]]; then
  echo "Blocked: $file is generated output (dist/ or .next/). Read the source instead" >&2
  exit 2
fi

exit 0
