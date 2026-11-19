# Ahorro de tokens

Cada turno vuelve a pagar todo el contexto acumulado. Casi todo el ahorro sale de mantenerlo pequeño.

## Contexto

- Tarea nueva con la conversación cargada de otra cosa: `/clear` antes de empezar (el modelo no puede ejecutarlo; lo recuerda una vez al inicio de la sesión).
- Misma tarea y el contexto pasa de ~100k: `/compact`. Cuesta unos 70k, así que no se repite; al cambiar de fase es mejor `/clear` con un resumen de 5–10 líneas.
- Hook opcional que lo impone: [`hooks-de-contexto.md`](hooks-de-contexto.md).

## Leer y buscar

- Entender o localizar código: CodeGraph primero (si hay `.codegraph/`).
- Ficheros grandes con `offset`/`limit`; no releer lo ya leído.
- Tests largos, logs y búsquedas amplias: a un subagente, para que al hilo principal solo vuelva el resumen.

## Escribir

- Cambios puntuales con `Edit`; no reescribir ficheros enteros.
- Código en el chat: solo el fragmento que cambia.
- Respuestas cortas: lo preguntado, sin resúmenes finales ni extras.

## Delegar

- Lo mecánico va a Haiku, el código con plan a Sonnet, Opus cuando haga falta, sin pedir ok ([`elegir-modelo.md`](elegir-modelo.md)).
- Capturas de pantalla: nunca en el hilo principal ([`capturas-en-subagente.md`](capturas-en-subagente.md)).
- Agentes en paralelo: los mínimos necesarios (máx. 5) y solo con tareas independientes.
