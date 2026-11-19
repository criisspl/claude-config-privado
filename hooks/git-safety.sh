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

# Sin comillas: para no confundir mensajes de commit con opciones
bare=$(echo "$command" | sed -E "s/'[^']*'|\"[^\"]*\"//g")

# Block commit --no-verify
if echo "$bare" | grep -qP 'git\s+commit\s+.*--no-verify'; then
  echo "Blocked: git commit --no-verify is not allowed" >&2
  exit 2
fi

# Block direct push to main/master (origin main, HEAD:main, x:main)
if echo "$bare" | grep -qP 'git\s+push\b.*\s(\S+:)?(main|master)(\s|$|[;&|])'; then
  echo "Blocked: direct push to main/master (use a branch and a PR)" >&2
  exit 2
fi
# Block push without refspec while on main/master (git push, git push origin)
if echo "$bare" | grep -qP 'git\s+push\b'; then
  args=$(echo "$bare" | sed -E 's/.*git[[:space:]]+push//; s/[;&|].*//')
  npos=0
  for a in $args; do [[ "$a" != -* ]] && npos=$((npos + 1)); done
  if [[ $npos -le 1 ]]; then
    case "$(git branch --show-current 2>/dev/null || true)" in
      main|master)
        echo "Blocked: git push from main/master (use a branch and a PR)" >&2
        exit 2
        ;;
    esac
  fi
fi

exit 0
