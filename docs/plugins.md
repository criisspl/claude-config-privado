# Plugins

Vía adicional a `install.sh`: instalar partes de esta config como plugins de Claude Code, con un comando y sin clonar el repo. `install.sh` y `settings.json` siguen funcionando igual.

## Uso

```bash
claude plugin marketplace add criisspl/claude-config   # o dentro de Claude Code: /plugin marketplace add criisspl/claude-config
claude plugin install guardas@criisspl
claude plugin install flujo@criisspl
```

## Qué trae cada plugin

| Plugin | Contenido |
| --- | --- |
| `guardas` | Hooks: `git-safety`, `rm-safety`, `no-secret-leak`, `protect-config`, `read-guard`, `stop-guard`, `ctx-guard`, `compact-reinject`, `opus-watch`, `permission-readonly`, `worktree-link`, `gh-account-check`, `memory-lint`, `cost-log`. Mismos eventos y matchers que `settings.json` |
| `flujo` | Los agentes de `agents/` y las skills de `skills/` |

`herdr-app` no es de Claude Code y no va como plugin. Tampoco van los hooks que dependen de herramientas externas (`rtk`, `codegraph`) ni los de herdr.

## Cómo está montado

- `.claude-plugin/marketplace.json` declara el marketplace `criisspl` y apunta a `plugins/guardas` y `plugins/flujo`.
- Esas carpetas no duplican nada: son enlaces simbólicos a `hooks/*.sh`, `agents/` y `skills/`. Lo único propio es `plugins/guardas/hooks/hooks.json`, que usa `${CLAUDE_PLUGIN_ROOT}` en las rutas.
- Si cambias los hooks de `settings.json`, replica el cambio en `plugins/guardas/hooks/hooks.json`.

## Cosas a tener en cuenta

- No instales `guardas` si ya tienes los hooks por `install.sh`: se ejecutarían dos veces. Elige una vía.
- Los plugins no instalan `CLAUDE.md`, permisos ni `settings.json`; eso sigue siendo cosa de `install.sh`.
- Las skills y agentes de un plugin llevan el prefijo del plugin (`flujo:grill-me`).
- Para comprobar el manifiesto: `claude plugin validate .`
