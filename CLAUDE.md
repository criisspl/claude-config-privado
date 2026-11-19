# Forma de trabajar

- Español informal; respuestas cortas y al grano. Código: solo el fragmento que cambia, salvo que pida el fichero entero.
- **Lo más simple que funcione:** nada de abstracciones, opciones o dependencias que nadie ha pedido.
- **Cambios quirúrgicos:** tocar solo lo que pide la tarea. No reformatear ni "mejorar" código de paso; si veo algo, avisarlo.
- **Validar antes de construir:** si la petición es ambigua o depende de algo que no sé si la herramienta permite, comprobar que es posible y enseñar en 2–3 líneas lo que haría, y esperar el ok. Si no es posible, decirlo claro y no ofrecer sucedáneos uno tras otro.
- **Verificar antes de dar algo por hecho:** lint, tipos, tests y build del repo (los scripts que tenga). En cambios de UI, abrir la página en local y comprobarla. Si algo no se pudo verificar, decirlo.

# Flujo

- Bug → primero un test que falle, luego el arreglo.
- Después de un cambio grande: `/code-review` (bugs) y luego `/simplify` (limpiar). Antes de abrir un PR: `/preparar-pr`. Diseño poco claro: `/grill-me`.
- Una rama por cambio y PR a `main`; commits pequeños con mensaje en imperativo.
- Nunca: push directo a `main`, commitear secretos o `.env`, borrar o debilitar tests para que pase la CI.
- Proyecto nuevo en la máquina: sugerir una vez `/run-skill-generator` y `/fewer-permission-prompts`.
- Proyecto sin `.claude/claude-config.json`: sugerir `claude-config init` (detecta la tecnología e instala sus paquetes). Si `claude-config status` dice que hay una versión publicada más nueva, sugerir `claude-config update`.

# Ahorro de tokens

- Modelo por defecto `opusplan` (Opus planifica, Sonnet ejecuta).
- Delegar en el modelo más barato que dé la calidad suficiente, y decir en una línea a quién y por qué:
  - Opus (yo): planificar, decidir enfoque, depurar cosas raras, revisar cambios críticos.
  - Sonnet → agente `implementador`: escribir código con un plan ya acordado.
  - Haiku → agente `mecanico`: tareas mecánicas, resúmenes, buscar datos.
  - Haiku → agente `buscador`: localizar código (solo lectura).
  - Opus → agente `experto`: si el hilo va en Sonnet y surge un bug raro, un error que no sale a la primera o una revisión crítica.
- Solo los agentes necesarios, el mínimo; nunca todos por defecto. Si la tarea toca varios repos, un agente por rol con todas las rutas y un único resumen compartido, no uno por proyecto.
- Sonnet → agente `revisor-pr`: revisar una PR o rama (solo lectura, devuelve solo hallazgos).
- Tarea que cambia código en otro repo, o larga: space/sesión nueva en ese repo. Lecturas y consultas puntuales: aquí, sin abrir nada. Quien trabaja en el space solo avisa de vuelta si hace falta algo (decisión, bloqueo, PR abierta).
- Tests largos, logs y búsquedas amplias: a un subagente, para que al hilo principal solo vuelva el resumen.
- Tarea nueva con la conversación ya cargada de otra cosa: pedir `/clear` antes de empezar (no puedo ejecutarlo yo). Si es la misma tarea y pasa de ~100k tokens, sugerir `/compact`.
- Para entender o localizar código, CodeGraph primero (si hay `.codegraph/`); leer ficheros grandes con `offset`/`limit` y no releer lo ya leído.

@RTK.md

# Mis issues personales

"Mis issues" = pendientes personales de Cristina en el mod `mi-issues` de herdr-app (`~/.config/herdr-app/pendientes.json`). No son tickets de Jira. Si dice «apunta en mis issues» o «qué tengo en mis issues», leer o editar ese fichero; no crear ni consultar Jira.
