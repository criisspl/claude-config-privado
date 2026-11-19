#!/usr/bin/env bash
# git-safety.sh — Claude Code PreToolUse/Bash hook
# Blocks dangerous git operations before execution.
# Reads stdin JSON from Claude Code hook framework.

set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "Bloqueado: falta jq, el hook no puede comprobar nada (instálalo: apt/brew install jq)" >&2; exit 2; }
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

[[ -z "$command" ]] && exit 0

# "git" + opciones globales (-C x, -c k=v, --no-pager, --git-dir x...) antes del subcomando
G='git(\s+(-[Cc]\s+\S+|--(git-dir|work-tree|namespace|exec-path)(=\S+|\s+\S+)|--[a-z-]+(=\S+)?))*\s+'

# Sin comillas: para no confundir mensajes de commit con opciones
bare=$(echo "$command" | sed -E "s/'[^']*'|\"[^\"]*\"//g")

# Block force-push to protected branches
if echo "$command" | grep -qP "${G}push\\s+.*(-f|--force)\\s+.*\\b(main|master|develop)\\b"; then
  echo "Blocked: force push to protected branch (main/master/develop)" >&2
  exit 2
fi
# Block generic force push (catches: git push --force)
if echo "$command" | grep -qP "${G}push\\s+.*(-f|--force)"; then
  echo "Blocked: force push is not allowed" >&2
  exit 2
fi
# Block force push con refspec + (git push origin +main)
if echo "$command" | grep -qP "${G}push\\b[^;&|]*\\s[\"']?\\+[^\\s+]"; then
  echo "Blocked: force push (refspec con +) is not allowed" >&2
  exit 2
fi

# Block remote deletion of protected branches (--delete, -d or :branch)
if echo "$bare" | grep -qP "${G}push\\b.*((--delete|\\s-d)\\b.*\\s(refs/heads/)?(main|master|develop)(\\s|\$)|\\s:(refs/heads/)?(main|master|develop)(\\s|\$))"; then
  echo "Blocked: remote deletion of protected branch (main/master/develop)" >&2
  exit 2
fi

# Block hard reset
if echo "$command" | grep -qP "${G}reset\\s+--hard"; then
  echo "Blocked: git reset --hard is not allowed" >&2
  exit 2
fi

# Block checkout/restore to discard all changes (checkout -- ., checkout ., checkout HEAD ., restore .)
if echo "$bare" | grep -qP "${G}checkout\\s+(\\S+\\s+)?(--\\s+)?\\.(\\s|\$|[;&|])"; then
  echo "Blocked: git checkout . discards all changes" >&2
  exit 2
fi
if echo "$bare" | grep -qP "${G}restore\\s+(-\\S+\\s+)*(--\\s+)?\\.(\\s|\$|[;&|])"; then
  # restore --staged . solo saca del stage; con --worktree/-W sí descarta
  if ! echo "$bare" | grep -qP "${G}restore\\s.*(--staged|\\s-S\\b)" || echo "$bare" | grep -qP "${G}restore\\s.*(--worktree|\\s-W\\b)"; then
    echo "Blocked: git restore . discards all changes" >&2
    exit 2
  fi
fi

# Block force clean
if echo "$command" | grep -qP "${G}clean\\s+(.*\\s)?(-[a-zA-Z]*f|--force)"; then
  echo "Blocked: git clean -f is not allowed" >&2
  exit 2
fi

# Block deleting protected branches
if echo "$command" | grep -qP "${G}branch\\s+.*-[Dd]\\s+\\b(main|master|develop)\\b"; then
  echo "Blocked: deleting protected branch (main/master/develop)" >&2
  exit 2
fi

# Block commit --no-verify y su forma corta -n (solo flags sueltos; -m/-F/-C/-c/-t llevan argumento)
if echo "$bare" | grep -qP "${G}commit\\s+.*--no-verify"; then
  echo "Blocked: git commit --no-verify is not allowed" >&2
  exit 2
fi
if echo "$bare" | grep -qP "${G}commit\\s+(.*\\s)?-[^\\s\\-mFCcSt]*n"; then
  echo "Blocked: git commit -n (--no-verify) is not allowed" >&2
  exit 2
fi

# Cada push por separado (cortado en | & ;) para que un "git checkout main" posterior no cuente
pushes=$(echo "$bare" | sed -E 's/[0-9]*>&[0-9-]+//g' | grep -oP "${G}push\\b[^|&;]*" || true)
if [[ -n "$pushes" ]]; then
  # Refspec explícito a main/master (origin main, HEAD:main, x:refs/heads/main)
  if echo "$pushes" | grep -qP "${G}push\\b.*\\s([^\\s:]*:)?(refs/heads/)?(main|master)(\\s|\$)"; then
    echo "Blocked: direct push to main/master (use a branch and a PR)" >&2
    exit 2
  fi
  # Sin refspec (git push, git push origin) o con HEAD/@: depende de la rama actual
  need_branch=0
  while IFS= read -r seg; do
    args=$(echo "${seg#*push}" | tr ' ' '\n' | grep -v '^-' | grep . || true)
    pos=$(echo "$args" | grep -c . || true)
    ref=$(echo "$args" | sed -n 2p)
    if [[ "$pos" -le 1 || "$ref" == "HEAD" || "$ref" == "@" ]]; then need_branch=1; fi
  done <<< "$pushes"
  if [[ "$need_branch" -eq 1 ]]; then
    # Rama del repo donde se hace el push de verdad: respeta "git -C <dir>" y "cd <dir> &&"
    dir=$(echo "$bare" | grep -oP "${G}(?=push\\b)" | head -1 | sed -nE 's/.*\s-C\s+(\S+)\s.*/\1/p')
    [[ -z "$dir" ]] && dir=$(echo "$command" | sed -nE 's/.*\bcd\s+("([^"]*)"|'"'"'([^'"'"']*)'"'"'|([^[:space:];&|]+))\s*(&&|;).*push\b.*/\2\3\4/p')
    dir="${dir/#\~/$HOME}"
    if [[ -n "$dir" ]]; then
      branch=$(git -C "$dir" symbolic-ref --short HEAD 2>/dev/null || true)
    else
      branch=$(git symbolic-ref --short HEAD 2>/dev/null || true)
    fi
    if [[ "$branch" == "main" || "$branch" == "master" ]]; then
      echo "Blocked: git push from main/master (use a branch and a PR)" >&2
      exit 2
    fi
  fi
fi

exit 0
