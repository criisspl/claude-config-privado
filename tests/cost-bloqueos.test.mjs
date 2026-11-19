import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks");

function homeCon(lineas) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cost-"));
  fs.mkdirSync(path.join(home, ".cache", "claude-guard"), { recursive: true });
  if (lineas) fs.writeFileSync(path.join(home, ".cache", "claude-guard", "cost.jsonl"), lineas.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return home;
}
const informe = (home, ...args) => spawnSync("bash", [path.join(HOOKS, "cost-report.sh"), ...args], { env: { ...process.env, HOME: home }, encoding: "utf8" });
const sesion = (session, ts, branch, jira, models) => ({ ts, session, jira, branch, cwd: "/p", models });
const m = (model, input, output, cache_read, cache_write) => ({ model, input, output, cache_read, cache_write });

test("coste por rama: última línea por sesión, precios por familia y % del modelo dominante", () => {
  const home = homeCon([
    sesion("a", "2026-11-18T10:00:00+01:00", "feat/x", "", [m("claude-sonnet-5-5", 1, 1, 1, 1)]),
    sesion("a", "2026-11-18T11:00:00+01:00", "feat/x", "", [m("claude-sonnet-5-5", 1000000, 20000, 5000000, 100000), m("claude-opus-5-5", 10000, 5000, 100000, 10000)]),
    sesion("b", "2026-11-18T12:00:00+01:00", "otra", "", [m("claude-opus-5-5", 9e6, 0, 0, 0)]),
  ]);
  const r = informe(home, "--rama", "feat/x");
  assert.equal(r.status, 0);
  // sonnet 2,95 $ + opus 0,21 $ = 3,16 $; 1.145.000 tokens nuevos
  assert.equal(r.stdout.trim(), "1,1 M tokens · 3,16 $ · 93 % Sonnet");
});

test("coste por jira y modelo fable", () => {
  const home = homeCon([sesion("a", "2026-11-18T10:00:00+01:00", "x", "ABC-12", [m("claude-fable-5-2", 1000000, 0, 0, 0)])]);
  assert.equal(informe(home, "--jira", "ABC-12").stdout.trim(), "1 M tokens · 8,00 $ · 100 % Fable");
});

test("coste: sin datos, sin sesiones de esa rama o líneas antiguas sin branch no imprime nada", () => {
  assert.equal(informe(homeCon(), "--rama", "x").stdout, "");
  const home = homeCon([{ ts: "2026-11-18T10:00:00+01:00", session: "a", jira: "", cwd: "/p", models: [m("claude-sonnet-5-5", 1, 1, 1, 1)] }]);
  assert.equal(informe(home, "--rama", "x").stdout, "");
  assert.equal(informe(home, "--rama").status, 1);
});

test("cost-log guarda branch", () => {
  const home = homeCon();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cl-"));
  spawnSync("git", ["init", "-q", "-b", "feat/rama-x"], { cwd: repo });
  const tp = path.join(repo, "t.jsonl");
  fs.writeFileSync(tp, JSON.stringify({ type: "assistant", message: { id: "1", model: "claude-sonnet-5-5", usage: { input_tokens: 5, output_tokens: 6 } } }) + "\n");
  spawnSync("bash", [path.join(HOOKS, "cost-log.sh")], { input: JSON.stringify({ transcript_path: tp, session_id: "s", cwd: repo }), env: { ...process.env, HOME: home }, encoding: "utf8" });
  const l = JSON.parse(fs.readFileSync(path.join(home, ".cache", "claude-guard", "cost.jsonl"), "utf8").trim());
  assert.equal(l.branch, "feat/rama-x");
});

function bloquear(hook, input, env = {}) {
  const home = homeCon();
  const r = spawnSync("bash", [path.join(HOOKS, hook)], { input: JSON.stringify(input), env: { ...process.env, HOME: home, ...env }, encoding: "utf8" });
  const f = path.join(home, ".cache", "claude-guard", "bloqueos.jsonl");
  return { code: r.status, lineas: fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").map((x) => JSON.parse(x)) : [] };
}

test("read-guard y protect-config registran bloqueos {ts,hook,motivo,cwd}", () => {
  const a = bloquear("read-guard.sh", { tool_input: { file_path: "/p/yarn.lock" } });
  assert.equal(a.code, 2);
  assert.deepEqual(Object.keys(a.lineas[0]).sort(), ["cwd", "hook", "motivo", "ts"]);
  assert.equal(a.lineas[0].hook, "read-guard");
  const b = bloquear("protect-config.sh", { tool_input: { file_path: "/p/tsconfig.json" } });
  assert.equal(b.code, 2);
  assert.equal(b.lineas[0].hook, "protect-config");
});

test("rm-safety registra solo cuando bloquea; sin bloqueo no hay registro", () => {
  // copia del hook en una carpeta temporal para controlar rm-safety.mode (vive junto al script)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-"));
  fs.copyFileSync(path.join(HOOKS, "rm-safety.sh"), path.join(dir, "rm-safety.sh"));
  const correr = (modo, command) => {
    const home = homeCon();
    fs.writeFileSync(path.join(dir, "rm-safety.mode"), modo);
    const r = spawnSync("bash", [path.join(dir, "rm-safety.sh")], { input: JSON.stringify({ tool_input: { command } }), env: { ...process.env, HOME: home }, encoding: "utf8" });
    const f = path.join(home, ".cache", "claude-guard", "bloqueos.jsonl");
    return { code: r.status, lineas: fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").map((x) => JSON.parse(x)) : [] };
  };
  assert.equal(correr("observe", "rm -rf ~").lineas.length, 0);
  assert.equal(correr("block", "rm -rf node_modules").lineas.length, 0);
  const r = correr("block", "rm -rf ~");
  assert.equal(r.code, 2);
  assert.equal(r.lineas[0].hook, "rm-safety");
  assert.equal(bloquear("read-guard.sh", { tool_input: { file_path: "/p/src/a.ts" } }).lineas.length, 0);
});
