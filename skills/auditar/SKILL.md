---
name: auditar
description: Use when the user asks to audit the security of the current project, covering vulnerable dependencies, risky code and leaked secrets, or to fix findings from the last audit.
disable-model-invocation: true
model: sonnet
---

Auditoría de seguridad del proyecto actual (cualquiera, sobre todo frontend JS/TS). No apliques ningún arreglo sin que te diga que sí, salvo con `arreglar` (abajo).

Argumento: vacío = auditar y proponer; `arreglar <id>` o `arreglar criticos` = aplicar arreglos.

## Auditar (sin argumento)

1. Ejecuta en la raíz del proyecto: `bash "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/auditar/auditar.sh"`. Lanza los escáneres que haya (npm/pnpm/yarn audit, osv-scanner, semgrep, gitleaks), escribe `.claude/auditoria/ultima.json` (lo que dibuja el panel de Herdr), añade una línea a `historial.jsonl` y asegura que `.claude/auditoria/` está en el `.gitignore`.
2. Lee `.claude/auditoria/ultima.json`. Nunca pegues valores de secretos: solo regla, fichero y línea.
3. Si en `herramientas` hay algo `no-disponible`, di cuáles y el comando para instalarlos, sin instalarlos: `brew install osv-scanner`, `brew install semgrep` (o `pipx install semgrep`), `brew install gitleaks`. Si hay `error`, dilo y qué escáner falló.
4. Por cada hallazgo `critica` o `alta`, propón el arreglo con un diff concreto:
   - dependencia: subir a `arreglo.version_fija` (diff de `package.json`; el lockfile se regenera con el gestor del proyecto). Si el salto es de versión mayor, avisa de lo que puede romper.
   - código: el cambio mínimo en `fichero:linea` (escapar o sanear la salida, quitar `eval`, usar una API segura).
   - secreto: moverlo a una variable de entorno (`.env` ignorado + `.env.example` sin valor), rotarlo en el proveedor y, si estaba en el historial, limpiarlo. Rotar es lo que cuenta: avísalo siempre.

Formato de salida:

**Resumen:** críticas · altas · medias · bajas, por tipo y herramientas usadas

**Top 5:** severidad · título · fichero:línea o paquete@versión · id

**Arreglos propuestos:** por cada crítico/alto, el diff

Termina preguntando cuáles aplicar (por id, o `arreglar criticos`).

## Arreglar (`arreglar <id>` o `arreglar criticos`)

1. Lee `ultima.json`. Si el id no existe, dilo y para. `criticos` = todos los de severidad `critica`.
2. Aplica de uno en uno, cambio mínimo. Si es código con lógica que se puede probar, escribe antes un test que falle y luego el arreglo. No reescribas ni formatees lo que no toca.
3. Tras cada arreglo, ejecuta los tests del proyecto (mira `package.json` o el `CLAUDE.md`). Si fallan, revierte ese arreglo y cuéntalo; no sigas con el siguiente sin avisar.
4. Al terminar, vuelve a lanzar `auditar.sh` para que la gráfica se actualice, y di qué se resolvió y qué queda. No hagas commit ni push.
