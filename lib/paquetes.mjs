// Núcleo de claude-config: catálogo de paquetes, detección e instalación en un proyecto.
// Sin dependencias: solo Node (>= 20).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LOCK = ".claude/claude-config.json";
export const INICIO = "<!-- claude-config:inicio · no edites este bloque: lo gestiona claude-config -->";
export const FIN = "<!-- claude-config:fin -->";
const CARPETAS = ["skills", "agents", "commands"];

const sha = (texto) => createHash("sha256").update(texto).digest("hex");
const leerJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export function version(lib) {
  return fs.readFileSync(path.join(lib, "VERSION"), "utf8").trim();
}

/** Todos los paquetes de `lib/packs`, por id. */
export function catalogo(lib) {
  const dir = path.join(lib, "packs");
  const res = {};
  if (!fs.existsSync(dir)) return res;
  for (const id of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, id, "pack.json");
    if (!fs.existsSync(f)) continue;
    const p = leerJson(f);
    res[id] = { id, descripcion: p.descripcion ?? "", detecta: p.detecta ?? [], requiere: p.requiere ?? [], dir: path.dirname(f) };
  }
  return res;
}

function dependenciasNpm(proyecto) {
  const f = path.join(proyecto, "package.json");
  if (!fs.existsSync(f)) return new Set();
  const pkg = leerJson(f);
  const campos = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  return new Set(campos.flatMap((c) => Object.keys(pkg[c] ?? {})));
}

function cumple(regla, proyecto, deps) {
  if (regla.npm) return deps.has(regla.npm);
  if (regla.fichero) {
    const f = path.join(proyecto, regla.fichero);
    if (!fs.existsSync(f)) return false;
    if (!regla.contiene) return true;
    return fs.statSync(f).isFile() && new RegExp(regla.contiene).test(fs.readFileSync(f, "utf8"));
  }
  return false;
}

/** Añade los paquetes que exigen los elegidos (`requiere`), sin duplicar. */
export function conRequisitos(ids, cat) {
  const res = new Set();
  const visitar = (id) => {
    if (res.has(id) || !cat[id]) return;
    res.add(id);
    cat[id].requiere.forEach(visitar);
  };
  ids.forEach(visitar);
  return [...res].sort();
}

/** Ids de los paquetes cuya detección se cumple en el proyecto. */
export function detectar(proyecto, cat) {
  const deps = dependenciasNpm(proyecto);
  const ids = Object.values(cat)
    .filter((p) => p.detecta.some((r) => cumple(r, proyecto, deps)))
    .map((p) => p.id);
  return conRequisitos(ids, cat);
}

function recorrer(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? recorrer(f, base) : [path.relative(base, f)];
  });
}

/** Ficheros que instala un paquete: destino relativo al proyecto → origen. */
export function ficherosDe(paquete) {
  const res = {};
  for (const c of CARPETAS) {
    for (const rel of recorrer(path.join(paquete.dir, c))) {
      res[path.posix.join(".claude", c, ...rel.split(path.sep))] = path.join(paquete.dir, c, rel);
    }
  }
  return res;
}

export function leerLock(proyecto) {
  const f = path.join(proyecto, LOCK);
  return fs.existsSync(f) ? leerJson(f) : null;
}

function bloque(ids, cat, ver) {
  const partes = ids
    .map((id) => {
      const f = path.join(cat[id].dir, "claude.md");
      return fs.existsSync(f) ? `### ${id}\n\n${fs.readFileSync(f, "utf8").trim()}` : null;
    })
    .filter(Boolean);
  // Líneas en blanco alrededor de los comentarios: así el bloque ya está como lo deja prettier.
  return [INICIO, "", `## Reglas de los paquetes (claude-config v${ver})`, "", partes.join("\n\n"), "", FIN].join("\n");
}

/** Lo instalado en .claude/ lo gestiona claude-config: que el formateador del proyecto no lo toque. */
function ignorarEnPrettier(proyecto) {
  const f = path.join(proyecto, ".prettierignore");
  if (!fs.existsSync(f)) return false;
  const texto = fs.readFileSync(f, "utf8");
  if (texto.split(/\r?\n/).some((l) => [".claude", ".claude/", "/.claude", "/.claude/"].includes(l.trim()))) return false;
  fs.writeFileSync(f, texto.replace(/\n?$/, "\n") + ".claude/\n");
  return true;
}

