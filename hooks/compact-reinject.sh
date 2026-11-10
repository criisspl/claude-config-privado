#!/usr/bin/env bash
# compact-reinject.sh — Claude Code SessionStart hook (matcher: compact)
# Tras compactar, reinyecta el primer y el último prompt reales de la persona. Requiere jq.
t=$(jq -r '.transcript_path // empty')
[ -f "$t" ] || exit 0
prompts=$(jq -r 'select(.type=="user" and (.isMeta|not) and (.message.content|type=="string") and (.message.content|startswith("<")|not) and (.message.content|startswith("/")|not) and (.message.content|startswith("This session is being continued")|not)) | .message.content[0:1500] | @json' "$t")
first=$(head -n1 <<<"$prompts")
last=$(tail -n1 <<<"$prompts")
[ -n "$first" ] || exit 0
jq -n --argjson f "$first" --argjson l "$last" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:("Tras compactar. Primer prompt de la persona: "+$f+"\nÚltimo prompt: "+$l+"\nSigue con la tarea sin pedir que repita nada.")}}'
