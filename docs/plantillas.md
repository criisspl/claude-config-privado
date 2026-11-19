# Plantillas por proyecto

Se copian a mano al proyecto que las necesite; `install.sh` no las instala.

- `templates/rules/tests.md` → `<proyecto>/.claude/rules/tests.md`. Regla con `paths:`: solo se carga al leer ficheros que encajan (aquí, tests). Es una regla de prueba: cambia los globs y el texto.
- `templates/rgignore` → `<proyecto>/.rgignore`. Evita que las búsquedas con `rg` entren en snapshots, SVG, `coverage/` y ficheros minificados. Añade lo que sea ruido en ese proyecto.
- `templates/CLAUDE.proyecto.md` → `<proyecto>/CLAUDE.md`.
