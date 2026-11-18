#!/usr/bin/env bash
# gh-account-check.sh — Claude Code SessionStart hook
# Prints the active gh account and the org of the origin remote; warns if they don't match.
# Only informs: exit 0 always, never switches accounts. Silent without gh, remote or network.

set -uo pipefail

input=$(cat)
cwd=""
command -v jq >/dev/null 2>&1 && cwd=$(echo "$input" | jq -r '.cwd // ""')
[[ -n "$cwd" ]] && cd "$cwd" 2>/dev/null

command -v gh >/dev/null 2>&1 || exit 0
url=$(git remote get-url origin 2>/dev/null) || exit 0
[[ -n "$url" ]] || exit 0

# https://github.com/ORG/repo(.git) or git@github.com:ORG/repo(.git)
org=$(echo "$url" | sed -E 's#^(https?://[^/]+/|[^@/]+@[^:]+:|ssh://[^/]+/)##; s#/.*$##')
[[ -n "$org" ]] || exit 0

login=$(gh api user -q .login 2>/dev/null) || exit 0
[[ -n "$login" ]] || exit 0

lo=$(echo "$org" | tr '[:upper:]' '[:lower:]')
ll=$(echo "$login" | tr '[:upper:]' '[:lower:]')

ok=0
[[ "$lo" == "$ll" ]] && ok=1
[[ "$lo" == "civitatis" && "$ll" == "csantos-civ" ]] && ok=1

echo "gh: cuenta activa $login, org del remote origin $org"
if [[ $ok -eq 0 ]]; then
  echo "AVISO: la cuenta gh ($login) no parece la de la org $org (trabajo: csantos-civ con GH_CONFIG_DIR=~/.config/gh-work; personal: criisspl con ~/.config/gh-personal)."
fi
exit 0
