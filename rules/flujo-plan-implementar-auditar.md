# Flujo: plan → implementar → auditar

Toda tarea de código, grande o pequeña, pasa por tres fases. Cambia el tamaño de cada una, no el orden.

1. **Plan.** Qué ficheros se tocan, qué enfoque y cómo se sabrá que está bien (criterios de aceptación). Si la petición es ambigua, se enseña el plan en 2–3 líneas (o una maqueta ASCII) y se **espera el ok** antes de escribir código.
2. **Implementar.** Solo lo que dice el plan, en pasos pequeños. Bug → primero un test que falle, luego el arreglo. Nada de abstracciones ni opciones que nadie ha pedido.
3. **Auditar.** Revisión del diff antes de dar nada por terminado: `/code-review` (bugs) y después `/simplify` (limpieza). Antes de abrir la PR, `/preparar-pr`. La auditoría la hace un subagente que devuelve solo los hallazgos, para no llenar el contexto principal.

## Reglas

- Parar tras el plan. Sin ok, no se implementa.
- Si en la implementación aparece algo que el plan no cubría, se vuelve al plan; no se improvisa.
- Un cambio, una rama, una PR. Commits pequeños.
- El cierre (resumen, limpieza, avisos) es mecánico: va a un modelo barato (ver [`elegir-modelo.md`](elegir-modelo.md)).
- Lo que se audita ya pasó por [`verificar-antes-de-hecho.md`](verificar-antes-de-hecho.md).
