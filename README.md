# claude-config

Librería de configuración de Claude Code, con versiones. Dos partes:

- **Global** (`install.sh`, una vez por máquina): reglas en `CLAUDE.md` para gastar menos tokens (`opusplan`, RTK, CodeGraph, headroom, caveman/ponytail), agentes `implementador` (sonnet), `mecanico` (haiku) y `experto` (opus), skills `grill-me` y `preparar-pr` (para revisar y limpiar se usan `/code-review` y `/simplify`, que vienen de serie), permisos y extras opcionales.
- **Por proyecto** (comando `claude-config`): detecta la tecnología del proyecto e instala en su `.claude/` los paquetes que le tocan, con reglas, skills y agentes; `claude-config update` lo pone al día con la última versión.

Sin nada de ninguna empresa.

## Instalar

```bash
git clone https://github.com/criisspl/claude-config.git ~/projects/claude-config
~/projects/claude-config/install.sh            # en ~/.claude
CLAUDE_CONFIG_DIR=~/.claude-personal ~/projects/claude-config/install.sh   # en otro directorio
```

Hooks: `opus-watch` (avisa si la sesión va en Opus fuera de plan mode), `git-safety` (bloquea force push, `reset --hard`, `clean -f`) y `no-secret-leak` (bloquea escribir claves). `syncClaudeAiPlugins: false` para no cargar los plugins de claude.ai en cada sesión.

`CLAUDE.md`, `RTK.md`, los agentes, las skills y los hooks quedan enlazados al repo. Para ponerlo todo al día: `claude-config update` (desde cualquier carpeta; dentro de un proyecto, actualiza también sus paquetes). `settings.json` se fusiona (con copia de seguridad) e incluye permisos para comandos de solo lectura, tests, lint y build, sin pedir confirmación; `git push` pregunta y `git push --force` y leer `.env` están bloqueados.

## Paquetes por proyecto

```bash
cd ~/projects/gestor-finanzas
claude-config init      # detecta: react, supabase, typescript, vite, vitest → los instala
claude-config update    # más adelante: baja la última versión y actualiza
```

Paquetes disponibles: `typescript`, `zod`, `vitest`, `playwright`, `react`, `vite`, `tailwind`, `nextjs`, `svelte`, `supabase`, `cloudflare-workers` e `indexeddb`. Cómo funcionan, todos los comandos y cómo crear uno nuevo (Java, Go, Python, PHP…): [`docs/paquetes.md`](docs/paquetes.md).

## Versiones

`VERSION` + [`CHANGELOG.md`](CHANGELOG.md). Al llegar a `main` un `VERSION` nuevo, una Action crea el tag `vX.Y.Z` y la release. `claude-config update` usa siempre la última release.

## Extras opcionales

No se instalan por defecto porque cada skill ocupa contexto y varios se solapan. Elige los que quieras:

```bash
~/projects/claude-config/install.sh agent-skills tdd-guard   # solo esos
~/projects/claude-config/install.sh todo                     # todos
```

| Extra | Qué es | Ojo |
| --- | --- | --- |
| `agent-skills` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills): 25 skills de ingeniería (spec → plan → build → test → review → ship) y comandos `/agent-skills:*`. | Elegido frente a Superpowers, que hace lo mismo pero es más insistente y gasta más tokens. |
| `anthropic-skills` | [anthropics/skills](https://github.com/anthropics/skills) (`document-skills`): PDF, Word, Excel y PowerPoint. Las de ejemplo no, porque se pisan con `ui-ux` y `agent-skills`. | — |
| `ui-ux` | [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): paletas, tipografías y guías UX. | Necesita Python 3. |
| `tdd-guard` | [nizos/tdd-guard](https://github.com/nizos/tdd-guard): bloquea código sin test que falle. Luego `/tdd-guard:setup` en cada proyecto. | Node 22+; añade latencia y tokens en cada edición. |
| `trailofbits` | [trailofbits/skills](https://github.com/trailofbits/skills): marketplace de auditoría de seguridad. Eliges los plugins con `/plugin`. | Licencia CC BY-SA 4.0. |
| `mobile-mcp` | [mobile-mcp](https://github.com/mobile-next/mobile-mcp): controla simuladores iOS y emuladores Android (versión fijada, telemetría desactivada). | Xcode o Android SDK con un emulador arrancado. |
| `dev-browser` | [dev-browser](https://github.com/SawyerHood/dev-browser): Claude abre un Chrome aislado y comprueba su propio trabajo (MCP headless). | macOS o Linux; no lo conectes a tu Chrome con sesiones. |
| `vercel` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills): buenas prácticas de React/Next y despliegue en Vercel. | Instalador interactivo (`npx skills add`). |

Comandos de Claude Code que ya vienen de serie y conviene usar (`/batch`, `/loop`, `/run-skill-generator`, `/fewer-permission-prompts`, `/skill-doctor`…): ver [`docs/comandos.md`](docs/comandos.md).

La CI pasa [agnix](https://github.com/agent-sh/agnix) sobre el repo para validar `CLAUDE.md`, skills y agentes; en local: `npx agnix . --target claude-code`.

Para el chat de claude.ai: ver `claude-ai.md`.

## Licencia

[MIT](LICENSE)
