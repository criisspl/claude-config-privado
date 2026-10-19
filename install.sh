#!/usr/bin/env bash
# Instala la configuración genérica de Claude Code (ahorro de tokens) en
# $CLAUDE_CONFIG_DIR o, si no está definida, en ~/.claude. Se puede repetir.
# Extras opcionales (ver README): ./install.sh agent-skills tdd-guard ...  |  ./install.sh todo
# ./install.sh --solo-enlaces: solo rehace los enlaces (lo usa `claude-config update`).
set -euo pipefail
SOLO_ENLACES=""
if [ "${1:-}" = "--solo-enlaces" ]; then SOLO_ENLACES=1; shift; fi
EXTRAS=("$@")

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STAMP="$(date +%Y%m%d%H%M%S)"
mkdir -p "$CFG/agents" "$CFG/skills" "$CFG/hooks"
[ -n "$SOLO_ENLACES" ] || echo "→ Configuración en $CFG"

have() { command -v "$1" >/dev/null 2>&1; }

# 1. Herramientas
if [ -z "$SOLO_ENLACES" ]; then
  if ! have rtk; then
    if have brew; then brew install rtk; else echo "⚠ Falta rtk: https://www.rtk-ai.app/"; fi
  fi
  if ! have codegraph; then
    if have npm; then npm install -g @colbymchenry/codegraph; else echo "⚠ Falta codegraph (npm i -g @colbymchenry/codegraph)"; fi
  fi
  if ! have headroom; then
    if have uv; then uv tool install headroom-ai; else echo "⚠ Falta headroom (uv tool install headroom-ai)"; fi
  fi
fi

# 2. Ficheros enlazados al repo (un git pull los actualiza)
link() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.bak-$STAMP"
    echo "  copia de seguridad: $dst.bak-$STAMP"
  fi
  [ -L "$dst" ] || echo "  + $dst"
  ln -sfn "$src" "$dst"
}
link "$REPO/CLAUDE.md" "$CFG/CLAUDE.md"
link "$REPO/RTK.md" "$CFG/RTK.md"
for f in "$REPO"/agents/*.md; do link "$f" "$CFG/agents/$(basename "$f")"; done
for f in "$REPO"/hooks/*.sh; do link "$f" "$CFG/hooks/$(basename "$f")"; done
for d in "$REPO"/skills/*/; do d="${d%/}"; link "$d" "$CFG/skills/$(basename "$d")"; done
# Comando claude-config (paquetes por proyecto)
BIN="${CLAUDE_CONFIG_BIN:-$HOME/.local/bin}"
mkdir -p "$BIN"
link "$REPO/bin/claude-config.mjs" "$BIN/claude-config"
[ -n "$SOLO_ENLACES" ] || case ":$PATH:" in *":$BIN:"*) ;; *) echo "⚠ Añade $BIN a tu PATH para usar el comando claude-config" ;; esac
# Enlaces a cosas que ya no están en el repo (p. ej. skills retiradas)
for l in "$CFG"/skills/* "$CFG"/agents/*; do
  if [ -L "$l" ] && [ ! -e "$l" ]; then
    case "$(readlink "$l")" in "$REPO"/*) rm "$l"; echo "  quitado: $l" ;; esac
  fi
done
[ -z "$SOLO_ENLACES" ] || exit 0

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
                # Grupos de hooks: fusionar con el del mismo matcher en vez de duplicarlo
                same = next((x for x in a[k] if isinstance(item, dict) and "hooks" in item
                             and isinstance(x, dict) and x.get("matcher") == item.get("matcher")), None)
                if same is not None:
                    same["hooks"] += [h for h in item["hooks"] if h not in same["hooks"]]
                elif item not in a[k]:
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

  # 5. Plugins base
  plugin() { # <marketplace> [plugin@marketplace]
    claude plugin marketplace add "$1" >/dev/null 2>&1 || true
    if [ -n "${2:-}" ]; then
      claude plugin install -y "$2" >/dev/null 2>&1 || echo "⚠ No se pudo instalar $2 (hazlo con /plugin)"
    fi
  }
  plugin JuliusBrussee/caveman caveman@caveman
  plugin DietrichGebert/ponytail ponytail@ponytail

  # 6. Extras opcionales: solo los que se pidan (cada skill instalada ocupa contexto)
  quiero() { local e; for e in ${EXTRAS[@]+"${EXTRAS[@]}"}; do if [ "$e" = "$1" ] || [ "$e" = todo ]; then return 0; fi; done; return 1; }
  if quiero agent-skills; then plugin addyosmani/agent-skills agent-skills@addy-agent-skills; fi
  if quiero anthropic-skills; then
    plugin anthropics/skills document-skills@anthropic-agent-skills
  fi
  if quiero ui-ux; then plugin nextlevelbuilder/ui-ux-pro-max-skill ui-ux-pro-max@ui-ux-pro-max-skill; fi
  if quiero tdd-guard; then
    plugin nizos/tdd-guard tdd-guard@tdd-guard
    echo "  tdd-guard: ejecuta /tdd-guard:setup en cada proyecto donde lo quieras"
  fi
  if quiero trailofbits; then
    plugin trailofbits/skills
    echo "  trailofbits: elige los plugins que quieras con /plugin"
  fi
  if quiero mobile-mcp; then
    claude mcp get mobile-mcp >/dev/null 2>&1 ||
      claude mcp add -e MOBILEMCP_DISABLE_TELEMETRY=1 -s user mobile-mcp -- npx -y @mobilenext/mobile-mcp@1.0.11
  fi
  if quiero dev-browser; then
    have dev-browser || npm install -g dev-browser@0.2.9 || echo "⚠ No se pudo instalar dev-browser"
    claude mcp get dev-browser >/dev/null 2>&1 ||
      claude mcp add -s user dev-browser -- dev-browser mcp --headless
  fi
  if quiero vercel; then npx -y skills add vercel-labs/agent-skills || echo "⚠ No se pudieron añadir las skills de Vercel"; fi
else
  echo "⚠ No encuentro el comando claude: añade los MCP y plugins a mano"
fi

echo "✓ Listo. Abre una sesión nueva de Claude Code para que se apliquen."
