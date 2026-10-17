# claude-config

Configuración genérica de Claude Code para gastar menos tokens: `opusplan`, RTK, CodeGraph, headroom, caveman/ponytail, agentes `implementador` (sonnet), `mecanico` (haiku) y `experto` (opus), skills `grill-me`, `revisar`, `limpiar` y `preparar-pr`, y reglas en `CLAUDE.md`. Sin nada de ninguna empresa.

Para un repo nuevo: copia `templates/CLAUDE.proyecto.md` como `CLAUDE.md` y pide a Claude que rellene el stack.

```bash
git clone https://github.com/criisspl/claude-config.git ~/projects/claude-config
~/projects/claude-config/install.sh            # en ~/.claude
CLAUDE_CONFIG_DIR=~/.claude-personal ~/projects/claude-config/install.sh   # en otro directorio
```

`CLAUDE.md`, `RTK.md`, los agentes y las skills quedan enlazados al repo: un `git pull` los actualiza. `settings.json` se fusiona (con copia de seguridad).

Para el chat de claude.ai: ver `claude-ai.md`.

## Licencia

[MIT](LICENSE)
