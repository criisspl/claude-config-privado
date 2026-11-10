#!/usr/bin/env bash
# ctx-guard.sh — Claude Code UserPromptSubmit hook
# Bloquea el prompt si el contexto pasa de LIMIT tokens hasta que se ejecute /compact o /clear.
# Ajustable con CTX_GUARD_LIMIT. Requiere jq.
LIMIT=${CTX_GUARD_LIMIT:-140000}
input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
transcript=$(jq -r '.transcript_path // ""' <<<"$input")
[[ "$prompt" =~ ^[[:space:]]*/(compact|clear) || ! -f "$transcript" ]] && exit 0

# Solo cuenta respuestas posteriores al último compact: justo tras /compact el uso viejo seguiría ahí
used=$(tail -n 400 "$transcript" | jq -rs '(map(.subtype=="compact_boundary" or .isCompactSummary==true) | rindex(true) // -1) as $i | .[$i+1:] | map(select(.type=="assistant" and .message.usage) | .message.usage | (.input_tokens + .cache_read_input_tokens + .cache_creation_input_tokens)) | last // 0' 2>/dev/null)
[[ "${used:-0}" -ge "$LIMIT" ]] || exit 0

jq -nc --arg r "Contexto en $((used/1000))k (límite $((LIMIT/1000))k). Ejecuta /compact (misma tarea) o /clear (tarea nueva) antes de seguir." '{decision:"block", reason:$r}'
