#!/usr/bin/env bash
# rm-safety.sh — PreToolUse/Bash: frena borrados catastróficos (rm -r sobre /, /usr, /etc…, ~, ., .., *; DROP/TRUNCATE SQL).
# Modo en rm-safety.mode: "observe" (solo registra en ~/.cache/claude-guard/observe.log) o "block" (exit 2).
# No toca casos normales: rm -rf node_modules, dist, rutas concretas, worktrees, scratchpad.
set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "Bloqueado: falta jq, el hook no puede comprobar nada (instálalo: apt/brew install jq)" >&2; exit 2; }
input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
[[ -z "$command" ]] && exit 0

mode=observe
modefile="$(dirname "$(readlink -f "$0")")/rm-safety.mode"
[[ -f "$modefile" ]] && mode=$(tr -d '[:space:]' < "$modefile")

reason=""
nq=$(tr -d "\"'" <<<"$command")  # rm -rf "/" == rm -rf /
# rm recursivo (-r/-R/--recursive, solo o combinado con -f) contra un objetivo peligroso
if grep -qP '(^|[;&|(\s])rm\s+(?:-[a-zA-Z-]+\s+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\s+(?:-[a-zA-Z-]+\s+)*(?:--\s+)?(?:/|/\*|/(?:usr|etc|var|bin|sbin|lib|opt|boot|Users|System|Library|Applications)/?|~|~/|~/\*|\$HOME|\$\{HOME\}|"\$HOME"|/home|/home/[^/\s]+/?|\.|\./|\.\.|\.\./|\*|\./\*)(?=\s|$|[;&|)])' <<<"$nq"; then
  reason="rm recursivo sobre /, un directorio del sistema, ~, \$HOME, /home, ., .. o *"
elif grep -qP '(^|[;&|(\s])rm\s.*--no-preserve-root' <<<"$command"; then
  reason="rm con --no-preserve-root"
elif grep -qiP '\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+TABLE)\b|liquibase\s+.*\b(drop-all|dropAll)\b' <<<"$command"; then
  reason="borrado SQL/Liquibase (DROP, TRUNCATE o drop-all)"
fi

[[ -z "$reason" ]] && exit 0

mkdir -p "$HOME/.cache/claude-guard"
printf '%s\t%s\t%s\t%s\n' "$(date -Is)" "$mode" "$reason" "${command:0:300}" >> "$HOME/.cache/claude-guard/observe.log"

if [[ "$mode" == block ]]; then
  echo "Bloqueado (rm-safety): $reason. Si es intencionado, que Cristina lo ejecute a mano o ponga rm-safety.mode en observe." >&2
  exit 2
fi
exit 0
