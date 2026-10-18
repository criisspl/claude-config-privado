# Cambios

Cada versión publicada tiene su sección `## X.Y.Z`. Al subir `VERSION` en `main` se crea el tag `vX.Y.Z` y la release con estas notas. `claude-config update` enseña las secciones nuevas.

- **Mayor** (2.0.0): algo deja de funcionar como antes (un paquete cambia de nombre o desaparece, cambia el formato de `.claude/claude-config.json`).
- **Menor** (1.1.0): paquetes o skills nuevos, reglas nuevas.
- **Parche** (1.0.1): correcciones de texto o de errores.

## 1.0.1

- `init`/`update` añaden `.claude/` al `.prettierignore` del proyecto (si lo tiene): lo instalado lo gestiona claude-config y el formateador del proyecto no debe reescribirlo.
- El bloque del `CLAUDE.md` lleva las líneas en blanco que pide prettier.

## 1.0.0

- Comando `claude-config` (`init`, `add`, `remove`, `update`, `status`, `list`, `version`) para instalar en cada proyecto los paquetes de su tecnología.
- Paquetes: `typescript`, `zod`, `vitest`, `playwright`, `react`, `vite`, `tailwind`, `nextjs`, `svelte`, `supabase`, `cloudflare-workers` e `indexeddb`.
- Configuración global (`install.sh`): reglas en `CLAUDE.md`, agentes `implementador`, `mecanico` y `experto`, skills `grill-me` y `preparar-pr`, permisos, extras opcionales.
