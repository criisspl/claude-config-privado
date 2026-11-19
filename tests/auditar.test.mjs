import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, "..", "skills", "auditar", "auditar.sh");
const FIX = path.join(AQUI, "fixtures", "auditar");
const SIN_VALOR = "valor-secreto-de-prueba-no-copiar";

// Proyecto temporal + carpeta de escáneres falsos. `herramientas` mapea nombre -> fichero de salida.
function escenario(herramientas, { gitleaksTexto } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "auditar-")));
  const proy = path.join(base, "proyecto");
  const bin = path.join(base, "bin");
  fs.mkdirSync(proy);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(proy, "package.json"), '{"name":"demo"}\n');
  fs.writeFileSync(path.join(proy, "package-lock.json"), '{"packages":{"node_modules/lodash":{"version":"4.17.15"},"node_modules/minimist":{"version":"1.2.0"}}}\n');
  for (const [nombre, salida] of Object.entries(herramientas)) {
    const f = path.join(bin, nombre);
    // como los escáneres reales, salen con 1 cuando hay hallazgos
    fs.writeFileSync(f, `#!/bin/sh\ncat '${salida}'\nexit 1\n`);
    fs.chmodSync(f, 0o755);
  }
  if (gitleaksTexto) fs.writeFileSync(path.join(base, "gl.json"), gitleaksTexto);
  return { base, proy, bin };
}

const correr = ({ proy, bin }, ...args) =>
  spawnSync("/bin/bash", [SCRIPT, ...args], {
    cwd: proy,
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: proy },
  });

const leer = (proy, f) => fs.readFileSync(path.join(proy, ".claude", "auditoria", f), "utf8");
const ultima = (proy) => JSON.parse(leer(proy, "ultima.json"));
const todos = () => ({
  npm: path.join(FIX, "npm-audit.json"),
  osv: path.join(FIX, "osv-scanner.json"),
  semgrep: path.join(FIX, "semgrep.json"),
  gitleaks: path.join(FIX, "gitleaks.json"),
});
const falsos = (f) => ({ npm: f.npm, "osv-scanner": f.osv, semgrep: f.semgrep, gitleaks: f.gitleaks });

test("contrato: campos, herramientas, resumen y por_tipo", () => {
  const e = escenario(falsos(todos()));
  const r = correr(e);
  assert.equal(r.status, 0, r.stderr);
  const u = ultima(e.proy);
  assert.equal(u.version, 1);
  assert.match(u.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(u.proyecto, "proyecto");
  assert.equal(typeof u.rama, "string");
  assert.deepEqual(Object.keys(u.herramientas), ["npm-audit", "osv-scanner", "semgrep", "gitleaks"]);
  assert.deepEqual(Object.values(u.herramientas), ["ok", "ok", "ok", "ok"]);
  assert.deepEqual(Object.keys(u.resumen), ["critica", "alta", "media", "baja"]);
  assert.deepEqual(Object.keys(u.por_tipo), ["dependencia", "codigo", "secreto"]);
  for (const h of u.hallazgos) {
    assert.deepEqual(
      Object.keys(h).sort(),
      ["arreglo", "fichero", "herramienta", "id", "linea", "paquete", "severidad", "tipo", "titulo", "url", "version"],
    );
    assert.match(h.id, /^[0-9a-f]{10}$/);
    assert.ok(["critica", "alta", "media", "baja"].includes(h.severidad));
    assert.ok(["dependencia", "codigo", "secreto"].includes(h.tipo));
  }
  const ids = u.hallazgos.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, "ids únicos");
});

test("normalización de severidad, tipo y arreglo", () => {
  const e = escenario(falsos(todos()));
  correr(e);
  const u = ultima(e.proy);
  const por = (pred) => u.hallazgos.find(pred);
  const minimist = por((h) => h.paquete === "minimist");
  assert.equal(minimist.severidad, "critica");
  assert.equal(minimist.version, "1.2.0");
  assert.equal(por((h) => h.paquete === "qs").severidad, "media");
  const lodash = por((h) => h.paquete === "lodash" && h.titulo.startsWith("Command"));
  assert.equal(lodash.severidad, "alta");
  assert.deepEqual(lodash.arreglo, { descripcion: "Subir lodash a 4.17.21", version_fija: "4.17.21" });
  const xss = por((h) => h.fichero === "src/App.jsx");
  assert.equal(xss.tipo, "codigo");
  assert.equal(xss.severidad, "alta");
  assert.equal(xss.linea, 12);
  assert.equal(xss.titulo, "Usar dangerouslySetInnerHTML con datos sin sanear permite XSS.");
  assert.equal(por((h) => h.fichero === "src/util.js").severidad, "media");
  const sec = por((h) => h.tipo === "secreto");
  assert.equal(sec.severidad, "critica");
  assert.equal(sec.fichero, "src/config.js");
  assert.equal(sec.linea, 7);
  assert.deepEqual(u.por_tipo, { dependencia: 4, codigo: 2, secreto: 1 });
  assert.deepEqual(u.resumen, { critica: 2, alta: 2, media: 2, baja: 1 });
});

test("deduplica el mismo paquete y advisory entre npm audit y osv-scanner", () => {
  const e = escenario(falsos(todos()));
  correr(e);
  const u = ultima(e.proy);
  const lodashAlta = u.hallazgos.filter((h) => h.paquete === "lodash" && h.titulo.startsWith("Command"));
  assert.equal(lodashAlta.length, 1);
  assert.equal(lodashAlta[0].herramienta, "npm-audit");
  // el otro advisory de lodash (solo osv) se conserva
  const redos = u.hallazgos.filter((h) => h.paquete === "lodash" && h.titulo.startsWith("ReDoS"));
  assert.equal(redos.length, 1);
  assert.equal(redos[0].severidad, "baja");
  assert.equal(redos[0].herramienta, "osv-scanner");
});

