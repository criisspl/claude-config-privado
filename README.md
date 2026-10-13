# claude-config

Configuración genérica de Claude Code para gastar menos tokens: `opusplan`, RTK, CodeGraph, headroom, caveman/ponytail, agentes `implementador` (sonnet) y `mecanico` (haiku), y reglas en `CLAUDE.md`. Sin nada de ninguna empresa.

```bash
git clone <este repo> ~/projects/claude-config
~/projects/claude-config/install.sh            # en ~/.claude
CLAUDE_CONFIG_DIR=~/.claude-personal ~/projects/claude-config/install.sh   # en otro directorio
```

`CLAUDE.md`, `RTK.md` y los agentes quedan enlazados al repo: un `git pull` los actualiza. `settings.json` se fusiona (con copia de seguridad).

Para el chat de claude.ai: ver `claude-ai.md`.
