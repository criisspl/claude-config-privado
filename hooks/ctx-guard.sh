#!/usr/bin/env bash
# ctx-guard.sh — Claude Code UserPromptSubmit hook
# Bloquea el prompt si el contexto pasa de LIMIT tokens hasta que se ejecute /compact o /clear.
# Ajustable con CTX_GUARD_LIMIT. CTX_GUARD_MODE=hard (bloquea, por defecto) | light (solo avisa). CTX_GUARD_HANDOFF (120000): desde ahí pide un prompt de traspaso. Requiere jq.
LIMIT=${CTX_GUARD_LIMIT:-140000}
input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
transcript=$(jq -r '.transcript_path // ""' <<<"$input")
[[ "$prompt" =~ ^[[:space:]]*/(compact|clear) || ! -f "$transcript" ]] && exit 0
# prompts automáticos (avisos de tareas en background y de subagentes): no se bloquean, o se corta al agente a mitad de trabajo
[[ "$prompt" == "<task-notification"* || "$prompt" == "<agent-message"* ]] && exit 0

# Solo cuenta respuestas posteriores al último compact: justo tras /compact el uso viejo seguiría ahí
used=$(tail -n 400 "$transcript" | jq -rs '(map(.subtype=="compact_boundary" or .isCompactSummary==true) | rindex(true) // -1) as $i | .[$i+1:] | map(select(.type=="assistant" and .message.usage) | .message.usage | (.input_tokens + .cache_read_input_tokens + .cache_creation_input_tokens)) | last // 0' 2>/dev/null)
HANDOFF=${CTX_GUARD_HANDOFF:-120000}
if [[ "${used:-0}" -ge "$HANDOFF" && "${used:-0}" -lt "$LIMIT" ]]; then
  jq -nc --arg r "Contexto en $((used/1000))k (se bloqueará en $((LIMIT/1000))k). Al final de tu respuesta, añade un prompt de traspaso de 5-10 líneas (objetivo, estado, ficheros tocados, siguiente paso) para pegarlo tras /clear en una sesión nueva." '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$r}}'
  exit 0
fi
[[ "${used:-0}" -ge "$LIMIT" ]] || exit 0

msg="Contexto en $((used/1000))k (límite $((LIMIT/1000))k). Ejecuta /compact (misma tarea) o /clear (tarea nueva)"
if [[ "${CTX_GUARD_MODE:-hard}" == "light" ]]; then
  jq -nc --arg r "$msg cuando puedas." '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$r}}'
else
  jq -nc --arg r "$msg antes de seguir." '{decision:"block", reason:$r}'
fi
