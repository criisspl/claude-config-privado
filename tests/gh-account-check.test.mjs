import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "gh-account-check.sh");

function escenario({ remote, login }) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gh-")));
  const repo = path.join(base, "repo");
  fs.mkdirSync(repo);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  if (remote) spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo });
  const bin = path.join(base, "bin");
  fs.mkdirSync(bin);
  if (login !== null) {
    fs.writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env bash\necho "${login}"\n`, { mode: 0o755 });
  }
  return { repo, bin };
}

// PATH sin gh real: solo el mock, git y utilidades del sistema
function correr({ repo, bin }) {
  const dirs = [bin, ...["git", "bash", "sed", "cat", "jq"].map((c) => spawnSync("which", [c], { encoding: "utf8" }).stdout.trim()).filter(Boolean).map(path.dirname)];
  return spawnSync("bash", [HOOK], {
    input: JSON.stringify({ cwd: repo }),
    cwd: repo,
    encoding: "utf8",
    env: { PATH: [...new Set(dirs)].join(":"), HOME: os.tmpdir() },
  });
}

test("gh-account-check calla si la cuenta coincide con la org (https)", () => {
  const r = correr(escenario({ remote: "https://github.com/civitatis/x.git", login: "csantos-civ" }));
  assert.equal(r.status, 0);
  assert.ok(!/AVISO/i.test(r.stdout + r.stderr));
  assert.match(r.stdout, /csantos-civ/);
});

test("gh-account-check avisa si no coincide (ssh)", () => {
  const r = correr(escenario({ remote: "git@github.com:civitatis/x.git", login: "criisspl" }));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /AVISO/);
  assert.match(r.stdout, /criisspl/);
  assert.match(r.stdout, /civitatis/);
});

test("gh-account-check acepta cuenta personal con su propia org", () => {
  const r = correr(escenario({ remote: "https://github.com/criisspl/claude-config.git", login: "criisspl" }));
  assert.equal(r.status, 0);
  assert.ok(!/AVISO/.test(r.stdout));
});

test("gh-account-check sale en silencio sin remote", () => {
  const r = correr(escenario({ remote: null, login: "criisspl" }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, "");
});

test("gh-account-check sale en silencio sin gh", () => {
  const r = correr(escenario({ remote: "git@github.com:civitatis/x.git", login: null }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, "");
});
