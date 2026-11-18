# Cambios

Cada versión publicada tiene su sección `## X.Y.Z`. Al subir `VERSION` en `main` se crea el tag `vX.Y.Z` y la release con estas notas. `claude-config update` enseña las secciones nuevas.

- **Mayor** (2.0.0): algo deja de funcionar como antes (un paquete cambia de nombre o desaparece, cambia el formato de `.claude/claude-config.json`).
- **Menor** (1.1.0): paquetes o skills nuevos, reglas nuevas.
- **Parche** (1.0.1): correcciones de texto o de errores.

## 1.5.0

- Hooks nuevos: `read-guard` (Read: bloquea lockfiles, `dist/` y `.next/`), `stop-guard` (Stop: avisa de `console.log`, `debugger`, `.only(` añadidos y de `package.json` sin lockfile; respeta `stop_hook_active`), `permission-readonly` (PermissionRequest: aprueba `gh`, `git`, `jq`, `rg` y `wc` de solo lectura, sin encadenados ni redirecciones) y `worktree-link` (SessionStart: enlaza `.claude/settings.local.json` y `.env.local` del repo principal en los worktrees).
- Skills nuevas: `/pr-threads` (hilos de review sin resolver) y `/jira-ac-check` (criterios de aceptación contra el diff, solo manual).
- Agente nuevo `visual` con `mcpServers: [figma]`.
- `tests/check.sh` valida `disable-model-invocation`, `maxTurns` y `memory`.
- Plantillas: regla de ejemplo con `paths:` y `.rgignore` (ver `docs/plantillas.md`).

## 1.4.0

- `git-safety`: bloquea el push directo a `main`/`master` (`origin main`, `HEAD:main`, y `git push` sin refspec estando en `main`) y `git commit --no-verify`.
- Hook nuevo `protect-config` (Edit|Write): bloquea editar `.eslintrc*`, `tsconfig*.json`, `jest.config.*` y `vitest.config.*`; pide confirmación en `package.json`, `.github/workflows/*` y `vite.config.*`.

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
