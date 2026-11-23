# claude-config

[![CI](https://github.com/criisspl/claude-config/actions/workflows/ci.yml/badge.svg)](https://github.com/criisspl/claude-config/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/criisspl/claude-config)](https://github.com/criisspl/claude-config/releases) ![Red-team](https://img.shields.io/badge/red--team-309%20casos%2C%200%20fugas-brightgreen)

Claude Code más seguro, más barato y más fácil de seguir:

- **Seguro:** 16 hooks frenan force push, push a `main`, `rm -rf` peligrosos, secretos en el código y ediciones de configuración. Probados en CI contra un corpus de 309 casos.
- **Barato:** cada tarea va al modelo más barato que la hace bien (Opus planifica, Sonnet implementa, Haiku lo mecánico) y cada PR dice cuánto costó.
- **Auditoría:** `/auditar` saca las vulnerabilidades del proyecto (dependencias, código y secretos), propone el arreglo de cada una y Herdr las enseña en gráficas.
- **Mejora sola:** `/retro` lee el gasto y los bloqueos de la semana y propone cambios a la config.
- **Para el equipo:** se instala como plugin con un comando; las PRs se revisan solas en CI.

```bash
/plugin marketplace add criisspl/claude-config
/plugin install guardas@criisspl    # hooks
/plugin install flujo@criisspl      # agentes y skills
```

Más detalles de los plugins en [`docs/plugins.md`](docs/plugins.md). La instalación completa (reglas, permisos, paquetes por proyecto) sigue siendo con `install.sh`:

- **Global** (`install.sh`, una vez por máquina): reglas en `CLAUDE.md` para gastar menos tokens (`opusplan`, RTK, CodeGraph, headroom, caveman/ponytail), agentes `implementador`, `revisor-pr` y `visual` (sonnet), `mecanico` y `buscador` (haiku) y `experto` (opus), skills `grill-me`, `preparar-pr`, `retro`, `pr-threads`, `jira-ac-check` y `small-safe-steps` (para revisar y limpiar se usan `/code-review` y `/simplify`, que vienen de serie), permisos y extras opcionales.
- **Por proyecto** (comando `claude-config`): detecta la tecnología del proyecto e instala en su `.claude/` los paquetes que le tocan, con reglas, skills y agentes; `claude-config update` lo pone al día con la última versión.

Opcional: `herdr-app/` guarda mi configuración de herdr-app (mods `mi-*`, ajustes, temas, layout y el script `cw`), con un panel de pendientes estilo GitHub Issues y paleta de comandos; ver [`herdr-app/README.md`](herdr-app/README.md).

Sin nada de ninguna empresa.

## Instalar

```bash
git clone https://github.com/criisspl/claude-config.git ~/projects/claude-config
~/projects/claude-config/install.sh            # en ~/.claude
CLAUDE_CONFIG_DIR=~/.claude-personal ~/projects/claude-config/install.sh   # en otro directorio
```

Hooks (detalle en [`rules/`](rules/)):

| Para qué | Hooks |
| --- | --- |
| Git y borrados | `git-safety` (force push, push a `main`, `reset --hard`, `restore .`, `clean -f`, `--no-verify`), `rm-safety` (`rm -rf` sobre `/`, `~`, directorios del sistema; `DROP`/`TRUNCATE`) |
| Secretos y config | `no-secret-leak` (claves AWS, GitHub, Anthropic, OpenAI, Slack, privadas), `protect-config` (eslint, tsconfig, configs de tests), `read-guard` (lockfiles, `dist/`, `.next/`) |
| Contexto y modelo | `ctx-guard` (para por encima de 140k tokens), `compact-reinject`, `opus-watch`, `no-screenshot-main`, `memory-lint` |
| Sesión | `permission-readonly` (aprueba `gh`/`git` de solo lectura), `worktree-link`, `gh-account-check`, `stop-guard` (`console.log`, `.only(`), `cost-log`, `oficina-subagent` |

Los hooks de bloqueo fallan cerrado si falta `jq`. La CI los pasa contra [`tests/redteam/`](tests/redteam/). `syncClaudeAiPlugins: false` para no cargar los plugins de claude.ai en cada sesión.

`CLAUDE.md`, `RTK.md`, los agentes, las skills y los hooks quedan enlazados al repo. Para ponerlo todo al día: `claude-config update` (desde cualquier carpeta; dentro de un proyecto, actualiza también sus paquetes). `settings.json` se fusiona (con copia de seguridad) e incluye permisos para comandos de solo lectura, tests, lint y build, sin pedir confirmación; `git push` pregunta y `git push --force` y leer `.env` están bloqueados.

## Metodología (`rules/`)

Cómo trabajar con IA: pocas reglas, cada una en su nota.

- [`flujo-plan-implementar-auditar`](rules/flujo-plan-implementar-auditar.md): las tres fases de toda tarea de código.
- [`elegir-modelo`](rules/elegir-modelo.md): el modelo más barato que dé la calidad suficiente.
- [`ahorro-de-tokens`](rules/ahorro-de-tokens.md): contexto pequeño, leer poco, delegar.
- [`verificar-antes-de-hecho`](rules/verificar-antes-de-hecho.md): lint, tipos, tests, build y UI.
- [`worktrees-y-ramas`](rules/worktrees-y-ramas.md): una rama por cambio y limpieza al terminar.
- [`oficina`](rules/oficina.md): roles, agente y skills; lo sugiere el hook `skill-router`.
- [`una-peticion-por-turno`](rules/una-peticion-por-turno.md), [`explicaciones-claras`](rules/explicaciones-claras.md), [`modelo-visible`](rules/modelo-visible.md).
- [`hooks-de-contexto`](rules/hooks-de-contexto.md) (`ctx-guard`, `compact-reinject`) y [`capturas-en-subagente`](rules/capturas-en-subagente.md) (`no-screenshot-main`).

## Paquetes por proyecto

```bash
cd ~/projects/gestor-finanzas
claude-config init      # detecta: react, supabase, typescript, vite, vitest → los instala
claude-config update    # más adelante: baja la última versión y actualiza
```

Paquetes disponibles: `typescript`, `zod`, `vitest`, `playwright`, `react`, `vite`, `tailwind`, `nextjs`, `svelte`, `supabase`, `cloudflare-workers` e `indexeddb`. Cómo funcionan, todos los comandos y cómo crear uno nuevo (Java, Go, Python, PHP…): [`docs/paquetes.md`](docs/paquetes.md).

## Medir y mejorar

- `hooks/cost-report.sh` resume tokens y coste por semana; `--rama <r>` o `--jira <CLAVE>` da el coste de una rama o ticket (`1,1 M tokens · 3,16 $ · 93 % Sonnet`). `/preparar-pr` lo añade a la descripción.
- `/auditar`: auditoría de seguridad del proyecto con arreglos propuestos; `--ci` falla con críticos nuevos. Detalle en [`docs/comandos.md`](docs/comandos.md).
- `/retro`: retrospectiva semanal del gasto y de los bloqueos, con 3-5 cambios propuestos.
- `.github/workflows/revisor-pr.yml`: revisa cada PR con el agente `revisor-pr` (necesita el secreto `ANTHROPIC_API_KEY`; sin él se salta).

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
