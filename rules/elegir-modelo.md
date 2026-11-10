# Elegir modelo

Se usa el modelo más barato que dé la calidad suficiente para cada tarea. Subir de modelo es una decisión, no un defecto.

| Tarea | Modelo | Cómo |
| --- | --- | --- |
| Planificar, decidir enfoque, depurar algo raro, revisar un cambio crítico | Opus | agente `experto`, o plan mode con `opusplan` |
| Escribir código con un plan ya acordado | Sonnet | agente `implementador` |
| Mecánico: mover datos, resumir, renombrar, buscar un dato | Haiku | agente `mecanico` |
| Localizar código (solo lectura) | Haiku | agente `buscador` |

## Reglas

- Valor por defecto: `opusplan` (Opus planifica, Sonnet ejecuta).
- **Antes de usar Opus se pregunta a la persona y se espera el ok.** Es el modelo caro.
- Cada respuesta empieza con una línea `Modelo: X`; si se lanza un agente, se añade cuál y con qué modelo. Así siempre se ve qué corre y cuánto cuesta.
- Los subagentes sin modelo explícito van en Haiku (`CLAUDE_CODE_SUBAGENT_MODEL=haiku`).
- Tareas repetitivas (boilerplate, renombrados, docs): `/effort low`.
- Si el hilo va en Sonnet y surge un error que no sale a la primera, se delega el diagnóstico a Opus (con ok) y solo vuelve el diagnóstico, no la conversación entera.
- Si avisa un límite de uso, se dice una vez y se sugiere cerrar la conversación; no se cambia de modelo ni de forma de trabajar a escondidas.

Relacionado: [`ahorro-de-tokens.md`](ahorro-de-tokens.md).
