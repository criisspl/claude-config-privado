# Cambios

Cada versión publicada tiene su sección `## X.Y.Z`. Al subir `VERSION` en `main` se crea el tag `vX.Y.Z` y la release con estas notas. `claude-config update` enseña las secciones nuevas.

- **Mayor** (2.0.0): algo deja de funcionar como antes (un paquete cambia de nombre o desaparece, cambia el formato de `.claude/claude-config.json`).
- **Menor** (1.1.0): paquetes o skills nuevos, reglas nuevas.
- **Parche** (1.0.1): correcciones de texto o de errores.

## 1.9.0

- Comando nuevo `claude-config check`, para CI: sale 1 si hay ficheros instalados editados a mano o si la versión del proyecto (`.claude/claude-config.json`) no es la de la librería; los paquetes detectados y sin instalar solo avisan. `status` sigue siendo informativo.

## 1.8.4

- Lint de packs y hooks en `tests/lint.test.mjs`: una skill citada en un pack debe instalarse con él, los enlaces relativos no pueden estar rotos ni salir del pack, y un hook que usa `python3`, `node`, `npx`, `rtk`, `codegraph` o `docker` comprueba `command -v` antes.
- `db-visor`: sale sin hacer nada si falta `python3`.

## 1.8.3

- `ctx-guard`: ya no bloquea los avisos automáticos (`<task-notification>` de tareas en background y `<agent-message>` de subagentes). Solo se bloquea lo que escribes tú; antes se cortaba al agente a mitad de trabajo al llegar solo al límite.

## 1.8.2

- `git-safety`: analiza cada `push` por separado. Ya no bloquea `git push origin feature/x && git checkout main`; sí bloquea `push origin HEAD`, `@` y `x:refs/heads/main` desde main, y respeta `git -C` y `cd dir &&` para saber la rama.

## 1.8.1

- `rm-safety`: bloquea también `rm -rf /usr/*`, `/etc/*` y `/home/usuario/*` (antes pasaban). La regla de Opus ya no pide ok previo.

## 1.8.0

- herdr-app: mod `mi-db-explorer` (pestaña BBDD): elige una conexión de `~/conexionesLocal`, ve tablas, lanza SQL (escritura con confirmación) y gestiona conexiones desde un modal ⚙ (crear, editar, probar, borrar; `.bak` y permisos 600). Las claves nunca pasan por JS.

## 1.7.1

- Corrección: `db-visor` solo guarda comandos que *ejecutan* `mysql`, `psql` o `sqlite3`; antes saltaba con cualquiera que los mencionara y abría el panel de BBDD en cada Bash.

## 1.7.0

- Seguridad: `rm-safety` con el regex de ai-development-rules (`/bin/rm`, `\rm`, `$HOME/*`, sin falsos positivos SQL con `-m/--body`); `git-safety` bloquea borrar `main`, `master` y `develop` en remoto; `no-secret-leak` lee sus patrones de `hooks/lib/secret-patterns`; `opus-watch` lee el modelo con jq y cae a grep.
- Agentes: `implementador` (Edit para cambios puntuales, sin commit ni PR sin que lo pidan) y `buscador` (Bash solo de lectura).
- herdr-app: panel lateral con pestañas Avisos e Issues con contador, visor SQL `mi-db`, y mod `mis-avisos`. `/auditar` avisa cuando hay vulnerabilidades críticas o altas.
- Regla de «mis issues» personales en `CLAUDE.md`.

## 1.6.0

- Plugins: `.claude-plugin/marketplace.json` con `guardas` (hooks) y `flujo` (agentes y skills), para instalar con `/plugin install` sin clonar (ver `docs/plugins.md`).
- Seguridad: `git-safety` bloquea `+refspec`, `git -C x push origin main`, `commit -n`, `restore .`, `checkout .` y `clean -xfd`; `no-secret-leak` detecta claves de Anthropic, OpenAI, GitHub fine-grained y Slack (también en tests); `rm-safety` bloquea objetivos entrecomillados y directorios del sistema; los hooks de bloqueo fallan cerrado sin `jq`.
- Red-team: `tests/redteam/` con 309 casos en CI. Shellcheck también sobre `hooks/` y `herdr-app/cw`.
- Ajustes: `permissions.blockWritesOutsideWorkingDirectories` y `CLAUDE_CODE_SUBAGENT_EFFORT=medium`; `effort` explícito en todos los agentes.
- Coste: `cost-log` guarda la rama; `cost-report.sh --rama/--jira`; `/preparar-pr` añade el coste IA de la rama.
- Skill nueva `/retro` y registro de bloqueos en `~/.cache/claude-guard/bloqueos.jsonl`.
- Workflow `revisor-pr.yml`: revisión automática de PRs (necesita `ANTHROPIC_API_KEY`).
- Skill nueva `/auditar`: auditoría de seguridad del proyecto (npm audit, osv-scanner, semgrep, gitleaks) con arreglos propuestos, histórico y `--ci`.
- herdr-app: mod `mi-pendientes` (pendientes estilo Issues, paleta con `ctrl-shift-j`), ticket/rama/estado en pestañas y agentes, marca de spaces personales, y mod `mi-auditoria` con gráficas de vulnerabilidades y pendiente `vulnerabilidad`.