function escribirClaudeMd(proyecto, lib, ids, cat, ver) {
  const f = path.join(proyecto, "CLAUDE.md");
  const plantilla = path.join(lib, "templates", "CLAUDE.proyecto.md");
  let texto = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : fs.existsSync(plantilla) ? fs.readFileSync(plantilla, "utf8") : "# CLAUDE.md\n";
  const i = texto.indexOf(INICIO);
  const j = texto.indexOf(FIN);
  if (i !== -1 && j > i) texto = (texto.slice(0, i).trimEnd() + "\n" + texto.slice(j + FIN.length).trimStart()).trimEnd() + "\n";
  if (ids.length) texto = texto.trimEnd() + "\n\n" + bloque(ids, cat, ver) + "\n";
  fs.writeFileSync(f, texto);
}

function borrarCarpetasVacias(dir, tope) {
  while (dir.startsWith(tope) && dir !== tope && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/**
 * Deja instalados en `proyecto` exactamente los paquetes `ids` (más sus requisitos) de la versión actual de `lib`.
 * Nunca pisa ni borra un fichero que la persona haya cambiado: deja el nuevo al lado como `<fichero>.nuevo`.
 */
export function aplicar(proyecto, lib, ids) {
  const cat = catalogo(lib);
  const desconocidos = ids.filter((id) => !cat[id]);
  if (desconocidos.length) throw new Error(`Paquetes que no existen: ${desconocidos.join(", ")}`);
  const elegidos = conRequisitos(ids, cat);
  const ver = version(lib);
  const previo = leerLock(proyecto)?.ficheros ?? {};
  const deseados = Object.assign({}, ...elegidos.map((id) => ficherosDe(cat[id])));
  const informe = { escritos: [], conflictos: [], borrados: [], conservados: [] };
  const ficheros = {};

  for (const [rel, origen] of Object.entries(deseados)) {
    const destino = path.join(proyecto, rel);
    const nuevo = fs.readFileSync(origen);
    const hashNuevo = sha(nuevo);
    if (fs.existsSync(destino)) {
      const actual = sha(fs.readFileSync(destino));
      const tocado = previo[rel] ? actual !== previo[rel] : true;
      if (actual === hashNuevo) {
        ficheros[rel] = hashNuevo;
        continue;
      }
      if (tocado) {
        fs.writeFileSync(destino + ".nuevo", nuevo);
        informe.conflictos.push(rel);
        ficheros[rel] = previo[rel] ?? actual;
        continue;
      }
    }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, nuevo);
    informe.escritos.push(rel);
    ficheros[rel] = hashNuevo;
  }

  for (const [rel, hash] of Object.entries(previo)) {
    if (deseados[rel]) continue;
    const destino = path.join(proyecto, rel);
    if (!fs.existsSync(destino)) continue;
    if (sha(fs.readFileSync(destino)) === hash) {
      fs.rmSync(destino);
      borrarCarpetasVacias(path.dirname(destino), path.join(proyecto, ".claude"));
      informe.borrados.push(rel);
    } else {
      informe.conservados.push(rel);
    }
  }

  escribirClaudeMd(proyecto, lib, elegidos, cat, ver);
  if (elegidos.length && ignorarEnPrettier(proyecto)) informe.escritos.push(".prettierignore (+ .claude/)");
  fs.mkdirSync(path.join(proyecto, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(proyecto, LOCK), JSON.stringify({ version: ver, paquetes: elegidos, ficheros }, null, 2) + "\n");
  return { ...informe, paquetes: elegidos, version: ver };
}

/** Ficheros instalados que la persona ha cambiado desde la última instalación. */
export function modificados(proyecto) {
  const lock = leerLock(proyecto);
  if (!lock) return [];
  return Object.entries(lock.ficheros).filter(([rel, hash]) => {
    const f = path.join(proyecto, rel);
    return fs.existsSync(f) && sha(fs.readFileSync(f)) !== hash;
  }).map(([rel]) => rel);
}

/** Secciones del CHANGELOG posteriores a `desde` y hasta `hasta` (incluida). */
export function cambiosEntre(lib, desde, hasta) {
  const f = path.join(lib, "CHANGELOG.md");
  if (!fs.existsSync(f)) return "";
  const secciones = fs.readFileSync(f, "utf8").split(/^(?=## )/m).filter((s) => s.startsWith("## "));
  const num = (v) => v.split(".").map(Number);
  const mayor = (a, b) => {
    const [x, y] = [num(a), num(b)];
    for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] > y[k];
    return false;
  };
  return secciones
    .filter((s) => {
      const v = s.match(/^## \[?v?(\d+\.\d+\.\d+)/)?.[1];
      return v && (!desde || mayor(v, desde)) && !mayor(v, hasta);
    })
    .join("")
    .trim();
}
