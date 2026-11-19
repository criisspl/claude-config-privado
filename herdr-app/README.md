# herdr-app

Mi configuración de Herdr. Se copia a `~/.config/herdr-app` (por ejemplo `cp -r herdr-app/. ~/.config/herdr-app/`) y se reinicia Herdr. Necesita `git` y `gh` (con sesión) en el PATH.

## mi-pendientes (nuevo)

- Contador de pendientes abiertos en la barra de estado (bloque `pendientes` de `layouts/mi-layout.json`). Ese bloque es también el motor: cada ~60 s mira git y gh de los spaces abiertos, sin bloquear la UI.
- Paleta con `ctrl-shift-j` (o clic en el contador): pestañas Abiertos/Cerrados (Tab), flechas y Enter, Esc para salir.
- Etiquetas automáticas: `agente-esperando`, `sin-commit`, `sin-push`, `pr-comentarios`, `ci-rojo`, `olvidado` (rama sin commits desde hace más de 3 días) y `manual`. Los automáticos se cierran solos al resolverse.
- Filtros como en GitHub: `is:open|closed`, `repo:web`, `-repo:web`, `label:ci-rojo`, `-label:manual`, `sort:oldest|newest` y texto libre. El texto libre también salta a un ticket, rama o space.
- Acciones: «Nuevo pendiente» (título, repo, etiquetas), «Cerrar pendiente» (manuales) y «Abrir PR del space actual». Enter en una PR la abre en el navegador; en el resto salta al space o agente.
- Los pendientes (abiertos y cerrados, con fechas) se guardan en `~/.config/herdr-app/pendientes.json`.

## Cambiados

- `mi-agents`: cada fila muestra ticket (o rama), estado en palabras y tiempo (`trabajando 12m`, `esperando 3m`, `listo 1h`).
- `mi-tabs`: cada pestaña muestra ticket (o rama) y, si trabaja o espera, el tiempo.
- Cuenta personal: los spaces que crea `cw -P` se llaman «me · …»; en tabs, agentes y pendientes se marcan en rosa con «me» o «personal».
- `keys.json`: solo una tecla nueva, `ctrl-shift-j`.