test("escáner ausente: no-disponible y sigue", () => {
  const f = todos();
  const e = escenario({ npm: f.npm });
  const r = correr(e);
  assert.equal(r.status, 0, r.stderr);
  const u = ultima(e.proy);
  assert.equal(u.herramientas["npm-audit"], "ok");
  assert.equal(u.herramientas.semgrep, "no-disponible");
  assert.equal(u.herramientas.gitleaks, "no-disponible");
  assert.equal(u.herramientas["osv-scanner"], "no-disponible");
  assert.equal(u.por_tipo.codigo, 0);
});

test("salida inválida de un escáner: error y sigue", () => {
  const e = escenario({ semgrep: path.join(FIX, "gitleaks-vacio.json") });
  correr(e);
  assert.equal(ultima(e.proy).herramientas.semgrep, "error");
});

test("ningún valor de secreto llega a ultima.json, historial ni .gitignore", () => {
  // gitleaks sin redactar a propósito: el script no debe copiar Secret ni Match
  const crudo = JSON.stringify([
    { RuleID: "generic-api-key", Description: "Detected a Generic API Key", File: "src/config.js", StartLine: 7, Secret: SIN_VALOR, Match: `clave = ${SIN_VALOR}`, Fingerprint: SIN_VALOR },
  ]);
  const e = escenario({}, { gitleaksTexto: crudo });
  const f = path.join(e.bin, "gitleaks");
  fs.writeFileSync(f, `#!/bin/sh\ncat '${path.join(e.base, "gl.json")}'\nexit 1\n`);
  fs.chmodSync(f, 0o755);
  const r = correr(e);
  assert.equal(r.status, 0, r.stderr);
  for (const fich of ["ultima.json", "historial.jsonl"]) assert.ok(!leer(e.proy, fich).includes(SIN_VALOR), fich);
  assert.ok(!fs.readFileSync(path.join(e.proy, ".gitignore"), "utf8").includes(SIN_VALOR));
  assert.ok(!(r.stdout + r.stderr).includes(SIN_VALOR));
  assert.equal(ultima(e.proy).por_tipo.secreto, 1);
  // y con el fixture redactado tampoco aparece nada
  const e2 = escenario(falsos(todos()));
  correr(e2);
  assert.ok(!leer(e2.proy, "ultima.json").includes("REDACTED"));
});

test("gitleaks vacío: sin hallazgos de secreto", () => {
  const e = escenario({ gitleaks: path.join(FIX, "gitleaks-vacio.json") });
  correr(e);
  const u = ultima(e.proy);
  assert.equal(u.herramientas.gitleaks, "ok");
  assert.equal(u.por_tipo.secreto, 0);
});

test("historial: una línea por ejecución con ts, resumen y total", () => {
  const e = escenario(falsos(todos()));
  correr(e);
  correr(e);
  const lineas = leer(e.proy, "historial.jsonl").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lineas.length, 2);
  assert.deepEqual(Object.keys(lineas[0]), ["ts", "resumen", "total"]);
  assert.equal(lineas[0].total, 7);
  assert.deepEqual(lineas[1].resumen, ultima(e.proy).resumen);
});

test(".gitignore: añade .claude/auditoria/ una sola vez y respeta lo existente", () => {
  const e = escenario({});
  fs.writeFileSync(path.join(e.proy, ".gitignore"), "node_modules"); // sin salto de línea final
  correr(e);
  correr(e);
  assert.equal(fs.readFileSync(path.join(e.proy, ".gitignore"), "utf8"), "node_modules\n.claude/auditoria/\n");
  const e2 = escenario({});
  fs.writeFileSync(path.join(e2.proy, ".gitignore"), "/.claude/auditoria\n");
  correr(e2);
  assert.equal(fs.readFileSync(path.join(e2.proy, ".gitignore"), "utf8"), "/.claude/auditoria\n");
});

test("--ci: falla con críticos nuevos, pasa si ya estaban y falla si aparece otro", () => {
  const e = escenario(falsos(todos()));
  const primera = correr(e, "--ci");
  assert.equal(primera.status, 1, "primera ejecución: todos los críticos son nuevos");
  assert.match(primera.stderr, /Críticos nuevos/);
  const segunda = correr(e, "--ci");
  assert.equal(segunda.status, 0, "mismos críticos: no son nuevos");
  // aparece un crítico nuevo (quitamos uno del resultado anterior simulando que no estaba)
  const p = path.join(e.proy, ".claude", "auditoria", "ultima.json");
  const u = JSON.parse(fs.readFileSync(p, "utf8"));
  u.hallazgos = u.hallazgos.filter((h) => h.paquete !== "minimist");
  fs.writeFileSync(p, JSON.stringify(u));
  assert.equal(correr(e, "--ci").status, 1);
  // sin --ci nunca falla por críticos
  assert.equal(correr(e).status, 0);
});

test("--ci sin críticos: sale 0", () => {
  // npm simulado: sin él, corre el npm real y su audit de red encuentra críticos de verdad
  const e = escenario({ npm: path.join(FIX, "npm-audit-vacio.json"), semgrep: path.join(FIX, "semgrep.json") });
  assert.equal(correr(e, "--ci").status, 0);
});

test("argumento desconocido: sale con 2", () => {
  const e = escenario({});
  assert.equal(correr(e, "--nope").status, 2);
});
