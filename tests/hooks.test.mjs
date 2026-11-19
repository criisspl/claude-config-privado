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

test("git-safety analiza cada push por separado: sin falsos positivos y sin huecos", () => {
  assert.equal(git("git push origin feature/x && git checkout main").code, 0);
  assert.equal(git("git push -u origin feature/x && gh pr create --base master").code, 0);
  assert.equal(git("git push origin HEAD", repoEnRama("main")).code, 2);
  assert.equal(git("git push origin @", repoEnRama("main")).code, 2);
  assert.equal(git("git push origin HEAD", repoEnRama("feature/x")).code, 0);
  assert.equal(git("git push origin feature/x:refs/heads/main").code, 2);
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

const leer = (file_path) => correr("read-guard.sh", { file_path });

test("read-guard bloquea lockfiles", () => {
  for (const f of ["package-lock.json", "/x/yarn.lock", "/x/pnpm-lock.yaml", "composer.lock"]) {
    assert.equal(leer(f).code, 2, f);
  }
});

test("read-guard bloquea dist/ y .next/", () => {
  assert.equal(leer("/p/dist/app.js").code, 2);
  assert.equal(leer("dist/app.js").code, 2);
  assert.equal(leer("/p/.next/cache/x").code, 2);
});

test("read-guard deja pasar ficheros normales", () => {
  assert.equal(leer("/p/src/index.ts").code, 0);
  assert.equal(leer("/p/package.json").code, 0);
  assert.equal(leer("/p/distribution/a.ts").code, 0);
});

function repoConCambios(ficheros) {
  const d = repoEnRama("main");
  const g = (...a) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: d });
  fs.writeFileSync(path.join(d, "base.txt"), "base\n");
  g("add", "."); g("commit", "-q", "-m", "base");
  for (const [f, c] of Object.entries(ficheros)) fs.writeFileSync(path.join(d, f), c);
  return d;
}
const parar = (cwd, extra = {}) => {
  const r = spawnSync("bash", [path.join(HOOKS, "stop-guard.sh")], { input: JSON.stringify({ cwd, ...extra }), cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

test("stop-guard avisa de console.log, debugger y .only( añadidos", () => {
  for (const linea of ["console.log('x')", "debugger;", "describe.only('a', () => {})", "it.only('a', f)"]) {
    const d = repoConCambios({ "base.txt": `base\n${linea}\n` });
    const r = parar(d);
    assert.equal(r.code, 2, linea);
    assert.match(r.err, /base\.txt/);
  }
});

test("stop-guard mira también los cambios en stage", () => {
  const d = repoConCambios({ "base.txt": "base\nconsole.log(1)\n" });
  spawnSync("git", ["add", "."], { cwd: d });
  assert.equal(parar(d).code, 2);
});

test("stop-guard ignora líneas que no se añaden y repos limpios", () => {
  assert.equal(parar(repoConCambios({})).code, 0);
  const d = repoConCambios({ "base.txt": "console.log(1)\n" });
  spawnSync("git", ["add", "."], { cwd: d });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "x"], { cwd: d });
  assert.equal(parar(d).code, 0);
  assert.equal(parar(repoConCambios({ "base.txt": "base\nconsole.warn(1)\n" })).code, 0);
});

test("stop-guard avisa de package.json sin lockfile y no si va con él", () => {
  const solo = repoConCambios({ "package.json": "{}\n" });
  spawnSync("git", ["add", "."], { cwd: solo });
  const r = parar(solo);
  assert.equal(r.code, 2);
  assert.match(r.err, /lockfile/);
  const con = repoConCambios({ "package.json": "{}\n", "package-lock.json": "{}\n" });
  spawnSync("git", ["add", "."], { cwd: con });
  assert.equal(parar(con).code, 0);
});

test("stop-guard no entra en bucle: stop_hook_active sale con 0", () => {
  const d = repoConCambios({ "base.txt": "base\nconsole.log(1)\n" });
  assert.equal(parar(d, { stop_hook_active: true }).code, 0);
});

test("stop-guard fuera de un repo sale con 0", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-"));
  assert.equal(parar(d).code, 0);
});

test("git-safety bloquea force push con refspec +", () => {
  for (const c of ["git push origin +main", "git push origin +feat", "git push -u origin +HEAD:feat", 'git push origin "+feat"']) {
    assert.equal(git(c, repoEnRama("feat")).code, 2, c);
  }
});

test("git-safety bloquea push a main con opciones globales de git", () => {
  for (const c of ["git -C . push origin main", "git -C x push origin HEAD:main", "git -c k=v push origin main", "git --no-pager push origin master"]) {
    assert.equal(git(c, repoEnRama("feat")).code, 2, c);
  }
});

test("git-safety bloquea commit -n (= --no-verify)", () => {
  for (const c of ["git commit -n -m x", "git commit -m x -n", "git commit -nm x", "git commit -anm x", "git -C . commit -n -m x"]) {
    assert.equal(git(c).code, 2, c);
  }
});

test("git-safety bloquea restore y checkout que descartan todo", () => {
  for (const c of ["git restore .", "git checkout .", "git restore -- .", "git restore --worktree .", "git checkout HEAD .", "git restore --source=HEAD~1 ."]) {
    assert.equal(git(c).code, 2, c);
  }
});

test("git-safety no bloquea lo legítimo", () => {
  for (const c of ["git restore --staged file", "git restore --staged .", "git restore src/a.ts", "git checkout -b x", "git checkout feat",
    'git commit -m "fix -n flag"', "git commit -mnote", "git commit --amend -m x", "git push origin feat", "git push -u origin feat",
    "git -C x status", "git -c k=v push origin feat"]) {
    assert.equal(git(c, repoEnRama("feat")).code, 0, c);
  }
});

