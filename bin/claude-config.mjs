#!/usr/bin/env node
// claude-config: instala en un proyecto los paquetes de skills, agentes y reglas que encajan con su tecnología.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aplicar, cambiosEntre, catalogo, detectar, leerLock, modificados, version } from "../lib/paquetes.mjs";

const LIB = path.resolve(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), "..");
const AYUDA = `Uso: claude-config <comando> [opciones]

  init [--solo a,b]   Detecta la tecnología del proyecto e instala sus paquetes
  add <paquete...>    Añade paquetes
  remove <paquete...> Quita paquetes (no borra lo que hayas modificado)
  update              Baja la última versión publicada y actualiza los paquetes del proyecto
  status              Versión instalada, paquetes, ficheros modificados y paquetes sugeridos
  list                Paquetes disponibles (✓ instalado, · detectado)
  version             Versión de la librería

Opciones: -C <dir> para trabajar en otro proyecto (por defecto, la carpeta actual).`;

const args = process.argv.slice(2);
let proyecto = process.cwd();
const iC = args.indexOf("-C");
if (iC !== -1) {
  proyecto = path.resolve(args[iC + 1] ?? ".");
  args.splice(iC, 2);
}
const [cmd, ...resto] = args;

function informar(r) {
  console.log(`✓ claude-config v${r.version} · paquetes: ${r.paquetes.join(", ") || "ninguno"}`);
  for (const f of r.escritos) console.log(`  + ${f}`);
  for (const f of r.borrados) console.log(`  - ${f}`);
  for (const f of r.conflictos) console.log(`  ⚠ ${f} lo has cambiado: la versión nueva está en ${f}.nuevo`);
  for (const f of r.conservados) console.log(`  ⚠ ${f} ya no es de ningún paquete, pero lo has cambiado: no lo borro`);
  console.log("  CLAUDE.md actualizado (bloque de claude-config). Revisa y commitea los cambios.");
}

function sinLock() {
  console.error("Este proyecto no usa claude-config todavía: ejecuta `claude-config init`.");
  process.exit(1);
}

const git = (...a) => execFileSync("git", ["-C", LIB, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Pone la librería en la última versión publicada (tag vX.Y.Z); sin tags, en lo último de main. */
function actualizarLibreria() {
  git("fetch", "--tags", "--quiet", "origin");
  const tags = git("tag", "-l", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
  if (tags.length) git("-c", "advice.detachedHead=false", "checkout", "--quiet", tags[0]);
  else git("pull", "--ff-only", "--quiet");
}

try {
  const cat = catalogo(LIB);
  switch (cmd) {
    case "init": {
      if (leerLock(proyecto)) {
        console.log("Ya usa claude-config: usa `claude-config add`, `remove` o `update`.");
        break;
      }
      const iSolo = resto.indexOf("--solo");
      const ids = iSolo !== -1 ? (resto[iSolo + 1] ?? "").split(",").filter(Boolean) : detectar(proyecto, cat);
      console.log(ids.length ? `Detectado: ${ids.join(", ")}` : "No he detectado ninguna tecnología del catálogo (`claude-config list`).");
      informar(aplicar(proyecto, LIB, ids));
      break;
    }
    case "add":
    case "remove": {
      const lock = leerLock(proyecto) ?? sinLock();
      if (!resto.length) throw new Error(`Indica qué paquetes: claude-config ${cmd} <paquete...>`);
      const ids = cmd === "add" ? [...lock.paquetes, ...resto] : lock.paquetes.filter((p) => !resto.includes(p));
      informar(aplicar(proyecto, LIB, ids));
      break;
    }
    case "update": {
      const lock = leerLock(proyecto) ?? sinLock();
      actualizarLibreria();
      // Se aplica con el código recién descargado, por si el propio comando ha cambiado.
      execFileSync(process.execPath, [path.join(LIB, "bin", "claude-config.mjs"), "-C", proyecto, "aplicar"], { stdio: "inherit" });
      const nueva = version(LIB);
      if (nueva !== lock.version) console.log(`\nNovedades desde la v${lock.version}:\n\n${cambiosEntre(LIB, lock.version, nueva)}`);
      else console.log("Ya tenías la última versión.");
      break;
    }
    case "aplicar": {
      const lock = leerLock(proyecto) ?? sinLock();
      informar(aplicar(proyecto, LIB, lock.paquetes.filter((p) => cat[p])));
      const sugeridos = detectar(proyecto, cat).filter((p) => !lock.paquetes.includes(p));
      if (sugeridos.length) console.log(`  Detectados y sin instalar: ${sugeridos.join(", ")} (claude-config add ...)`);
      break;
    }
    case "status": {
      const lock = leerLock(proyecto) ?? sinLock();
      let publicada = "";
      try {
        const tags = git("ls-remote", "--tags", "--refs", "origin", "v*").match(/v\d+\.\d+\.\d+/g) ?? [];
        const num = (t) => t.slice(1).split(".").map(Number);
        tags.sort((a, b) => num(b).reduce((r, x, i) => r || x - num(a)[i], 0));
        if (tags[0]) publicada = ` · última publicada: ${tags[0]}`;
        if (tags[0] && tags[0] !== `v${lock.version}`) publicada += " (ejecuta `claude-config update`)";
      } catch {
        // Sin red o sin remoto: se informa solo de lo local.
      }
      console.log(`Proyecto: v${lock.version} · librería: v${version(LIB)}${publicada}`);
      console.log(`Paquetes: ${lock.paquetes.join(", ") || "ninguno"}`);
      const mod = modificados(proyecto);
      if (mod.length) console.log(`Modificados a mano: ${mod.join(", ")}`);
      const sugeridos = detectar(proyecto, cat).filter((p) => !lock.paquetes.includes(p));
      if (sugeridos.length) console.log(`Detectados y sin instalar: ${sugeridos.join(", ")}`);
      break;
    }
    case "list": {
      const instalados = leerLock(proyecto)?.paquetes ?? [];
      const detectados = detectar(proyecto, cat);
      for (const p of Object.values(cat)) {
        const marca = instalados.includes(p.id) ? "✓" : detectados.includes(p.id) ? "·" : " ";
        console.log(`${marca} ${p.id.padEnd(20)} ${p.descripcion}`);
      }
      break;
    }
    case "version":
    case "--version":
      console.log(version(LIB));
      break;
    default:
      console.log(AYUDA);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
