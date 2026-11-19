# Paquetes

Un paquete es lo que Claude necesita saber de una tecnología: reglas para el `CLAUDE.md` del proyecto y skills, agentes o comandos que se copian a su `.claude/`.

## Uso en un proyecto

```bash
cd ~/projects/gestor-finanzas
claude-config init          # detecta la tecnología e instala sus paquetes
claude-config list          # catálogo: ✓ instalado · detectado
claude-config add zod       # añadir
claude-config remove zod    # quitar
claude-config status        # versión, paquetes, ficheros que has cambiado, sugerencias
claude-config check         # para CI: sale 1 si hay ficheros editados a mano o el proyecto va por detrás de la librería
claude-config update        # baja la última versión publicada y actualiza el proyecto
```

Después de `init`, `add`, `remove` o `update`, revisa los cambios y commitéalos: `.claude/` y el `CLAUDE.md` van en el repo para que el proyecto funcione igual en cualquier máquina.

- **Lo que escribe:** `.claude/skills|agents|commands/…`, un bloque entre `<!-- claude-config:inicio -->` y `<!-- claude-config:fin -->` al final del `CLAUDE.md` (lo de fuera no se toca; si no hay `CLAUDE.md`, lo crea con `templates/CLAUDE.proyecto.md`) y `.claude/claude-config.json` con la versión, los paquetes y la huella de cada fichero.
- **Formateador:** si el proyecto tiene `.prettierignore`, se le añade `.claude/` para que prettier no reescriba lo instalado (los ejemplos de código de las skills no siguen el estilo de cada proyecto).
- **Si cambias un fichero instalado:** `update` no lo pisa; deja la versión nueva al lado como `<fichero>.nuevo` para que compares. `remove` tampoco lo borra.
- **Versiones:** `update` pone tu copia de claude-config en el último tag `vX.Y.Z` publicado. Para fijar un proyecto a una versión, no ejecutes `update` en él.

## Crear un paquete

```
packs/<id>/
├── pack.json
├── claude.md                 # reglas que se añaden al CLAUDE.md (3–6 viñetas)
├── skills/<nombre>/SKILL.md  # opcional
├── agents/<nombre>.md        # opcional
└── commands/<nombre>.md      # opcional
```

`pack.json`:

```json
{
  "nombre": "spring-boot",
  "descripcion": "Spring Boot 3: …",
  "detecta": [{ "fichero": "pom.xml", "contiene": "spring-boot" }, { "fichero": "build.gradle", "contiene": "org.springframework.boot" }],
  "requiere": ["java"]
}
```

Reglas de `detecta` (basta con que se cumpla una):

| Regla | Se cumple si… | Ejemplos |
| --- | --- | --- |
| `{ "npm": "<paquete>" }` | está en `dependencies`, `devDependencies`, `peerDependencies` u `optionalDependencies` del `package.json` | `next`, `@supabase/supabase-js` |
| `{ "fichero": "<ruta>" }` | existe ese fichero o carpeta | `go.mod`, `pyproject.toml`, `composer.json`, `supabase/migrations` |
| `{ "fichero": "<ruta>", "contiene": "<regex>" }` | el fichero existe y su contenido casa con la expresión | `pom.xml` + `spring-boot`, `pyproject.toml` + `django` |

`requiere` instala también otros paquetes (p. ej. `nextjs` → `react`).

Normas para que pase la CI:

- `nombre` igual que la carpeta; la skill se llama como su carpeta y no repite nombre con ninguna otra (de paquete ni global).
- `description` de la skill en inglés y diciendo cuándo usarla; el cuerpo en español, corto, con fuentes oficiales al final.
- En `claude.md`, solo lo que Claude haría mal sin esa línea.
- Al publicar: sube `VERSION` (menor si añades un paquete) y añade su sección en `CHANGELOG.md`.
