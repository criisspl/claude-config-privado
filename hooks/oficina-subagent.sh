#!/usr/bin/env bash
# SubagentStart/Stop: marca los subagentes activos para el panel Oficina de herdr-app.
# Un fichero por subagente: ~/.local/state/oficina/<terminal>/<agent_id> con el tipo de agente.
[ -n "$HC_TERMINAL_ID" ] || exit 0
in=$(cat)
ev=$(jq -r '.hook_event_name // empty' <<<"$in")
id=$(jq -r '.agent_id // empty' <<<"$in")
[ -n "$id" ] || exit 0
d="$HOME/.local/state/oficina/$HC_TERMINAL_ID"
case "$ev" in
  SubagentStart) mkdir -p "$d" && jq -r '.agent_type // "agente"' <<<"$in" >"$d/$id" ;;
  SubagentStop) rm -f "$d/$id"; rmdir "$d" 2>/dev/null ;;
esac
exit 0
