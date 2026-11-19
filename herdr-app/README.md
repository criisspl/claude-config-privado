# herdr-app

Mi configuración de Herdr. Se copia a `~/.config/herdr-app` (por ejemplo `cp -r herdr-app/. ~/.config/herdr-app/`) y se reinicia Herdr. Necesita `git` y `gh` (con sesión) en el PATH.

## mi-issues (nuevo; antes mi-pendientes)

- Pestaña «Issues» del panel lateral derecho, con el contador de abiertos en el botón. El bloque `issues` de la barra de estado (`barra: true`, 0 px, invisible) es el motor: cada ~60 s mira git y gh de los spaces abiertos, sin bloquear la UI.
- Paleta con `ctrl-shift-j` (modal) o la pestaña del panel: pestañas Abiertos/Cerrados (Tab), flechas y Enter, Esc para salir.
- Etiquetas automáticas: `agente-esperando`, `sin-commit`, `sin-push`, `pr-comentarios`, `ci-rojo`, `olvidado` (rama sin commits desde hace más de 3 días) y `manual`. Los automáticos se cierran solos al resolverse.
- Filtros como en GitHub: `is:open|closed`, `repo:web`, `-repo:web`, `label:ci-rojo`, `-label:manual`, `sort:oldest|newest` y texto libre. El texto libre también salta a un ticket, rama o space.
- Acciones: «Nuevo pendiente» (título, repo, etiquetas), «Cerrar pendiente» (manuales). Enter en una PR la abre en el navegador; en el resto salta al space o agente.
- Los pendientes (abiertos y cerrados, con fechas) se guardan en `~/.config/herdr-app/pendientes.json`.

## mi-auditoria (nuevo)

- Panel con la auditoría de seguridad del space activo (la escribe `/auditar` en `.claude/auditoria/` del repo): proyecto, rama, fecha, escáneres, barras por severidad y por tipo, evolución de las últimas 12 ejecuciones y lista de hallazgos.
- Ya no se abre desde Issues. `/auditar` deja un aviso en la pestaña Avisos (y toast) si hay críticas o altas; lo borra cuando llega a 0.
- Flechas para moverte; Enter en un hallazgo manda `/auditar arreglar <id>` al agente del space; «Volver a auditar» manda `/auditar`. Esc cierra. El envío usa `herdr pane send-text`, como `cw`.

## mis-avisos y panel lateral

- Pestañas «Avisos» e «Issues» en la barra de pestañas, con contador. Leen `/api/avisos` del panel (ficheros de `~/.local/state/avisos/`: bots, CatBot y `/auditar`); «Hecho» borra el aviso y el texto completo se despliega al pulsar. Los avisos con `toast: true` saltan como toast una vez.
- El bloque `avisos` del sidebar mide 0 px: solo lanza los toasts.

## mi-db (visor de consultas SQL)

- Panel inferior bajo el terminal, solo en la pestaña donde Claude lanzó la consulta, con ✕ para cerrar. Lo alimenta el hook `hooks/db-visor.sh` (PostToolUse), que escribe `~/.config/herdr-app/data/db-ultima.json`. El hook hay que registrarlo en `settings.json`.

## Otros mods

- `mi-pendientes`: panel de Jira y PRs del sidebar (del panel `127.0.0.1:4777`), con cabecera en icono y una fila por PR con icono según estado.
- `mi-cuenta`: franja de 3 px arriba y etiqueta en la barra de estado: «PERSONAL» (rosa) si el space se llama `me` o `me · …`, «TRABAJO» (naranja) en el resto.
- `mi-panel-resumen`: resumen de bots del panel, desplegado por defecto.

## Cambiados

- `mi-agents`: cada fila muestra ticket (o rama), estado en palabras y tiempo (`trabajando 12m`, `esperando 3m`, `listo 1h`).
- `mi-tabs`: cada pestaña muestra ticket (o rama) y, si trabaja o espera, el tiempo.
- Cuenta personal: los spaces que crea `cw -P` se llaman «me · …»; en tabs, agentes y pendientes se marcan en rosa con «me» o «personal».
- `keys.json`: solo una tecla nueva, `ctrl-shift-j` (abre `mi-issues`).