## 1.5.0

- Hooks nuevos: `read-guard` (Read: bloquea lockfiles, `dist/` y `.next/`), `stop-guard` (Stop: avisa de `console.log`, `debugger`, `.only(` añadidos y de `package.json` sin lockfile; respeta `stop_hook_active`), `permission-readonly` (PermissionRequest: aprueba `gh`, `git`, `jq`, `rg` y `wc` de solo lectura, sin encadenados ni redirecciones) y `worktree-link` (SessionStart: enlaza `.claude/settings.local.json` y `.env.local` del repo principal en los worktrees). `gh-account-check` (SessionStart: muestra la cuenta gh activa y la org del remote, y avisa si no coinciden; solo informa).
- Skills nuevas: `/pr-threads` (hilos de review sin resolver) y `/jira-ac-check` (criterios de aceptación contra el diff, solo manual).
- Agente nuevo `visual` con `mcpServers: [figma]`.
- `tests/check.sh` valida `disable-model-invocation`, `maxTurns` y `memory`.
- Plantillas: regla de ejemplo con `paths:` y `.rgignore` (ver `docs/plantillas.md`).
- `git-safety`: bloquea el push directo a `main`/`master` (`origin main`, `HEAD:main`, y `git push` sin refspec estando en `main`) y `git commit --no-verify`.
- Hook nuevo `protect-config` (Edit|Write): bloquea editar `.eslintrc*`, `tsconfig*.json`, `jest.config.*` y `vitest.config.*`; pide confirmación en `package.json`, `.github/workflows/*` y `vite.config.*`.

## 1.4.0

- Agente `revisor-pr` (Sonnet, solo lectura) y reglas de enrutado: mínimo de agentes, uno por rol aunque la tarea toque varios repos, sesión nueva solo si cambia código en otro repo.
- `herdr-app/`: mi configuración de herdr-app (mods `mi-*` de tabs, spaces, agentes, oficina comecocos, barra de uso y toasts; ajustes, atajos, temas y layout) y el script `cw`. Se copia a mano a `~/.config/herdr-app`.

## 1.3.0

- Hook `rm-safety`: frena `rm -r` sobre `/`, `~`, `.`, `..`, `*` y `DROP`/`TRUNCATE`/`drop-all`. Empieza en modo `observe` (solo registra); `hooks/rm-safety.mode` = `block` para bloquear.
- Hook `memory-lint` (SessionStart): avisa de `MEMORY.md` demasiado grande, enlaces rotos y ficheros sin indexar.
- Hooks `cost-log` (Stop) y `cost-report.sh`: registran tokens por sesión, modelo y clave Jira en `~/.cache/claude-guard/cost.jsonl` y los resumen por semana.
- Permisos: `deny` de lectura de `.env*`, `~/.ssh`, `~/.aws` y `~/.config/gh`, y de edición de `.env*` y `~/.ssh`.

## 1.2.0

- Carpeta `rules/` con la metodología: flujo plan → implementar → auditar, elegir modelo, ahorro de tokens, verificar antes de «hecho», worktrees y ramas, y cinco notas más.
- Hooks nuevos: `ctx-guard`, `compact-reinject` y `no-screenshot-main`, registrados en `settings.json`.

## 1.1.0

- Agente nuevo `buscador` (haiku, solo lectura) para localizar código sin llenar el contexto principal.
- `mecanico` con `effort: low`, `maxTurns` y `omitClaudeMd`; `implementador` con `maxTurns`.
- Regla: tests largos, logs y búsquedas amplias van a un subagente.

## 1.0.2

- `claude-config update` rehace también los enlaces globales de `~/.claude`: enlaza las skills y agentes globales nuevos y quita los retirados, sin volver a ejecutar `install.sh`.
- `claude-config update` funciona fuera de un proyecto: entonces solo actualiza lo global.

## 1.0.1

- `init`/`update` añaden `.claude/` al `.prettierignore` del proyecto (si lo tiene): lo instalado lo gestiona claude-config y el formateador del proyecto no debe reescribirlo.
- El bloque del `CLAUDE.md` lleva las líneas en blanco que pide prettier.

## 1.0.0

- Comando `claude-config` (`init`, `add`, `remove`, `update`, `status`, `list`, `version`) para instalar en cada proyecto los paquetes de su tecnología.
- Paquetes: `typescript`, `zod`, `vitest`, `playwright`, `react`, `vite`, `tailwind`, `nextjs`, `svelte`, `supabase`, `cloudflare-workers` e `indexeddb`.
- Configuración global (`install.sh`): reglas en `CLAUDE.md`, agentes `implementador`, `mecanico` y `experto`, skills `grill-me` y `preparar-pr`, permisos, extras opcionales.
