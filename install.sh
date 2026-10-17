#!/usr/bin/env bash
# Instala la configuración genérica de Claude Code (ahorro de tokens) en
# $CLAUDE_CONFIG_DIR o, si no está definida, en ~/.claude. Se puede repetir.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STAMP="$(date +%Y%m%d%H%M%S)"
mkdir -p "$CFG/agents" "$CFG/skills"
echo "→ Configuración en $CFG"

have() { command -v "$1" >/dev/null 2>&1; }

# 1. Herramientas
if ! have rtk; then
  if have brew; then brew install rtk; else echo "⚠ Falta rtk: https://www.rtk-ai.app/"; fi
fi
if ! have codegraph; then
  if have npm; then npm install -g @colbymchenry/codegraph; else echo "⚠ Falta codegraph (npm i -g @colbymchenry/codegraph)"; fi
fi
if ! have headroom; then
  if have uv; then uv tool install headroom-ai; else echo "⚠ Falta headroom (uv tool install headroom-ai)"; fi
fi

# 2. Ficheros enlazados al repo (un git pull los actualiza)
link() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.bak-$STAMP"
    echo "  copia de seguridad: $dst.bak-$STAMP"
  fi
  ln -sfn "$src" "$dst"
}
link "$REPO/CLAUDE.md" "$CFG/CLAUDE.md"
link "$REPO/RTK.md" "$CFG/RTK.md"
for f in "$REPO"/agents/*.md; do link "$f" "$CFG/agents/$(basename "$f")"; done
for d in "$REPO"/skills/*/; do d="${d%/}"; link "$d" "$CFG/skills/$(basename "$d")"; done

# 3. settings.json: fusiona sin pisar lo que ya haya
[ -f "$CFG/settings.json" ] && cp "$CFG/settings.json" "$CFG/settings.json.bak-$STAMP"
python3 - "$REPO/settings.json" "$CFG/settings.json" <<'PY'
import json, os, sys
src, dst = sys.argv[1:]
new = json.load(open(src))
cur = json.load(open(dst)) if os.path.exists(dst) else {}

def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        elif isinstance(v, list) and isinstance(a.get(k), list):
            for item in v:
                if item not in a[k]:
                    a[k].append(item)
        else:
            a[k] = v

merge(cur, new)
json.dump(cur, open(dst, "w"), indent=2, ensure_ascii=False)
open(dst, "a").write("\n")
PY

# 4. MCP (ámbito de usuario)
if have claude; then
  claude mcp get codegraph >/dev/null 2>&1 ||
    claude mcp add-json -s user codegraph '{"type":"stdio","command":"codegraph","args":["serve","--mcp"],"alwaysLoad":true}'
  claude mcp get headroom >/dev/null 2>&1 ||
    claude mcp add-json -s user headroom '{"type":"stdio","command":"headroom","args":["mcp","serve"]}'

  # 5. Plugins
  for p in JuliusBrussee/caveman DietrichGebert/ponytail; do
    claude plugin marketplace add "$p" >/dev/null 2>&1 || true
  done
  for p in caveman@caveman ponytail@ponytail; do
    claude plugin install "$p" >/dev/null 2>&1 || echo "⚠ No se pudo instalar $p (hazlo con /plugin)"
  done
else
  echo "⚠ No encuentro el comando claude: añade los MCP y plugins a mano"
fi

echo "✓ Listo. Abre una sesión nueva de Claude Code para que se apliquen."
