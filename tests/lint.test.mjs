import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lint } from "./lint.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Repo mínimo en una carpeta temporal: `ficheros` es { ruta: contenido }. */
function repo(ficheros) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-"));
  for (const [rel, texto] of Object.entries(ficheros)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), texto);
  }
  return dir;
}
const pack = (requiere = []) => JSON.stringify({ nombre: "a", descripcion: "x", detecta: [{ npm: "a" }], requiere });

test("el repo real pasa el lint", () => {
  assert.deepEqual(lint(REPO), []);
});

test("skill citada que no existe", () => {
  const dir = repo({ "packs/a/pack.json": pack(), "packs/a/claude.md": "Usa la skill `fantasma`." });
  assert.match(lint(dir).join("\n"), /fantasma/);
});

test("skill citada que sí existe: global, del pack o de un requisito", () => {
  const dir = repo({
    "skills/global/SKILL.md": "x",
    "packs/a/pack.json": pack(["b"]),
    "packs/a/claude.md": "Usa `/global`, la skill `propia` y `/ajena`.",
    "packs/a/skills/propia/SKILL.md": "x",
    "packs/b/pack.json": pack(),
    "packs/b/skills/ajena/SKILL.md": "x",
  });
  assert.deepEqual(lint(dir), []);
});

test("skill de un pack que el pack no requiere", () => {
  const dir = repo({
    "packs/a/pack.json": pack(),
    "packs/a/claude.md": "Usa `/ajena`.",
    "packs/b/pack.json": pack(),
    "packs/b/skills/ajena/SKILL.md": "x",
  });
  assert.match(lint(dir).join("\n"), /ajena/);
});

test("enlace relativo roto o fuera del pack", () => {
  const dir = repo({
    "packs/a/pack.json": pack(),
    "packs/a/claude.md": "[roto](nada.md) [fuera](../b/pack.json) [bien](otro.md) [web](https://x.es) [ancla](#a)",
    "packs/a/otro.md": "x",
    "packs/b/pack.json": pack(),
  });
  const salida = lint(dir);
  assert.equal(salida.length, 2);
  assert.match(salida.join("\n"), /nada\.md/);
  assert.match(salida.join("\n"), /\.\.\/b\/pack\.json/);
});

test("hook que usa una herramienta opcional sin command -v", () => {
  const dir = repo({
    "hooks/mal.sh": "#!/bin/bash\n# node en un comentario\nexec python3 -c 'x'\n",
    "hooks/bien.sh": "#!/bin/bash\ncommand -v python3 >/dev/null || exit 0\npython3 -c 'x'\n",
  });
  const salida = lint(dir);
  assert.equal(salida.length, 1);
  assert.match(salida[0], /mal\.sh.*python3/);
});
