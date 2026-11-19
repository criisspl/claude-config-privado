// Lint de packs y hooks: devuelve la lista de errores (vacía si todo está bien).
import fs from "node:fs";
import path from "node:path";

const HERRAMIENTAS = ["python3", "node", "npx", "rtk", "codegraph", "docker"];
const leer = (f) => fs.readFileSync(f, "utf8");
const subdirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

function mds(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? mds(f) : f.endsWith(".md") ? [f] : [];
  });
}

export function lint(repo) {
  const errores = [];
  const globales = new Set(subdirs(path.join(repo, "skills")));
  const packs = subdirs(path.join(repo, "packs"));
  const skillsDe = (id) => new Set(subdirs(path.join(repo, "packs", id, "skills")));

  for (const id of packs) {
    const dir = path.join(repo, "packs", id);
    const requiere = JSON.parse(leer(path.join(dir, "pack.json"))).requiere ?? [];
    // shortcut: solo requisitos directos, no transitivos; ampliar si un pack cita skills de un requisito de un requisito.
    const disponibles = new Set([...globales, ...skillsDe(id), ...requiere.flatMap((r) => [...skillsDe(r)])]);

    for (const f of mds(dir)) {
      const rel = path.relative(repo, f);
      const texto = leer(f);
      for (const m of texto.matchAll(/`\/([a-z][a-z0-9-]+)`|[Ss]kill `([a-z][a-z0-9-]+)`/g)) {
        const nombre = m[1] ?? m[2];
        if (!disponibles.has(nombre)) errores.push(`${rel}: cita la skill ${nombre}, que no se instala con el pack`);
      }
      for (const m of texto.matchAll(/\]\(([^)\s]+)\)/g)) {
        const destino = m[1].split("#")[0];
        if (!destino || /^[a-z]+:/i.test(destino)) continue;
        const abs = path.resolve(path.dirname(f), destino);
        if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) errores.push(`${rel}: enlace ${m[1]} roto o fuera del pack`);
      }
    }
  }

  const hooks = path.join(repo, "hooks");
  for (const nombre of fs.existsSync(hooks) ? fs.readdirSync(hooks).filter((n) => n.endsWith(".sh")) : []) {
    const texto = leer(path.join(hooks, nombre));
    const codigo = texto.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    for (const h of HERRAMIENTAS) {
      const usa = new RegExp(`(^|[;&|(\`]|\\$\\(|\\bexec)\\s*${h}\\s`, "m").test(codigo);
      if (usa && !texto.includes(`command -v ${h}`)) errores.push(`hooks/${nombre}: usa ${h} sin comprobar \`command -v ${h}\``);
    }
  }
  return errores;
}