const secreto = (file_path, content) => correr("no-secret-leak.sh", { file_path, content });
const rep = (s, n) => s.repeat(n);

test("no-secret-leak detecta claves de proveedores nuevos", () => {
  for (const c of ["sk-ant-" + rep("x", 40), "sk-proj-" + rep("a1", 30), "sk-" + rep("b", 48),
    "github_pat_" + rep("A", 30), "xoxb-" + rep("1", 12), "xoxp-" + rep("2", 12) + "-abc"]) {
    assert.equal(secreto("/p/src/a.ts", `const k = "${c}"`).code, 2, c);
  }
});

test("no-secret-leak: la excepción de tests solo vale para patrones genéricos", () => {
  assert.equal(secreto("/p/a.test.ts", "api_key=" + rep("a", 24)).code, 0);
  assert.equal(secreto("/p/a.spec.ts", "api_key=" + rep("a", 24)).code, 0);
  for (const c of ["AKIA" + rep("A", 16), "ghp_" + rep("a", 36), "sk-ant-" + rep("x", 40), "github_pat_" + rep("A", 30), "xoxb-" + rep("1", 12),
    "-----BEGIN RSA " + "PRIVATE KEY-----"]) {
    assert.equal(secreto("/p/a.test.ts", c).code, 2, c);
    assert.equal(secreto("/p/__fixtures__/a.json", c).code, 2, c);
  }
});

test("no-secret-leak deja pasar texto normal", () => {
  for (const c of ["const risk-assessment = 1", "task-force-" + rep("a", 40), "sk-learn", "api_key=process.env.KEY"]) {
    assert.equal(secreto("/p/src/a.ts", c).code, 0, c);
  }
});

test("hooks de bloqueo salen con 2 si falta jq", () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "nojq-"));
  for (const c of ["bash", "cat", "grep", "sed", "tr", "dirname", "readlink", "git", "date", "mkdir", "basename"]) {
    const p = spawnSync("which", [c], { encoding: "utf8" }).stdout.trim();
    if (p) fs.symlinkSync(p, path.join(bin, c));
  }
  const bash = spawnSync("which", ["bash"], { encoding: "utf8" }).stdout.trim();
  for (const h of ["git-safety", "no-secret-leak", "rm-safety", "protect-config", "read-guard", "no-screenshot-main"]) {
    const r = spawnSync(bash, [path.join(HOOKS, `${h}.sh`)], { input: "{}", env: { PATH: bin, HOME: bin }, encoding: "utf8" });
    assert.equal(r.status, 2, h);
    assert.match(r.stderr, /jq/, h);
  }
});

test("git-safety bloquea borrar main/master/develop en remoto", () => {
  for (const c of ["git push origin --delete main", "git push origin :master", "git push -d origin develop"]) assert.equal(git(c).code, 2, c);
  assert.equal(git("git push origin --delete feature/x").code, 0);
  assert.equal(git('git commit -m "git push origin :main"').code, 0);
});

const rm = (command) => correr("rm-safety.sh", { command });
test("rm-safety: rutas peligrosas, /bin/rm y \\rm; sin falsos positivos SQL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-"));
  fs.copyFileSync(path.join(HOOKS, "rm-safety.sh"), path.join(dir, "rm-safety.sh"));
  fs.writeFileSync(path.join(dir, "rm-safety.mode"), "block\n");
  const run = (command) => spawnSync("bash", [path.join(dir, "rm-safety.sh")], { input: JSON.stringify({ tool_input: { command } }), env: { ...process.env, HOME: dir }, encoding: "utf8" }).status;
  for (const c of ["rm -rf /", "rm -rf $HOME/*", "/bin/rm -rf /usr", "\\rm -rf ~", "rm -rf /home/csantos", "rm -rf /usr/*", "rm -rf /etc/*", "rm -rf /home/csantos/*"]) assert.equal(run(c), 2, c);
  for (const c of ["rm -rf node_modules", "rm -rf /usr/local/share/foo", 'git commit -m "no hacer DROP TABLE users"', 'gh pr create --body "TRUNCATE TABLE x"']) assert.equal(run(c), 0, c);
});

test("no-secret-leak usa lib/secret-patterns: bloquea proveedor en test, deja pasar genérico", () => {
  assert.equal(correr("no-secret-leak.sh", { file_path: "a.test.js", content: "AKIAABCDEFGHIJKLMNOP" }).code, 2);
  assert.equal(correr("no-secret-leak.sh", { file_path: "a.test.js", content: "api_key=abcdefghij1234567890abcd" }).code, 0);
  assert.equal(correr("no-secret-leak.sh", { file_path: "a.js", content: "api_key=abcdefghij1234567890abcd" }).code, 2);
});

test("db-visor solo guarda comandos que ejecutan mysql/psql/sqlite3, no los que lo mencionan", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dbv-"));
  const fichero = path.join(home, ".config/herdr-app/data/db-ultima.json");
  const run = (command) => spawnSync("bash", [path.join(HOOKS, "db-visor.sh")], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), env: { ...process.env, HOME: home }, encoding: "utf8" });
  for (const c of ["cat > main.js <<EOF\nuse mysql aquí\nEOF", "ls ~/.claude/mcp/mysql-mcp.sh", "echo mysql"]) {
    run(c);
    assert.equal(fs.existsSync(fichero), false, c);
  }
  for (const c of ['mysql -e "select 1"', 'MYSQL_PWD=x mysql -B -e "x"', 'cd a && psql -c "x"']) {
    fs.rmSync(fichero, { force: true });
    run(c);
    assert.equal(fs.existsSync(fichero), true, c);
  }
});
