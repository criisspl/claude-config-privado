#!/usr/bin/env bash
# memory-lint.sh — SessionStart: lint determinista (sin tokens) de la memoria del proyecto actual.
# Silencioso si todo está bien; si no, una línea resumen + máx. 5 detalles por stdout (entra al contexto).
# Comprueba: MEMORY.md >200 líneas o >25000 bytes, enlaces a ficheros inexistentes,
# ficheros sin indexar, [[wikilinks]] rotos y frontmatter sin name/description.
set -uo pipefail

input=$(cat 2>/dev/null || true)
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)
cwd=${cwd:-$PWD}
slug=$(printf '%s' "$cwd" | sed 's#[/.]#-#g')

dir=""
for base in "${CLAUDE_CONFIG_DIR:-}" "$HOME/.claude" "$HOME/.claude-personal"; do
  [[ -n "$base" && -d "$base/projects/$slug/memory" ]] || continue
  # Primer directorio que tenga ficheros .md
  if [[ -n "$(find "$base/projects/$slug/memory" -maxdepth 1 -name '*.md' -print -quit)" ]]; then
    dir="$base/projects/$slug/memory"; break
  fi
done
[[ -z "$dir" ]] && exit 0

issues=()
idx="$dir/MEMORY.md"
if [[ -f "$idx" ]]; then
  lines=$(wc -l < "$idx"); bytes=$(wc -c < "$idx")
  (( lines > 200 || bytes > 25000 )) && issues+=("MEMORY.md grande (${lines} líneas, ${bytes} B): solo carga ~200 líneas/25 KB")
  while IFS= read -r f; do
    [[ -f "$dir/$f" ]] || issues+=("MEMORY.md enlaza a fichero inexistente: $f")
  done < <(grep -oP '\]\(\K[^)]+\.md(?=\))' "$idx" | grep -v '^http')
else
  issues+=("falta MEMORY.md")
fi

shopt -s nullglob
for f in "$dir"/*.md; do
  b=${f##*/}; [[ "$b" == MEMORY.md ]] && continue
  [[ -f "$idx" ]] && ! grep -qF "($b)" "$idx" && issues+=("sin indexar en MEMORY.md: $b")
  head -6 "$f" | grep -q '^name:' && head -6 "$f" | grep -q '^description:' || issues+=("sin frontmatter name/description: $b")
done
while IFS= read -r w; do
  [[ -f "$dir/$w.md" ]] || issues+=("wikilink roto: [[$w]]")
done < <(cat "$dir"/*.md 2>/dev/null | grep -oP '\[\[\K[^]]+(?=\]\])' | sort -u)

(( ${#issues[@]} )) || exit 0
echo "memory-lint: ${#issues[@]} problema(s) en $dir"
printf ' - %s\n' "${issues[@]:0:5}"
(( ${#issues[@]} > 5 )) && echo " - … y $(( ${#issues[@]} - 5 )) más"
exit 0
