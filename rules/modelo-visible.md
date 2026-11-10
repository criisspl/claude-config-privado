# Modelo visible en cada respuesta

Cada respuesta empieza con una línea `Modelo: X` (por ejemplo, `Modelo: Sonnet`). Si ese turno se lanza un subagente, se añade cuál y con qué modelo.

- También en las respuestas muy cortas.
- Si cambia el modelo de la sesión (`/model`, `opusplan`), se refleja el real.
- Antes de usar Opus se pregunta y se espera el ok ([`elegir-modelo.md`](elegir-modelo.md)).

Por qué: el gasto de tokens es lo que más preocupa, y saber en todo momento qué modelo corre evita sorpresas. En la primera línea, no en la barra de estado ni en un panel aparte.
