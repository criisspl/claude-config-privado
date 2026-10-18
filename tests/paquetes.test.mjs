import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FIN, INICIO, aplicar, cambiosEntre, catalogo, detectar, leerLock, modificados } from "../lib/paquetes.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cc-"));
function escribir(base, ficheros) {
  for (const [rel, txt] of Object.entries(ficheros)) {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.writeFileSync(path.join(base, rel), typeof txt === "string" ? txt : JSON.stringify(txt));
  }
}

/** Librería de juguete con tres paquetes. */
function libreria(ver = "1.0.0") {
  const lib = tmp();
  escribir(lib, {
    VERSION: ver + "\n",
    "CHANGELOG.md": "# Cambios\n\n## 1.1.0\n\n- Nuevo react.\n\n## 1.0.0\n\n- Primera.\n",
    "templates/CLAUDE.proyecto.md": "# CLAUDE.md\n\nPlantilla.\n",
    "packs/react/pack.json": { nombre: "react", descripcion: "React", detecta: [{ npm: "react" }], requiere: [] },
    "packs/react/claude.md": "- Regla de react.",
    "packs/react/skills/react/SKILL.md": "react v1",
    "packs/nextjs/pack.json": { nombre: "nextjs", descripcion: "Next", detecta: [{ npm: "next" }], requiere: ["react"] },
    "packs/nextjs/claude.md": "- Regla de next.",
    "packs/nextjs/skills/nextjs/SKILL.md": "next v1",
    "packs/java/pack.json": { nombre: "java", descripcion: "Java", detecta: [{ fichero: "pom.xml", contiene: "spring-boot" }], requiere: [] },
    "packs/java/agents/java-experto.md": "java",
  });
  return lib;
}

test("detecta por dependencia npm y añade los requisitos", () => {
  const lib = libreria();
  const p = tmp();
  escribir(p, { "package.json": { dependencies: { next: "16" } } });
  assert.deepEqual(detectar(p, catalogo(lib)), ["nextjs", "react"]);
});

test("detecta por fichero y contenido", () => {
  const lib = libreria();
  const p = tmp();
  escribir(p, { "pom.xml": "<artifactId>spring-boot-starter</artifactId>" });
  assert.deepEqual(detectar(p, catalogo(lib)), ["java"]);
  const q = tmp();
  escribir(q, { "pom.xml": "<artifactId>otra</artifactId>" });
  assert.deepEqual(detectar(q, catalogo(lib)), []);
});

