#!/usr/bin/env bash
# git-safety.sh — Claude Code PreToolUse/Bash hook
# Blocks dangerous git operations before execution.
# Reads stdin JSON from Claude Code hook framework.

set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

[[ -z "$command" ]] && exit 0

# Block force-push to protected branches
if echo "$command" | grep -qP 'git\s+push\s+.*(-f|--force)\s+.*\b(main|master|develop)\b'; then
  echo "Blocked: force push to protected branch (main/master/develop)" >&2
  exit 2
fi
# Block generic force push (catches: git push --force)
if echo "$command" | grep -qP 'git\s+push\s+.*(-f|--force)'; then
  echo "Blocked: force push is not allowed" >&2
  exit 2
fi

# Block hard reset
if echo "$command" | grep -qP 'git\s+reset\s+--hard'; then
  echo "Blocked: git reset --hard is not allowed" >&2
  exit 2
fi

# Block checkout to discard all changes
if echo "$command" | grep -qP 'git\s+checkout\s+--\s+\.'; then
  echo "Blocked: git checkout -- . discards all changes" >&2
  exit 2
fi

# Block force clean
if echo "$command" | grep -qP 'git\s+clean\s+.*-f'; then
  echo "Blocked: git clean -f is not allowed" >&2
  exit 2
fi

# Block deleting protected branches
if echo "$command" | grep -qP 'git\s+branch\s+.*-[Dd]\s+\b(main|master|develop)\b'; then
  echo "Blocked: deleting protected branch (main/master/develop)" >&2
  exit 2
fi

exit 0
