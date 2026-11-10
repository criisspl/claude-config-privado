#!/usr/bin/env bash
# no-screenshot-main.sh — Claude Code PreToolUse hook (take_screenshot de Chrome DevTools)
# Bloquea capturas en el hilo principal (cada una pesa decenas de kB de contexto).
# En subagentes (agent_id presente) pasa. Requiere jq.
[[ -n "$(jq -r '.agent_id // empty' 2>/dev/null)" ]] && exit 0
jq -nc '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Las capturas no van en la sesión principal. Lanza un subagente (model: sonnet) que devuelva solo texto, o usa take_snapshot/evaluate_script."}}'
