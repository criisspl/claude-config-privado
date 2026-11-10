# Worktrees y ramas

## Ramas

- Una rama por cambio, con PR a `main`. Nombre: `feature/<tema>` o `bugfix/<tema>`.
- Commits pequeños, en imperativo, con Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`).
- Nunca: push directo a `main`, commitear secretos o `.env`, `push --force`.

## Worktrees

Un worktree es una copia aislada del repo en otra carpeta y otra rama. Sirve para que una tarea larga, o un agente trabajando en paralelo, no pise lo que haces en la carpeta principal.

- Una tarea que cambia código y necesita rama + PR se hace en su propio worktree.
- Dentro de un worktree se trabaja siempre ahí; no se vuelve al repo principal.
- No usar `git stash` a pelo: la pila se comparte entre worktrees. Mejor un commit WIP temporal.

## Limpieza al terminar

Cuando la PR está abierta (o mergeada) y la tarea cerrada:

1. Comprobar que no hay commits sin pushear ni cambios sin guardar.
2. Desde el repo principal (no desde dentro del worktree): `git worktree remove <ruta>` **sin** `--force`.
3. `git worktree prune`.

Si hay cambios sin commitear o sin pushear, no se borra nada: se avisa de lo que se perdería. Antes de abrir la PR, nunca se limpia.

Los hooks de seguridad de git de este repo (`git-safety`) cubren el resto de operaciones peligrosas.
