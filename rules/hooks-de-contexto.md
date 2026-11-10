# Hooks de contexto: `ctx-guard` y `compact-reinject`

Dos hooks que sostienen [`ahorro-de-tokens.md`](ahorro-de-tokens.md) sin depender de la memoria de nadie.

## `ctx-guard` (UserPromptSubmit)

Bloquea el prompt cuando el contexto de la sesión pasa de un límite (por defecto 140 000 tokens) y pide `/compact` (misma tarea) o `/clear` (tarea nueva). Deja pasar `/compact` y `/clear`. Cuenta solo lo posterior al último compact, porque justo después seguiría viéndose el uso antiguo. Se ajusta con `CTX_GUARD_LIMIT`.

## `compact-reinject` (SessionStart, matcher `compact`)

Tras compactar, reinyecta el primer y el último prompt reales de la persona (recortados a 1 500 caracteres), para que el resumen no pierda el objetivo original ni lo último que se pidió. Evita tener que repetir nada.

## Instalación

`install.sh` enlaza los scripts de `hooks/` y fusiona su registro en `settings.json`. Requieren `jq`.
