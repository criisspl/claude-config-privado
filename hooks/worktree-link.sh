#!/usr/bin/env bash
# worktree-link.sh — Claude Code SessionStart hook
# In a git worktree, symlinks .claude/settings.local.json and .env.local from the main
# checkout when they exist there and not in the worktree. Never overwrites; safe to repeat.

set -uo pipefail

input=$(cat)
cwd=""
command -v jq >/dev/null 2>&1 && cwd=$(echo "$input" | jq -r '.cwd // ""')
[[ -n "$cwd" ]] && cd "$cwd" 2>/dev/null

common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
gitdir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
common=$(cd "$common" && pwd -P)
gitdir=$(cd "$gitdir" && pwd -P)
[[ "$common" == "$gitdir" ]] && exit 0          # main checkout, not a worktree
[[ "${common##*/}" == ".git" ]] || exit 0        # bare repo: no main checkout to link from

main="${common%/.git}"
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

for f in .claude/settings.local.json .env.local; do
  [[ -e "$main/$f" ]] || continue
  [[ -e "$top/$f" || -L "$top/$f" ]] && continue
  mkdir -p "$(dirname "$top/$f")" && ln -s "$main/$f" "$top/$f"
done
exit 0
