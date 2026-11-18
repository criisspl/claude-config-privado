import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "worktree-link.sh");

const git = (cwd, ...a) =>
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" });

function escenario() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-")));
  const main = path.join(base, "main");
  fs.mkdirSync(main);
  git(main, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(main, "a.txt"), "a\n");
  git(main, "add", ".");
  git(main, "commit", "-q", "-m", "base");
  fs.mkdirSync(path.join(main, ".claude"));
  fs.writeFileSync(path.join(main, ".claude", "settings.local.json"), "{}\n");
  fs.writeFileSync(path.join(main, ".env.local"), "A=1\n");
  const wt = path.join(base, "wt");
  git(main, "worktree", "add", "-q", "-b", "feature/x", wt);
  return { main, wt };
}

const correr = (cwd, input = { cwd }) =>
  spawnSync("bash", [HOOK], { input: JSON.stringify(input), cwd, encoding: "utf8" });

test("worktree-link enlaza settings.local.json y .env.local del repo principal", () => {
  const { main, wt } = escenario();
  assert.equal(correr(wt).status, 0);
  for (const f of [".claude/settings.local.json", ".env.local"]) {
    const p = path.join(wt, f);
    assert.ok(fs.lstatSync(p).isSymbolicLink(), f);
    assert.equal(fs.realpathSync(p), path.join(main, f));
  }
});

test("worktree-link es idempotente", () => {
  const { wt } = escenario();
  correr(wt);
  assert.equal(correr(wt).status, 0);
  assert.ok(fs.lstatSync(path.join(wt, ".env.local")).isSymbolicLink());
});

test("worktree-link no sobrescribe lo que ya existe en el worktree", () => {
  const { wt } = escenario();
  fs.writeFileSync(path.join(wt, ".env.local"), "PROPIO=1\n");
  correr(wt);
  assert.equal(fs.readFileSync(path.join(wt, ".env.local"), "utf8"), "PROPIO=1\n");
  assert.ok(!fs.lstatSync(path.join(wt, ".env.local")).isSymbolicLink());
  assert.ok(fs.lstatSync(path.join(wt, ".claude", "settings.local.json")).isSymbolicLink());
});

test("worktree-link no crea nada si el principal no tiene el fichero", () => {
  const { main, wt } = escenario();
  fs.rmSync(path.join(main, ".env.local"));
  correr(wt);
  assert.ok(!fs.existsSync(path.join(wt, ".env.local")));
});

test("worktree-link no hace nada en el repo principal ni fuera de un repo", () => {
  const { main } = escenario();
  assert.equal(correr(main).status, 0);
  assert.ok(!fs.lstatSync(path.join(main, ".env.local")).isSymbolicLink());
  const fuera = fs.mkdtempSync(path.join(os.tmpdir(), "wt-"));
  assert.equal(correr(fuera).status, 0);
  assert.deepEqual(fs.readdirSync(fuera), []);
});

test("worktree-link usa el cwd de la entrada del hook", () => {
  const { wt } = escenario();
  assert.equal(correr(os.tmpdir(), { cwd: wt }).status, 0);
  assert.ok(fs.lstatSync(path.join(wt, ".env.local")).isSymbolicLink());
});
