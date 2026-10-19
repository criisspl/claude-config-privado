#!/usr/bin/env bash
# opus-watch.sh — Claude Code UserPromptSubmit hook
# Avisa si la sesión va en Opus fuera de plan mode con `opusplan` como modelo por defecto
# (pasa: sesiones que arrancan en Opus y siguen así tras /clear). Siempre exit 0.

input=$(cat)
mode=$(jq -r '.permission_mode // ""' <<<"$input")
transcript=$(jq -r '.transcript_path // ""' <<<"$input")
settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

[[ "$mode" == plan || ! -f "$transcript" ]] && exit 0
[[ "$(jq -r '.model // ""' "$settings" 2>/dev/null)" == opusplan ]] || exit 0

last=$(tail -n 200 "$transcript" | grep -o '"requestedModel":"[^"]*"' | tail -n 1)
if [[ "$last" == *opus* ]]; then
  jq -nc '{systemMessage: "⚠ Sesión en Opus fuera de plan mode: /model → Opus Plan Mode (Enter) para volver a Sonnet."}'
fi
exit 0
