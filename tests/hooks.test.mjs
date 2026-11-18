import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks");

function repoEnRama(rama) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-"));
  spawnSync("git", ["init", "-q", "-b", rama], { cwd: d });
  return d;
}

function correr(hook, toolInput, cwd = process.cwd()) {
  const r = spawnSync("bash", [path.join(HOOKS, hook)], { input: JSON.stringify({ tool_input: toolInput }), cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const git = (command, cwd) => correr("git-safety.sh", { command }, cwd);
const config = (file_path) => correr("protect-config.sh", { file_path });

test("git-safety bloquea push directo a main", () => {
  assert.equal(git("git push origin main").code, 2);
  assert.equal(git("git push origin HEAD:main").code, 2);
  assert.equal(git("git push -u origin feature/x:main").code, 2);
});

test("git-safety bloquea push sin refspec estando en main", () => {
  assert.equal(git("git push", repoEnRama("main")).code, 2);
  assert.equal(git("git push origin", repoEnRama("main")).code, 2);
  assert.equal(git("git push", repoEnRama("feature/x")).code, 0);
});

test("git-safety deja pasar push a otras ramas", () => {
  assert.equal(git("git push origin feature/x").code, 0);
  assert.equal(git("git push -u origin feature/main-ajuste").code, 0);
});

test("git-safety bloquea commit --no-verify", () => {
  assert.equal(git("git commit --no-verify -m 'x'").code, 2);
  assert.equal(git("git commit -m 'x' --no-verify").code, 2);
});

test("git-safety deja pasar commit normal", () => {
  assert.equal(git("git commit -m 'feat: x'").code, 0);
  assert.equal(git("git commit -m 'explica --no-verify'").code, 0);
});

test("protect-config bloquea configs de lint, tipos y tests", () => {
  for (const f of ["/p/.eslintrc.json", "/p/.eslintrc", "/p/tsconfig.json", "/p/jest.config.ts", "/p/vitest.config.mjs"]) {
    const r = config(f);
    assert.equal(r.code, 2, f);
    assert.ok(r.err.length > 0, f);
  }
});

test("protect-config pide confirmación en package.json, workflows y vite.config", () => {
  for (const f of ["/p/package.json", "/p/.github/workflows/ci.yml", "/p/vite.config.ts"]) {
    const r = config(f);
    assert.equal(r.code, 0, f);
    const j = JSON.parse(r.out);
    assert.equal(j.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(j.hookSpecificOutput.permissionDecision, "ask");
    assert.ok(j.hookSpecificOutput.permissionDecisionReason.length > 0);
  }
});

test("protect-config no dice nada de otros ficheros", () => {
  const r = config("/p/src/app.ts");
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
});
