# Comandos de Claude Code que conviene usar

Vienen con Claude Code; no hay que instalar nada. Lista completa: <https://code.claude.com/docs/en/commands>.

## Al empezar en un proyecto (una vez)

| Comando | Para qué |
| --- | --- |
| `/run-skill-generator` | Aprende cómo se instala, arranca y prueba el proyecto y lo guarda en `.claude/skills/run-<nombre>/`. Después `/run` y `/verify` lo usan. Repetir si cambia el build o el arranque. |
| `/fewer-permission-prompts` | Mira qué comandos de solo lectura apruebas a menudo y los añade a `.claude/settings.json` del proyecto. |

## Día a día

| Comando | Para qué |
| --- | --- |
| `/plan [tarea]` | Modo plan: diseña sin tocar código. También `Shift+Tab`. |
| `/code-review` (alias `/review`) | Busca bugs en el diff o en un PR (`/code-review 123`, `--fix`). |
| `/simplify` | Limpia el código cambiado con varios agentes en paralelo. |
| `/batch <cambio>` | Reparte un cambio repetitivo en muchos agentes, cada uno en su worktree, y abre PRs. Para migraciones, no para rediseños. |
| `/loop <intervalo> <prompt>` | Repite un prompt mientras la sesión sigue abierta (vigilar un deploy, la CI, logs). |
| `/btw <pregunta>` | Pregunta lateral que no ensucia el contexto. |
| `/diff` | Ver lo que ha cambiado antes de commitear. |
| `/rewind` | Volver atrás (conversación y/o código) a un checkpoint. |
| `/debug [qué pasa]` | Diagnosticar la propia sesión (herramientas que fallan, etc.). |

## Tokens y contexto

| Comando | Para qué |
| --- | --- |
| `/context` | Qué ocupa la ventana de contexto. |
| `/compact [foco]` | Resumir la conversación al cambiar de fase. |
| `/clear` | Empezar de cero al cambiar de tarea. |
| `/usage` | Límites del plan y coste. |
| `/skill-doctor` | Coste de contexto y uso real de cada skill: desinstala las que no uses. Requiere una versión reciente. |
| `/model`, `/fast` | Cambiar de modelo o activar el modo rápido. |
