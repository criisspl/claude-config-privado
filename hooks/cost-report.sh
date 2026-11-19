#!/usr/bin/env bash
# cost-report.sh [días=7]               — informe de tokens por Jira y modelo (última línea por sesión).
# cost-report.sh --rama <nombre> | --jira <CLAVE> — una línea: "1,2 M tokens · 3,40 $ · 70 % Sonnet".
f="$HOME/.cache/claude-guard/cost.jsonl"
[[ -s "$f" ]] || { [[ $1 == --rama || $1 == --jira ]] && exit 0; echo "sin datos aún ($f)"; exit 0; }

if [[ ${1:-} == --rama || ${1:-} == --jira ]]; then
  [[ -n ${2:-} ]] || { echo "uso: cost-report.sh --rama <nombre> | --jira <CLAVE>" >&2; exit 1; }
  campo=${1#--}; [[ $campo == rama ]] && campo=branch
  # PRECIOS: USD por millón de tokens {input, output, cache_read, cache_write (5 min)}. Un único sitio.
  # Fuente: https://platform.claude.com/docs/en/about-claude/pricing — consultado el 2026-11-19.
  # Haiku 5.5 tiene tarifa x5 con prompts >100K por petición; aquí solo hay totales, se usa la de <=100K.
  # La salida va en dólares (sin tipo de cambio inventado).
  jq -rs --arg campo "$campo" --arg val "$2" '
    {opus:{i:4,o:20,r:0.2,w:5}, sonnet:{i:2,o:10,r:0.1,w:2.5}, haiku:{i:0.1,o:0.5,r:0.01,w:0.125}, fable:{i:8,o:40,r:0.2,w:10}} as $P
    | def fam: ascii_downcase | (capture("(?<f>opus|sonnet|haiku|fable)").f // "otro");
      def f2: (. * 100 | round) as $n | "\($n / 100 | floor),\(($n % 100) | tostring | if length < 2 then "0" + . else . end)";
    group_by(.session) | map(max_by(.ts)) | map(select(.[$campo] == $val)) | [ .[].models[] ]
    | if length == 0 then empty else
      map(. + {f: (.model | fam)} | . + {tok: (.input + .output + .cache_write),
           usd: (((.input * ($P[.f].i // 0)) + (.output * ($P[.f].o // 0)) + (.cache_read * ($P[.f].r // 0)) + (.cache_write * ($P[.f].w // 0))) / 1000000)}) as $m
      | ($m | map(.usd) | add) as $total | ($m | map(.tok) | add) as $tok
      | ($m | group_by(.f) | map({f: .[0].f, usd: (map(.usd) | add)}) | max_by(.usd)) as $top
      | (if $tok >= 1000000 then (($tok / 100000 | round) / 10 | tostring | sub("\\."; ",")) + " M" else (($tok / 1000 | round) | tostring) + " k" end) as $t
      | "\($t) tokens · \($total | f2) $" + (if $total > 0 then " · \(($top.usd * 100 / $total) | round) % \($top.f | (.[0:1] | ascii_upcase) + .[1:])" else "" end)
        + (if ($m | any(.f == "otro")) then " · hay modelos sin precio" else "" end)
      end' "$f"
  exit 0
fi

d=${1:-7}
since=$(date -d "-$d days" +%Y-%m-%d)
jq -rs --arg since "$since" '
  map(select(.ts >= $since)) | group_by(.session) | map(max_by(.ts))
  | map(.jira as $j | .models[] | {jira:(if $j=="" then "sin-ticket" else $j end), model, t:(.input+.output+.cache_write), out:.output, cr:.cache_read})
  | group_by([.jira,.model]) | map({jira:.[0].jira, model:.[0].model, nuevos:(map(.t)|add), salida:(map(.out)|add), cache_read:(map(.cr)|add)})
  | sort_by(-.nuevos) | (["JIRA","MODELO","NUEVOS(in+out+cache_w)","SALIDA","CACHE_READ"]|@tsv), (.[]|[.jira,.model,.nuevos,.salida,.cache_read]|@tsv)' "$f" | column -t -s$'\t'
