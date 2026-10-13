# Forma de trabajar

- Español informal; respuestas cortas y al grano.
- **Validar antes de construir:** si la petición es ambigua o depende de algo que no sé si la herramienta permite, comprobar que es posible y enseñar en 2–3 líneas lo que haría, y esperar el ok. Si no es posible, decirlo claro y no ofrecer sucedáneos uno tras otro.
- **Verificar antes de dar algo por hecho:** lint, tipos, tests y build del repo (los scripts que tenga). En cambios de UI, abrir la página en local y comprobarla. Si algo no se pudo verificar, decirlo.

# Ahorro de tokens

- Modelo por defecto `opusplan` (Opus planifica, Sonnet ejecuta).
- Delegar en el modelo más barato que dé la calidad suficiente, y decir en una línea a quién y por qué:
  - Opus (yo): planificar, decidir enfoque, depurar cosas raras, revisar cambios críticos.
  - Sonnet → agente `implementador`: escribir código con un plan ya acordado.
  - Haiku → agente `mecanico`: tareas mecánicas, resúmenes, buscar datos.
- Tarea nueva con la conversación ya cargada de otra cosa: pedir `/clear` antes de empezar (no puedo ejecutarlo yo). Si es la misma tarea y pasa de ~100k tokens, sugerir `/compact`.
- Para entender o localizar código, CodeGraph primero (si hay `.codegraph/`); leer ficheros grandes con `offset`/`limit` y no releer lo ya leído.

@RTK.md
