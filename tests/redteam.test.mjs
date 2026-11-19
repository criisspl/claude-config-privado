import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = path.join(AQUI, "..", "hooks");

// Copia de los hooks con rm-safety en modo block, y HOME aislado (el hook escribe un log)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rt-"));
const hooks = path.join(tmp, "hooks");
fs.cpSync(HOOKS, hooks, { recursive: true });
fs.writeFileSync(path.join(hooks, "rm-safety.mode"), "block\n");
const repo = path.join(tmp, "repo");
fs.mkdirSync(repo);
spawnSync("git", ["init", "-q", "-b", "feat"], { cwd: repo });

// <<texto>> literal, <<ab*N>> repetido N veces; \n = salto de línea
const expandir = (s) => s
  .replace(/<<([^>]*)>>/g, (_, p) => { const m = p.match(/^(.+)\*(\d+)$/); return m ? m[1].repeat(Number(m[2])) : p; })
  .replace(/\\n/g, "\n");

const leer = (f) => fs.readFileSync(path.join(AQUI, "redteam", f), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));

function correr(hook, toolInput) {
  const r = spawnSync("bash", [path.join(hooks, hook)], {
    input: JSON.stringify({ tool_input: toolInput }), cwd: repo, encoding: "utf8", env: { ...process.env, HOME: tmp },
  });
  return r.status;
}

test("red-team: ningún caso se escapa ni da falso positivo", () => {
  const fugas = [], falsos = [];
  let n = 0;
  const comprobar = (esperado, status, etiqueta) => {
    n++;
    const bloquea = status === 2;
    if (esperado === "block" && !bloquea) fugas.push(etiqueta);
    if (esperado === "allow" && bloquea) falsos.push(etiqueta);
  };
  for (const [hook, esperado, comando] of leer("comandos.tsv")) {
    comprobar(esperado, correr(hook, { command: comando }), `${hook}: ${comando}`);
  }
  for (const [ruta, esperado, contenido] of leer("secretos.tsv")) {
    comprobar(esperado, correr("no-secret-leak.sh", { file_path: ruta, content: expandir(contenido) }), `${ruta}: ${contenido}`);
  }
  console.log(`${n} casos, ${fugas.length} fugas, ${falsos.length} falsos positivos`);
  if (fugas.length) console.log("FUGAS:\n  " + fugas.join("\n  "));
  if (falsos.length) console.log("FALSOS POSITIVOS:\n  " + falsos.join("\n  "));
  assert.equal(fugas.length, 0);
  assert.equal(falsos.length, 0);
});
