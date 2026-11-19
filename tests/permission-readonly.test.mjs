import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "permission-readonly.sh");

const correr = (input) => {
  const r = spawnSync("bash", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  return { code: r.status, out: r.stdout };
};
const permiso = (command) =>
  correr({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command } });
const aprobado = (c) => {
  const r = permiso(c);
  if (r.code !== 0 || r.out === "") return false;
  assert.deepEqual(JSON.parse(r.out), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
  });
  return true;
};

test("permission-readonly aprueba comandos de solo lectura y sus pipes", () => {
  for (const c of [
    "git status", "git diff main...HEAD", "git log --oneline -5", "git show HEAD~1", "git rev-parse --show-toplevel",
    "git branch --show-current", "git ls-files", "git grep -n foo",
    "gh pr view 12 --json title", "gh pr list", "gh pr diff 3", "gh pr checks", "gh issue view 4", "gh run list",
    "gh repo view", "gh auth status", "gh api repos/o/r/pulls/1", "gh api -X GET repos/o/r", "gh api --method=GET repos/o/r",
    "jq -r '.a' f.json", "rg -n 'a|b' src", "wc -l a.txt",
    "git diff | wc -l", "gh pr view 1 --json files | jq '.files'", "git log --oneline | rg fix | wc -l",
  ]) assert.ok(aprobado(c), c);
});

test("permission-readonly no aprueba encadenados, redirecciones ni sustituciones", () => {
  for (const c of [
    "git status; rm -rf x", "git status && git push", "git status || true", "git status > out.txt", "git log >> out.txt",
    "git log $(rm x)", "git log `rm x`", "git status &", "git status\nrm x", 'rg "$(rm x)"', "jq . < f.json",
    "git log ${HOME}", "git diff | tee f", "git diff |", "| git diff",
  ]) assert.ok(!aprobado(c), JSON.stringify(c));
});

test("permission-readonly no aprueba subcomandos de escritura", () => {
  for (const c of [
    "gh pr create", "gh pr merge 1", "gh pr close 1", "gh pr comment 1 -b x", "gh pr checkout 1", "gh pr edit 1", "gh pr view 1 --web",
    "gh issue create", "gh issue close 1", "gh repo delete x", "gh repo clone x", "gh release create v1", "gh run rerun 1", "gh auth login",
    "gh api -X POST repos/o/r/issues", "gh api --method POST repos/o/r", "gh api --method=DELETE repos/o/r", "gh api -XPATCH repos/o/r",
    "gh api repos/o/r -f title=x", "gh api repos/o/r -F a=b", "gh api repos/o/r --field a=b", "gh api repos/o/r --input f.json",
    "gh api graphql -f query=x", "gh api -X GET -X POST repos/o/r", "gh", "gh pr", "gh api",
    "git push", "git push origin main", "git commit -m x", "git reset --hard", "git checkout main", "git checkout -b x", "git switch x",
    "git add .", "git rm f", "git mv a b", "git merge x", "git rebase main", "git pull", "git fetch", "git clean -fd", "git stash", "git tag v1",
    "git branch x", "git branch -D x", "git branch -m y", "git config user.name x", "git remote add o u", "git restore f", "git cherry-pick x",
    "git apply p.diff", "git am p", "git revert HEAD", "git -c core.pager=x log", "git log --output=f", "git diff --output=f", "git grep -O vim x",
    "git", "git -C /tmp status",
    "rg --pre ./x foo", "rg --pre=./x foo", "rg --hostname-bin x foo",
    "rm -rf x", "ls", "cat f", "curl x", "bash -c 'git status'", "sh x", "env git status", "FOO=1 git status", "xargs git", "sed -i s/a/b/ f", "tee f",
    "", "   ",
  ]) assert.ok(!aprobado(c), JSON.stringify(c));
});

test("permission-readonly sin salida y exit 0 cuando no aplica", () => {
  const r = permiso("git push");
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
});

test("permission-readonly ignora entradas que no son Bash", () => {
  const r = correr({ tool_name: "Edit", tool_input: { file_path: "/x" } });
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
});
