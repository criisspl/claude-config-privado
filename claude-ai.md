# claude.ai (chat web/app)

En el chat no hay hooks, RTK ni CLAUDE.md. Lo que hay:

## 1. Preferencias de perfil
Ajustes → Perfil → "¿Qué preferencias debe tener en cuenta Claude?". Pegar:

```
Responde en español informal, corto y al grano. Sin introducciones, sin repetir mi pregunta ni resumir al final. Si basta con una frase, una frase. Código: solo el fragmento que cambia, no el fichero entero, salvo que lo pida. Si algo es ambiguo, pregunta antes de escribir una respuesta larga.
```

## 2. Skills de la cuenta
Las de `skills/` también existen en el chat (`grill-me`, `revisar`, `limpiar`, `preparar-pr`), más `plan` y `caveman`, que en Claude Code no hacen falta: hay plan mode y el plugin caveman.

Para subir una skill nueva al chat, quítale del frontmatter todo menos `name` y `description`. claude.ai rechaza `model`, `argument-hint` y `disable-model-invocation`, en lugar de ignorarlos.

## 3. Plugins
- Activos y útiles: Superpowers, Engineering, Design, GitHub, modern-web-guidance.
- Desactivar los que no se usan (Ajustes → Plugins): cada skill instalada ocupa contexto y puede saltar cuando no toca.

## 4. Memoria
- En las preferencias guardadas: las reglas de código (pensar antes, lo más simple, cambios quirúrgicos, verificar) y las de tokens (preguntas simples directas; tareas complejas con plan y subagentes del modelo adecuado).
- Un Proyecto por tema (finanzas, empleo, cada app) con su memoria separada, para que no se mezclen.

## 5. Hábitos
- Un chat nuevo por tema: cada mensaje reenvía toda la conversación anterior.
- Cuando un chat se alargue, pide un resumen y sigue en un chat nuevo pegándolo.
- Documentos que usas a menudo: en un Proyecto, no pegados en cada chat.
- Editar el mensaje que salió mal en vez de añadir "no, eso no".
- Activar búsqueda web, investigación o herramientas solo cuando hagan falta.