test("init instala ficheros, lock y bloque en un CLAUDE.md nuevo", () => {
  const lib = libreria();
  const p = tmp();
  const r = aplicar(p, lib, ["nextjs"]);
  assert.deepEqual(r.paquetes, ["nextjs", "react"]);
  assert.equal(fs.readFileSync(path.join(p, ".claude/skills/react/SKILL.md"), "utf8"), "react v1");
  const md = fs.readFileSync(path.join(p, "CLAUDE.md"), "utf8");
  assert.match(md, /Plantilla\./);
  assert.match(md, /### nextjs\n\n- Regla de next\./);
  assert.equal(leerLock(p).version, "1.0.0");
});

test("respeta lo que hay fuera del bloque y no lo duplica al reaplicar", () => {
  const lib = libreria();
  const p = tmp();
  escribir(p, { "CLAUDE.md": "# Mío\n\nAntes.\n" });
  aplicar(p, lib, ["react"]);
  fs.appendFileSync(path.join(p, "CLAUDE.md"), "\nDespués.\n");
  aplicar(p, lib, ["react"]);
  const md = fs.readFileSync(path.join(p, "CLAUDE.md"), "utf8");
  assert.equal(md.split(INICIO).length, 2);
  assert.match(md, /Antes\./);
  assert.match(md, /Después\./);
  assert.ok(md.trimEnd().endsWith(FIN));
});

test("update: actualiza lo no tocado y deja .nuevo en lo modificado", () => {
  const lib = libreria();
  const p = tmp();
  aplicar(p, lib, ["nextjs"]);
  fs.writeFileSync(path.join(p, ".claude/skills/react/SKILL.md"), "react a mi manera");
  assert.deepEqual(modificados(p), [".claude/skills/react/SKILL.md"]);
  escribir(lib, { VERSION: "1.1.0", "packs/react/skills/react/SKILL.md": "react v2", "packs/nextjs/skills/nextjs/SKILL.md": "next v2" });
  const r = aplicar(p, lib, leerLock(p).paquetes);
  assert.deepEqual(r.escritos, [".claude/skills/nextjs/SKILL.md"]);
  assert.deepEqual(r.conflictos, [".claude/skills/react/SKILL.md"]);
  assert.equal(fs.readFileSync(path.join(p, ".claude/skills/react/SKILL.md"), "utf8"), "react a mi manera");
  assert.equal(fs.readFileSync(path.join(p, ".claude/skills/react/SKILL.md.nuevo"), "utf8"), "react v2");
  assert.equal(leerLock(p).version, "1.1.0");
});

test("no pisa un fichero que ya existía antes de instalar", () => {
  const lib = libreria();
  const p = tmp();
  escribir(p, { ".claude/skills/react/SKILL.md": "mía" });
  const r = aplicar(p, lib, ["react"]);
  assert.deepEqual(r.conflictos, [".claude/skills/react/SKILL.md"]);
  assert.equal(fs.readFileSync(path.join(p, ".claude/skills/react/SKILL.md"), "utf8"), "mía");
});

test("remove borra lo no tocado, conserva lo modificado y limpia carpetas vacías", () => {
  const lib = libreria();
  const p = tmp();
  aplicar(p, lib, ["nextjs", "java"]);
  fs.writeFileSync(path.join(p, ".claude/agents/java-experto.md"), "editado");
  const r = aplicar(p, lib, ["react"]);
  assert.deepEqual(r.borrados, [".claude/skills/nextjs/SKILL.md"]);
  assert.deepEqual(r.conservados, [".claude/agents/java-experto.md"]);
  assert.ok(!fs.existsSync(path.join(p, ".claude/skills/nextjs")));
  assert.doesNotMatch(fs.readFileSync(path.join(p, "CLAUDE.md"), "utf8"), /### nextjs/);
});

test("quitar todos los paquetes elimina el bloque del CLAUDE.md", () => {
  const lib = libreria();
  const p = tmp();
  aplicar(p, lib, ["react"]);
  aplicar(p, lib, []);
  assert.ok(!fs.readFileSync(path.join(p, "CLAUDE.md"), "utf8").includes(INICIO));
});

test("añade .claude/ al .prettierignore una sola vez, y solo si existe", () => {
  const lib = libreria();
  const p = tmp();
  escribir(p, { ".prettierignore": "dist/" });
  aplicar(p, lib, ["react"]);
  aplicar(p, lib, ["react"]);
  assert.equal(fs.readFileSync(path.join(p, ".prettierignore"), "utf8"), "dist/\n.claude/\n");
  const q = tmp();
  aplicar(q, lib, ["react"]);
  assert.ok(!fs.existsSync(path.join(q, ".prettierignore")));
});

test("el bloque lleva líneas en blanco junto a los comentarios (formato de prettier)", () => {
  const p = tmp();
  aplicar(p, libreria(), ["react"]);
  const md = fs.readFileSync(path.join(p, "CLAUDE.md"), "utf8");
  assert.ok(md.includes(INICIO + "\n\n## "));
  assert.ok(md.includes("\n\n" + FIN));
});

test("falla con paquetes que no existen", () => {
  assert.throws(() => aplicar(tmp(), libreria(), ["cobol"]), /cobol/);
});

test("changelog entre versiones", () => {
  const lib = libreria("1.1.0");
  assert.match(cambiosEntre(lib, "1.0.0", "1.1.0"), /Nuevo react/);
  assert.doesNotMatch(cambiosEntre(lib, "1.0.0", "1.1.0"), /Primera/);
});
