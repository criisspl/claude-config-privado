import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LOCK } from "../lib/paquetes.mjs";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "claude-config.mjs");
const cli = (proyecto, ...args) => spawnSync("node", [BIN, "-C", proyecto, ...args], { encoding: "utf8" });

/** Proyecto React con los paquetes ya instalados. */
function proyecto() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } }));
  assert.equal(cli(dir, "init").status, 0);
  return dir;
}
const lockDe = (dir) => JSON.parse(fs.readFileSync(path.join(dir, LOCK), "utf8"));

test("check: proyecto al día sale 0", () => {
  const r = cli(proyecto(), "check");
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test("check: fichero editado a mano sale 1 y lo nombra", () => {
  const dir = proyecto();
  const rel = Object.keys(lockDe(dir).ficheros)[0];
  fs.appendFileSync(path.join(dir, rel), "\nmodificado\n");
  const r = cli(dir, "check");
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("check: versión del lock distinta de la librería sale 1", () => {
  const dir = proyecto();
  const lock = lockDe(dir);
  fs.writeFileSync(path.join(dir, LOCK), JSON.stringify({ ...lock, version: "0.0.1" }));
  const r = cli(dir, "check");
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /0\.0\.1/);
});

test("check: paquete detectado y sin instalar solo avisa (sale 0)", () => {
  const dir = proyecto();
  const lock = lockDe(dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0", vitest: "3.0.0" } }));
  const r = cli(dir, "check");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /vitest/);
  assert.ok(!lock.paquetes.includes("vitest"));
});

test("check: proyecto sin lock sale 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-"));
  assert.equal(cli(dir, "check").status, 1);
});
