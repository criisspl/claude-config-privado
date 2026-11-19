#!/usr/bin/env bash
# cost-log.sh — Stop: guarda en ~/.cache/claude-guard/cost.jsonl los tokens acumulados de la sesión por modelo.
# Una línea por Stop (acumulado); el informe se queda con la última por session_id. Nunca bloquea.
set -uo pipefail
input=$(cat 2>/dev/null || true)
tp=$(jq -r '.transcript_path // empty' <<<"$input" 2>/dev/null)
sid=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
[[ -f "$tp" && -n "$sid" ]] || exit 0
branch=$(git -C "${cwd:-.}" branch --show-current 2>/dev/null || true)
key=$(grep -oE '[A-Z][A-Z0-9]+-[0-9]+' <<<"$branch ${cwd}" | head -1 || true)
mkdir -p "$HOME/.cache/claude-guard"
jq -cs --arg sid "$sid" --arg key "${key:-}" --arg cwd "$cwd" --arg branch "${branch:-}" --arg ts "$(date -Is)" '
  [ .[] | select(.type=="assistant" and .message.usage) | {id:(.message.id // .uuid), m:(.message.model // "?"), u:.message.usage} ]
  | unique_by(.id)
  | group_by(.m)
  | map({model:.[0].m, input:(map(.u.input_tokens//0)|add), output:(map(.u.output_tokens//0)|add),
         cache_read:(map(.u.cache_read_input_tokens//0)|add), cache_write:(map(.u.cache_creation_input_tokens//0)|add)})
  | {ts:$ts, session:$sid, jira:$key, branch:$branch, cwd:$cwd, models:.}' "$tp" >> "$HOME/.cache/claude-guard/cost.jsonl" 2>/dev/null
exit 0
