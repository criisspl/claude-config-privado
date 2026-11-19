#!/usr/bin/env bash
# auditar.sh — audita la seguridad del proyecto actual (ejecutar en su raíz).
# Lanza los escáneres que haya (npm/pnpm/yarn audit, osv-scanner, semgrep, gitleaks), normaliza y escribe
# .claude/auditoria/ultima.json (contrato version 1) y una línea en historial.jsonl. No instala nada.
# Uso: auditar.sh [--ci]   (--ci: sale con 1 si hay críticos nuevos respecto a la ejecución anterior)
set -uo pipefail

CI=0
for a in "$@"; do
  case "$a" in
    --ci) CI=1 ;;
    *) echo "uso: auditar.sh [--ci]" >&2; exit 2 ;;
  esac
done
command -v jq >/dev/null 2>&1 || { echo "auditar: hace falta jq" >&2; exit 2; }

PROY="$PWD"
OUT="$PROY/.claude/auditoria"
mkdir -p "$OUT" || exit 2
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
for f in npm osv semgrep gitleaks; do echo '[]' >"$T/$f.json"; done
ST_NPM=no-disponible ST_OSV=no-disponible ST_SEMGREP=no-disponible ST_GITLEAKS=no-disponible

tiene() { command -v "$1" >/dev/null 2>&1; }

