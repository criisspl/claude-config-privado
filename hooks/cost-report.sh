#!/usr/bin/env bash
# cost-report.sh [días=7] — informe de tokens por Jira y modelo (última línea por sesión).
f="$HOME/.cache/claude-guard/cost.jsonl"; d=${1:-7}
[[ -s "$f" ]] || { echo "sin datos aún ($f)"; exit 0; }
since=$(date -d "-$d days" +%Y-%m-%d)
jq -rs --arg since "$since" '
  map(select(.ts >= $since)) | group_by(.session) | map(max_by(.ts))
  | map(.jira as $j | .models[] | {jira:(if $j=="" then "sin-ticket" else $j end), model, t:(.input+.output+.cache_write), out:.output, cr:.cache_read})
  | group_by([.jira,.model]) | map({jira:.[0].jira, model:.[0].model, nuevos:(map(.t)|add), salida:(map(.out)|add), cache_read:(map(.cr)|add)})
  | sort_by(-.nuevos) | (["JIRA","MODELO","NUEVOS(in+out+cache_w)","SALIDA","CACHE_READ"]|@tsv), (.[]|[.jira,.model,.nuevos,.salida,.cache_read]|@tsv)' "$f" | column -t -s$'\t'
