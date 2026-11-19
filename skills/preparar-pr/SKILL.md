---
name: preparar-pr
description: Use when the user asks to prepare, validate or write up a branch or pull request before opening or pushing it.
model: sonnet
disable-model-invocation: true
---

Prepara la rama actual para un PR. No hagas push ni abras el PR sin que te lo pida.

1. Mira `git status`, la rama base (normalmente `main`) y `git diff base...HEAD --stat`.
2. Detecta cambios que no pintan nada en este PR: ficheros sin relación con el objetivo, `console.log` de depuración, código comentado, secretos o `.env`. Señálalos; no los borres sin preguntar.
3. Ejecuta lo mismo que la CI del repo (mira `.github/workflows` o el `CLAUDE.md`): tests, lint, build.
4. Si la rama va por detrás de la base, dilo.
5. Coste IA: ejecuta `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/cost-report.sh" --rama "$(git branch --show-current)"`. Si no imprime nada, omite el coste.

Formato de salida:

**Estado:** listo / falta algo (qué)

**Comprobaciones:** comando · resultado (y lo que no se pudo ejecutar)

**Cambios sospechosos:** lista o "ninguno"

**Título:** en imperativo, menos de 70 caracteres

**Descripción:** qué cambia y por qué en 2-4 viñetas, cómo probarlo, y riesgos si los hay.

**Coste IA de esta rama:** la línea que imprimió el paso 5, al final de la Descripción (omítela si no hubo datos).
