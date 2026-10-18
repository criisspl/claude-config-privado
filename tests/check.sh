#!/usr/bin/env bash
# Comprobaciones del repo: frontmatter de agentes y skills, paquetes, versión, tests del comando,
# settings.json válido e install.sh en una carpeta temporal (dos veces, para ver que se puede repetir).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fallos=0
mal() { echo "✗ $*"; fallos=$((fallos + 1)); }

# 1. Frontmatter: empieza por ---, tiene name y description, y en skills name = carpeta
for f in "$REPO"/agents/*.md "$REPO"/skills/*/SKILL.md "$REPO"/packs/*/skills/*/SKILL.md "$REPO"/packs/*/agents/*.md; do
  [ -e "$f" ] || continue
  rel="${f#"$REPO"/}"
  [ "$(head -n1 "$f")" = "---" ] || { mal "$rel: no empieza por ---"; continue; }
  fm="$(awk 'NR>1 && /^---$/ {exit} NR>1 {print}' "$f")"
  nombre="$(sed -n 's/^name: *//p' <<<"$fm")"
  [ -n "$nombre" ] || mal "$rel: falta name"
  grep -q '^description: *[^ ]' <<<"$fm" || mal "$rel: falta description"
  case "$rel" in
    skills/* | packs/*/skills/*) [ "$nombre" = "$(basename "$(dirname "$f")")" ] || mal "$rel: name ($nombre) no coincide con la carpeta" ;;
  esac
done

# 2. settings.json
python3 -m json.tool "$REPO/settings.json" >/dev/null || mal "settings.json no es JSON válido"

# 3. Paquetes: pack.json válido, nombre = carpeta, requisitos que existen, reglas de detección
#    conocidas y nombres de skills únicos (entre paquetes y con las globales)
python3 "$REPO/tests/paquetes.py" "$REPO" || mal "paquetes mal formados"

# 4. Versión: VERSION es X.Y.Z y tiene su entrada en el CHANGELOG
ver="$(tr -d '[:space:]' < "$REPO/VERSION")"
[[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || mal "VERSION no es X.Y.Z ($ver)"
grep -q "^## $ver" "$REPO/CHANGELOG.md" || mal "CHANGELOG.md no tiene la sección ## $ver"

# 5. Tests del comando claude-config
node --test "$REPO"/tests/*.test.mjs >/dev/null || mal "fallan los tests de claude-config (node --test tests/*.test.mjs)"

# 6. install.sh sin instalar herramientas: PATH mínimo (sin npm, uv, brew ni claude)
cfg="$(mktemp -d)"
trap 'rm -rf "$cfg"' EXIT
for i in 1 2; do
  PATH=/usr/bin:/bin CLAUDE_CONFIG_DIR="$cfg" CLAUDE_CONFIG_BIN="$cfg/bin" bash "$REPO/install.sh" >/dev/null || mal "install.sh falla (pasada $i)"
done
enlazado() { if [ "$(readlink "$cfg/$1" || true)" != "$REPO/$2" ]; then mal "no enlaza $1"; fi; }
enlazado CLAUDE.md CLAUDE.md
enlazado RTK.md RTK.md
enlazado bin/claude-config bin/claude-config.mjs
for f in "$REPO"/agents/*.md; do enlazado "agents/$(basename "$f")" "agents/$(basename "$f")"; done
for d in "$REPO"/skills/*/; do d="$(basename "$d")"; [ "$d" = "*" ] || enlazado "skills/$d" "skills/$d"; done
python3 - "$REPO/settings.json" "$cfg/settings.json" <<'PY' || mal "settings.json instalado no contiene lo del repo"
import json, sys
src, dst = (json.load(open(p)) for p in sys.argv[1:])
assert dst.get("model") == src.get("model")
assert all(dst["enabledPlugins"].get(k) == v for k, v in src.get("enabledPlugins", {}).items())
PY

if [ "$fallos" -gt 0 ]; then echo "$fallos fallo(s)"; exit 1; fi
echo "✓ Todo bien"
