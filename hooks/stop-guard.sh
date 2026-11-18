#!/usr/bin/env bash
# stop-guard.sh — Claude Code Stop hook
# Before stopping, looks at the git diff (staged + unstaged) for leftovers:
# added console.log / debugger / .only( lines, and package.json changed without a lockfile.
# exit 2 + stderr makes Claude keep working; stop_hook_active=true exits 0 to avoid an infinite loop.

set -euo pipefail

input=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
[[ "$(echo "$input" | jq -r '.stop_hook_active // false')" == "true" ]] && exit 0

cwd=$(echo "$input" | jq -r '.cwd // ""')
[[ -n "$cwd" ]] && cd "$cwd" 2>/dev/null || true
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

diff=$({ git diff; git diff --cached; } 2>/dev/null || true)
[[ -z "$diff" ]] && exit 0

problems=""

# Added lines (not the +++ headers) with leftovers
found=$(echo "$diff" | awk '
  /^\+\+\+ /   { f = substr($0, 7); next }
  /^\+/ && (/console\.log/ || /(^|[^[:alnum:]_])debugger([^[:alnum:]_]|$)/ || /\.only\(/) { print "  " f ": " substr($0, 2, 100) }
')
[[ -n "$found" ]] && problems+=$'Debug leftovers in added lines (console.log / debugger / .only():\n'"$found"$'\n'

# package.json changed without any lockfile changed
changed=$({ git diff --name-only; git diff --cached --name-only; } 2>/dev/null | sort -u)
if echo "$changed" | grep -qE '(^|/)package\.json$' && ! echo "$changed" | grep -qE '(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$'; then
  problems+=$'package.json changed but no lockfile changed (run the install or confirm it is intended).\n'
fi

if [[ -n "$problems" ]]; then
  printf 'stop-guard: fix before finishing, or tell the user why it stays.\n%s' "$problems" >&2
  exit 2
fi
exit 0
