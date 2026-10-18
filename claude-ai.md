# claude.ai (chat web/app)

En el chat no hay hooks, RTK ni CLAUDE.md. Lo que hay:

## 1. Preferencias de perfil
Ajustes → Perfil → "¿Qué preferencias debe tener en cuenta Claude?". Pegar:

```
Responde en español informal, corto y al grano. Sin introducciones, sin repetir mi pregunta ni resumir al final. Si basta con una frase, una frase. Código: solo el fragmento que cambia, no el fichero entero, salvo que lo pida. Si algo es ambiguo, pregunta antes de escribir una respuesta larga.
```

## 2. Skills de la cuenta
En el chat están `grill-me` y `preparar-pr` (las de `skills/`), más `revisar`, `limpiar`, `plan` y `caveman`, que en Claude Code no hacen falta porque ya existen `/code-review`, `/simplify`, plan mode y el plugin caveman.

Para subir una skill nueva al chat, quítale del frontmatter todo menos `name` y `description`. claude.ai rechaza `model`, `argument-hint` y `disable-model-invocation`, en lugar de ignorarlos.

## 3. Plugins
- Activos y útiles: zizi-skills, Engineering, Design, GitHub, modern-web-guidance.
- Superpowers desactivado: duplica TDD, debugging y planes de zizi-skills y fuerza el brainstorming.
- Desactivar los que no se usan (Ajustes → Plugins): cada skill instalada ocupa contexto y puede saltar cuando no toca.

## 4. Equivalentes de lo que solo existe en Claude Code

| En Claude Code | En el chat |
| --- | --- |
| `/plan`, `opusplan` | Skill `plan`, o pedir "haz un plan". El modelo lo eliges en el selector. |
| `/code-review`, `/simplify` | Skills `revisar` y `limpiar` (no uses también `engineering:code-review`: hace lo mismo). |
| `/batch` | Pedir que reparta el trabajo en subagentes en paralelo (o el plugin agent-army para trabajos grandes). |
| `/loop` | Tareas programadas: "revisa X cada hora / mañana a las 9". |
| `/run-skill-generator` | Skill `project-config` (zizi-skills): apunta cómo se instala, arranca y prueba cada repo. O el `CLAUDE.md` del repo. |
| `/fewer-permission-prompts` | No aplica: aprobar con "permitir siempre" cuando salga el aviso. |
| `/skill-doctor`, `/context` | Skill `explain-usage` (en qué se fueron los tokens de la sesión) y desactivar plugins que no uses. |
| `/btw`, `/rewind`, `/compact` | Preguntar sin más; editar el mensaje que salió mal; chat nuevo con un resumen. |
| addyosmani/agent-skills | Ya cubierto por zizi-skills (mismas skills: planning, tdd, debugging, source-driven-development, security-and-hardening…). |
| tdd-guard | Skill `zizi-skills:tdd-skill` (guía, pero no bloquea). |
| ui-ux-pro-max | Plugin Design, skill `frontend-design` y `zizi-skills:design-guide`. |
| trailofbits | `zizi-skills:security-and-hardening`; en el directorio de plugins, *finecomb* (auditoría de seguridad). |
| dev-browser | Navegador integrado o Claude en Chrome: abre tu app y la comprueba. |
| mobile-mcp | Sin equivalente directo. Para la PWA, el navegador integrado en vista móvil; para emuladores, uso del ordenador desde la app de escritorio con el emulador abierto. |
| RTK, CodeGraph, headroom, hooks | No aplican: el chat no ejecuta comandos en tu máquina ni tiene hooks. |
| agnix | Corre en la CI de este repo; en el chat, pedir "pasa agnix al repo". |

## 5. Memoria
- En las preferencias guardadas: las reglas de código (pensar antes, lo más simple, cambios quirúrgicos, verificar) y las de tokens (preguntas simples directas; tareas complejas con plan y subagentes del modelo adecuado).
- Un Proyecto por tema (finanzas, empleo, cada app) con su memoria separada, para que no se mezclen.

## 6. Hábitos
- Un chat nuevo por tema: cada mensaje reenvía toda la conversación anterior.
- Cuando un chat se alargue, pide un resumen y sigue en un chat nuevo pegándolo.
- Documentos que usas a menudo: en un Proyecto, no pegados en cada chat.
- Editar el mensaje que salió mal en vez de añadir "no, eso no".
- Activar búsqueda web, investigación o herramientas solo cuando hagan falta.
