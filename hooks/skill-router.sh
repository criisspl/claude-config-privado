#!/usr/bin/env bash
# promptSubmit: suggests the skill and agent for a prompt. Plain grep over the table below, no LLM.
# Prints at most 2 lines; no match prints nothing. A "manual" skill is only proposed to the user, never run.
command -v jq >/dev/null || exit 0
prompt=$(jq -r '.prompt // .userPrompt // empty' 2>/dev/null)
[[ -n "$prompt" ]] || exit 0

# shortcut: the table lives here (not in a skill-router.tsv) because civikit copies one file per hook, upgrade when hooks can ship auxiliary files.
# Columns, tab-separated: regex (verb + object, case-insensitive)  skill  agent  auto|manual. Skill "-" = agent only.
table() {
  cat <<'TSV'
(refina|refinar|refine)\b.*([a-z]+-[0-9]+|ticket|historia|issue)	refine	planificador	manual
(descompon|descompón|descomponer|decompose|divide|dividir)\b.*([a-z]+-[0-9]+|epica|épica|ticket|historia)	decompose	planificador	manual
(planifica|prepara|haz)\b.*delivery	delivery	planificador	manual
(planifica|planificar|diseña)\b.*(feature|cambio|tarea|implementacion|implementación|[a-z]+-[0-9]+)	plan	planificador	auto
(implementa|implementar|desarrolla|programa)\b.*(feature|cambio|plan|componente|endpoint|[a-z]+-[0-9]+)	implement	implementador	auto
(audita|auditar|audit)\b.*(pr|rama|cambio|diff|[a-z]+-[0-9]+)	audit	revisor-pr	auto
(haz qa|qa de|prueba|testea|valida)\b.*(pr|rama|pantalla|flujo|[a-z]+-[0-9]+)	qa	revisor-pr	auto
(compara|revisa|implementa)\b.*(figma|diseño|mockup)	civitatis-ds	visual	auto
(actualiza|mueve|resume|resumen)\b.*(ticket|jira|issue|hilo|[a-z]+-[0-9]+)	-	mecanico	auto
TSV
}

n=0
while IFS=$'\t' read -r re skill agent mode && ((n < 2)); do
  grep -Eiq -- "$re" <<<"$prompt" || continue
  if [[ $skill == - ]]; then
    echo "Oficina: rol -> agente $agent"
  elif [[ $mode == manual ]]; then
    echo "Oficina: propón la skill /$skill a la usuaria, no la ejecutes; rol -> agente $agent"
  else
    echo "Oficina: usa skill $skill, rol -> agente $agent"
  fi
  n=$((n + 1))
done < <(table)