# --- dependencias: npm / pnpm / yarn audit (mismo formato de salida normalizado, herramienta "npm-audit")
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ] && tiene pnpm; then PM=pnpm; LOCK=pnpm-lock.yaml
  elif [ -f yarn.lock ] && tiene yarn; then PM=yarn; LOCK=yarn.lock
  elif [ ! -f pnpm-lock.yaml ] && [ ! -f yarn.lock ] && tiene npm; then PM=npm; LOCK=package-lock.json
  else PM=""; fi
  if [ -n "$PM" ]; then
    "$PM" audit --json >"$T/npm.raw" 2>/dev/null
    case "$PM" in
      npm)
        LOCKJ='[{}]'; [ -f package-lock.json ] && LOCKJ="$(jq -c '[.]' package-lock.json 2>/dev/null || echo '[{}]')"
        if jq -e '.vulnerabilities and (.error|not)' "$T/npm.raw" >/dev/null 2>&1; then
          jq --argjson lock "$LOCKJ" --arg lock_name "$LOCK" '
            def sev: {"critical":"critica","high":"alta","moderate":"media","low":"baja","info":"baja"}[.] // "media";
            [ .vulnerabilities | to_entries[] | .value as $v | $v.fixAvailable as $fx
              | $v.via[]? | select(type=="object") | . as $a
              | { herramienta:"npm-audit", tipo:"dependencia", severidad:($a.severity|sev), titulo:$a.title,
                  fichero:$lock_name, linea:null, paquete:$a.name,
                  version:($lock[0].packages["node_modules/\($a.name)"].version // null),
                  arreglo:(if ($fx|type)=="object" then {descripcion:"Subir \($fx.name) a \($fx.version)", version_fija:$fx.version}
                           elif $fx==true then {descripcion:"Ejecutar npm audit fix", version_fija:null} else null end),
                  url:($a.url // null), regla:((($a.url // "") | split("/") | last | select(length>0)) // ($a.source|tostring)) } ]' \
            "$T/npm.raw" >"$T/npm.json" && ST_NPM=ok || ST_NPM=error
        else ST_NPM=error; fi ;;
      pnpm|yarn)
        # pnpm: {"advisories":{id:{...}}}; yarn clásico: una línea JSON por aviso
        if [ "$PM" = pnpm ]; then jq -c '[.advisories // {} | .[]]' "$T/npm.raw" >"$T/adv.json" 2>/dev/null
        else jq -sc '[.[] | select(.type=="auditAdvisory") | .data.advisory]' "$T/npm.raw" >"$T/adv.json" 2>/dev/null; fi
        if [ -s "$T/adv.json" ] && jq -e 'type=="array"' "$T/adv.json" >/dev/null 2>&1; then
          jq --arg lock_name "$LOCK" '
            def sev: {"critical":"critica","high":"alta","moderate":"media","low":"baja","info":"baja"}[.] // "media";
            [ .[] | (.patched_versions // "" | select(test("^>=[0-9]")) | ltrimstr(">=")) as $fix
              | { herramienta:"npm-audit", tipo:"dependencia", severidad:(.severity|sev), titulo:.title,
                  fichero:$lock_name, linea:null, paquete:.module_name, version:(.findings[0].version // null),
                  arreglo:(if $fix then {descripcion:"Subir \(.module_name) a \($fix)", version_fija:$fix} else null end),
                  url:(.url // null), regla:(((.url // "") | split("/") | last | select(length>0)) // (.id|tostring)) } ]' \
            "$T/adv.json" >"$T/npm.json" && ST_NPM=ok || ST_NPM=error
        else ST_NPM=error; fi ;;
    esac
  fi
fi

# --- dependencias: osv-scanner
if tiene osv-scanner; then
  osv-scanner --format json -r . >"$T/osv.raw" 2>/dev/null
  rc=$?
  if jq -e '.results' "$T/osv.raw" >/dev/null 2>&1; then
    jq --arg pwd "$PROY/" '
      def ghsa: ([.id] + (.aliases // [])) | map(select(startswith("GHSA-"))) | first // .id;
      [ .results[]? | (.source.path | ltrimstr($pwd)) as $src | .packages[]? | . as $pk | .package as $p
        | $pk.vulnerabilities[]? | . as $v
        | (($v.database_specific.severity // "") | ascii_upcase) as $ds
        | (try (($pk.groups // []) | map(select(.ids | index($v.id))) | .[0].max_severity | tonumber) catch null) as $score
        | { herramienta:"osv-scanner", tipo:"dependencia",
            severidad:(if $ds=="CRITICAL" then "critica" elif $ds=="HIGH" then "alta" elif ($ds=="MODERATE" or $ds=="MEDIUM") then "media" elif $ds=="LOW" then "baja"
                       elif $score != null then (if $score>=9 then "critica" elif $score>=7 then "alta" elif $score>=4 then "media" else "baja" end) else "media" end),
            titulo:($v.summary // $v.id), fichero:$src, linea:null, paquete:$p.name, version:$p.version,
            arreglo:(([$v.affected[]? | select(.package.name==$p.name) | .ranges[]? | .events[]? | .fixed // empty] | first) as $f
                     | if $f then {descripcion:"Subir \($p.name) a \($f)", version_fija:$f} else null end),
            url:"https://osv.dev/\($v.id)", regla:($v|ghsa) } ]' \
      "$T/osv.raw" >"$T/osv.json" && ST_OSV=ok || ST_OSV=error
  elif [ "$rc" -eq 128 ]; then ST_OSV=ok   # nada que escanear
  else ST_OSV=error; fi
fi

# --- código: semgrep (solo si está instalado)
if tiene semgrep; then
  semgrep --config auto --json --quiet >"$T/semgrep.raw" 2>/dev/null
  if jq -e '.results' "$T/semgrep.raw" >/dev/null 2>&1; then
    jq '[ .results[] | { herramienta:"semgrep", tipo:"codigo",
          severidad:({"ERROR":"alta","WARNING":"media","INFO":"baja"}[.extra.severity] // "media"),
          titulo:((.extra.message // .check_id) | split("\n")[0] | .[0:200]), fichero:.path, linea:.start.line,
          paquete:null, version:null,
          arreglo:(if .extra.fix then {descripcion:"Sustituir por: \(.extra.fix)", version_fija:null} else null end),
          url:(.extra.metadata.references[0]? // null), regla:.check_id } ]' \
      "$T/semgrep.raw" >"$T/semgrep.json" && ST_SEMGREP=ok || ST_SEMGREP=error
  else ST_SEMGREP=error; fi
fi

# --- secretos: gitleaks (redactado; solo regla, fichero y línea: jamás Secret ni Match)
if tiene gitleaks; then
  GL=(detect --report-format json --report-path - --redact)
  git rev-parse --git-dir >/dev/null 2>&1 || GL+=(--no-git)
  gitleaks "${GL[@]}" >"$T/gl.raw" 2>/dev/null
  if jq -e 'type=="array" or .==null' "$T/gl.raw" >/dev/null 2>&1; then
    jq '[ (. // [])[] | { herramienta:"gitleaks", tipo:"secreto", severidad:"critica",
          titulo:"\(.Description // .RuleID) (\(.RuleID))", fichero:.File, linea:.StartLine, paquete:null, version:null,
          arreglo:{descripcion:"Mover el secreto a una variable de entorno, rotarlo y quitarlo del historial", version_fija:null},
          url:null, regla:.RuleID } ]' "$T/gl.raw" >"$T/gitleaks.json" && ST_GITLEAKS=ok || ST_GITLEAKS=error
  else ST_GITLEAKS=error; fi
fi

# --- unir, deduplicar (mismo paquete+advisory) y poner ids estables
jq -s '
  def rank: {"critica":0,"alta":1,"media":2,"baja":3}[.];
  add
  | map(. + {clave: ([.herramienta,.regla,.fichero,.linea,.paquete] | map(tostring) | join("|"))})
  | map(. + {dk: (if .tipo=="dependencia" then "\(.paquete)|\(.regla)" else .clave end)})
  | reduce .[] as $h ([]; if any(.[]; .dk==$h.dk) then . else . + [$h] end)
  | sort_by([(.severidad|rank), .tipo, .fichero, .linea])' \
  "$T/npm.json" "$T/osv.json" "$T/semgrep.json" "$T/gitleaks.json" >"$T/todos.json" || { echo "auditar: no pude unir los resultados" >&2; exit 2; }

: >"$T/con_id.jsonl"
while IFS= read -r linea; do
  clave="$(jq -r .clave <<<"$linea")"
  id="$(printf '%s' "$clave" | sha1sum | cut -c1-10)"
  jq -c --arg id "$id" '{id:$id} + del(.clave,.dk,.regla)' <<<"$linea" >>"$T/con_id.jsonl"
done < <(jq -c '.[]' "$T/todos.json")

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RAMA="$(git branch --show-current 2>/dev/null)"; [ -n "$RAMA" ] || RAMA="desconocida"

jq -s --arg ts "$TS" --arg proyecto "$(basename "$PROY")" --arg rama "$RAMA" \
  --arg npm "$ST_NPM" --arg osv "$ST_OSV" --arg semgrep "$ST_SEMGREP" --arg gitleaks "$ST_GITLEAKS" '
  . as $h | {
    version:1, ts:$ts, proyecto:$proyecto, rama:$rama,
    herramientas:{"npm-audit":$npm, "osv-scanner":$osv, semgrep:$semgrep, gitleaks:$gitleaks},
    resumen:{critica:([$h[]|select(.severidad=="critica")]|length), alta:([$h[]|select(.severidad=="alta")]|length),
             media:([$h[]|select(.severidad=="media")]|length), baja:([$h[]|select(.severidad=="baja")]|length)},
    por_tipo:{dependencia:([$h[]|select(.tipo=="dependencia")]|length), codigo:([$h[]|select(.tipo=="codigo")]|length),
              secreto:([$h[]|select(.tipo=="secreto")]|length)},
    hallazgos:$h }' "$T/con_id.jsonl" >"$T/ultima.json" || { echo "auditar: no pude escribir el resultado" >&2; exit 2; }

# críticos nuevos respecto a la ejecución anterior (por id), antes de sobrescribir
PREV='[]'; [ -f "$OUT/ultima.json" ] && PREV="$(jq -c '[.hallazgos[]?.id]' "$OUT/ultima.json" 2>/dev/null || echo '[]')"
NUEVOS="$(jq -r --argjson prev "$PREV" '.hallazgos[] | select(.severidad=="critica" and (.id as $i | $prev | index($i) | not)) | "\(.id) \(.titulo)"' "$T/ultima.json")"

mv "$T/ultima.json" "$OUT/ultima.json"
jq -c '{ts, resumen, total:(.hallazgos|length)}' "$OUT/ultima.json" >>"$OUT/historial.jsonl"

# .claude/auditoria/ fuera de git
if ! grep -qxE '/?\.claude/auditoria/?' "$PROY/.gitignore" 2>/dev/null; then
  { [ -s "$PROY/.gitignore" ] && [ -n "$(tail -c1 "$PROY/.gitignore")" ] && echo; echo ".claude/auditoria/"; } >>"$PROY/.gitignore"
fi

jq -r '"Auditoría: \(.resumen.critica) críticas, \(.resumen.alta) altas, \(.resumen.media) medias, \(.resumen.baja) bajas"
  + " | herramientas: " + ([.herramientas | to_entries[] | "\(.key)=\(.value)"] | join(" "))' "$OUT/ultima.json"
echo "Resultado: ${OUT#"$PROY"/}/ultima.json"

if [ "$CI" -eq 1 ] && [ -n "$NUEVOS" ]; then
  echo "Críticos nuevos:" >&2
  echo "$NUEVOS" >&2
  exit 1
fi
exit 0
