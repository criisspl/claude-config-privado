---
name: retro
description: Use when the user asks for the weekly retro of how Claude Code was used, covering spend by model, expensive sessions and what the guard hooks blocked.
disable-model-invocation: true
model: sonnet
---

Retro semanal de uso de Claude Code. Solo lees y propones; no cambies nada sin que te diga que sí.

1. Gasto: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/cost-report.sh" 7` (tokens por ticket y modelo) y, para el detalle, `~/.cache/claude-guard/cost.jsonl` (una línea por Stop, acumulada; vale la última por `session`; últimos 7 días). Si no existe, dilo y para.
2. Bloqueos: `~/.cache/claude-guard/bloqueos.jsonl` (`{ts,hook,motivo,cwd}`; solo rm-safety, protect-config y read-guard) y, si hace falta, `observe.log`. Cuenta por hook y motivo. Sin fichero = aún no hay datos (los hooks lo crean al bloquear).
3. Calcula: % del gasto por modelo (usa `cost-report.sh --jira X` o `--rama X` para el coste de una sesión concreta), Opus gastado en tareas mecánicas (búsquedas, resúmenes, git, formato) que irían a `mecanico`/`buscador`/`implementador`, las 3 sesiones más caras y qué las encareció, y los hooks que más bloquean.
4. Propón 3-5 cambios accionables al `CLAUDE.md`, a `rules/` o a `agents/`, cada uno con su evidencia en una línea y un diff sugerido. Por ejemplo: una regla de delegación si Opus hace trabajo mecánico; un patrón en `.rgignore` si `read-guard` bloquea siempre la misma carpeta; una excepción o aviso si un hook molesta sin aportar.

Formato de salida:

**Resumen:** tokens totales · % por modelo · nº de bloqueos

**Sesiones caras:** hasta 3, con ticket/rama y motivo probable

**Bloqueos:** hook · motivo · veces

**Propuestas:** numeradas, cada una con evidencia y diff

Termina preguntando cuáles aplicar.
