// Lógica pura de mi-pendientes (sin API de Herdr): filtros, etiquetas y reconciliación.
// La prueban tests/herdr-pendientes.test.mjs.

export const DIAS3 = 3 * 86400000;
export const RAMAS_BASE = ["main", "master", "develop", "dev", "trunk"];
export const ETIQUETAS_AUTO = ["agente-esperando", "sin-commit", "sin-push", "pr-comentarios", "ci-rojo", "olvidado"];

// Space de la cuenta personal: cw lo nombra «me · …» (y ~/.bashrc activa la cuenta por ese prefijo).
export const esPersonal = (nombre) => /^me\s*·\s*/i.test(nombre ?? "");

export const ticketDe = (rama) => /[A-Za-z][A-Za-z0-9]*-\d+/.exec(rama ?? "")?.[0]?.toUpperCase() ?? null;

// Repo a partir de --git-common-dir (como hace mi-spaces).
export function nombreRepo(common) {
  const c = (common ?? "").trim().replace(/\/+$/, "");
  const base = (p) => p.split("/").pop();
  return c.endsWith("/.git") ? base(c.slice(0, -5)) : base(c).replace(/\.git$/, "");
}

export function antiguedad(ts, ahora = Date.now()) {
  if (!ts) return "";
  const m = Math.floor(Math.max(0, ahora - ts) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Puntuación difusa: -1 si no encaja; más alto = mejor (prefijo y seguidos puntúan más).
export function puntuar(consulta, texto) {
  const q = (consulta ?? "").toLowerCase().trim();
  if (!q) return 0;
  const t = (texto ?? "").toLowerCase();
  const i = t.indexOf(q);
  if (i >= 0) return 100 - Math.min(i, 50) + (i === 0 ? 20 : 0);
  let pos = 0, score = 0, racha = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const j = t.indexOf(ch, pos);
    if (j < 0) return -1;
    racha = j === pos ? racha + 1 : 0;
    score += 1 + racha;
    pos = j + 1;
  }
  return score;
}

// "is:open repo:web -label:manual sort:oldest texto libre" → partes. Admite comillas: repo:"mi repo".
export function tokenizar(q) {
  const out = [];
  const re = /(-?[a-z]+:)?(?:"([^"]*)"|(\S+))/gi;
  let m;
  while ((m = re.exec(q ?? ""))) out.push({ clave: m[1] ? m[1].toLowerCase() : "", valor: m[2] ?? m[3] ?? "" });
  return out;
}

export function parseFiltro(q) {
  const f = { estado: null, repos: [], labels: [], orden: "newest", texto: "" };
  const libre = [];
  for (const { clave, valor } of tokenizar(q)) {
    const v = valor.toLowerCase();
    if (clave === "is:") {
      if (v === "open" || v === "closed") f.estado = v;
    } else if (clave === "repo:" || clave === "-repo:") f.repos.push({ v, no: clave[0] === "-" });
    else if (clave === "label:" || clave === "-label:") f.labels.push({ v, no: clave[0] === "-" });
    else if (clave === "sort:") {
      if (v === "oldest" || v === "newest") f.orden = v;
    } else libre.push(clave ? clave + valor : valor);
  }
  f.texto = libre.join(" ");
  return f;
}

// ¿Lleva la consulta algún filtro tipo GitHub? (para saber si se filtra pendientes o se busca en todo)
export const tieneFiltros = (q) => tokenizar(q).some((t) => t.clave);

export function aplicarFiltro(items, f, estadoPorDefecto = "open") {
  const estado = f.estado ?? estadoPorDefecto;
  const puntos = new Map();
  const res = items.filter((it) => {
    if ((it.cerrado ? "closed" : "open") !== estado) return false;
    for (const r of f.repos) if ((it.repo ?? "").toLowerCase().includes(r.v) === r.no) return false;
    for (const l of f.labels) if ((it.etiquetas ?? []).includes(l.v) === l.no) return false;
    if (f.texto) {
      const s = puntuar(f.texto, [it.titulo, it.repo, it.rama, it.ticket, ...(it.etiquetas ?? [])].filter(Boolean).join(" "));
      if (s < 0) return false;
      puntos.set(it.id, s);
    }
    return true;
  });
  const t = (it) => (estado === "closed" ? it.cerrado : it.creado) ?? 0;
  return res.sort((a, b) => (puntos.get(b.id) ?? 0) - (puntos.get(a.id) ?? 0) || (f.orden === "oldest" ? t(a) - t(b) : t(b) - t(a)));
}

// Etiquetas de un checkout desde la salida de git. Todo texto crudo, sin ejecutar nada.
//   porcelain: `git status --porcelain`; sinPush: salida de `git log @{u}..` (o los no publicados);
//   ultimoCommit: ms del último commit; rama: nombre de la rama.
export function etiquetasGit({ porcelain, sinPush, ultimoCommit, rama, ahora = Date.now() }) {
  const et = [];
  if ((porcelain ?? "").trim()) et.push("sin-commit");
  if ((sinPush ?? "").trim()) et.push("sin-push");
  if (rama && !RAMAS_BASE.includes(rama) && rama !== "(detached)" && ultimoCommit && ahora - ultimoCommit > DIAS3) et.push("olvidado");
  return et;
}

const MAL_CI = new Set(["FAILURE", "TIMED_OUT", "ERROR", "STARTUP_FAILURE", "ACTION_REQUIRED"]);

// `gh pr list --json number,title,headRefName,reviewDecision,statusCheckRollup,comments,author,createdAt,url`
export function evaluarPrs(json) {
  let lista;
  try { lista = typeof json === "string" ? JSON.parse(json || "[]") : json; } catch { return []; }
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((pr) => {
    const et = [];
    const mio = pr.author?.login;
    const ajenos = (pr.comments ?? []).filter((c) => c.author?.login && c.author.login !== mio && !/\[bot\]$|^app\//.test(c.author.login));
    if (pr.reviewDecision === "CHANGES_REQUESTED" || ajenos.length) et.push("pr-comentarios");
    if ((pr.statusCheckRollup ?? []).some((c) => MAL_CI.has(c.conclusion) || MAL_CI.has(c.state))) et.push("ci-rojo");
    if (!et.length) return [];
    return [{ numero: pr.number, titulo: pr.title, rama: pr.headRefName, url: pr.url, creado: Date.parse(pr.createdAt) || null, etiquetas: et }];
  });
}

// Detectados ahora (sin cerrado) frente a lo guardado. Un automático que ya no se detecta se cierra solo;
// uno cerrado que vuelve a aparecer se reabre. Los manuales no se tocan. Los cerrados viejos se podan.
export function reconciliar(guardados, detectados, ahora = Date.now()) {
  const vistos = new Set(detectados.map((d) => d.id));
  const previo = new Map(guardados.map((g) => [g.id, g]));
  const out = [];
  for (const g of guardados) {
    if (g.tipo !== "auto" || vistos.has(g.id)) out.push(g);
    else if (!vistos.has(g.id)) {
      if (!g.cerrado) out.push({ ...g, cerrado: ahora });
      else if (ahora - g.cerrado < 30 * 86400000) out.push(g);
    }
  }
  for (const d of detectados) {
    const g = previo.get(d.id);
    if (!g) out.push({ ...d, tipo: "auto", creado: d.creado ?? ahora, cerrado: null });
    else {
      const i = out.findIndex((x) => x.id === d.id);
      const reabre = Boolean(g.cerrado);
      out[i] = { ...g, ...d, tipo: "auto", creado: reabre ? (d.creado ?? ahora) : (g.creado ?? d.creado ?? ahora), cerrado: null };
    }
  }
  return out;
}

export function nuevoManual({ titulo, repo, etiquetas }, ahora = Date.now()) {
  const et = [...new Set(["manual", ...(etiquetas ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)])];
  return { id: `manual:${ahora}:${Math.random().toString(36).slice(2, 6)}`, tipo: "manual", titulo: titulo.trim(), repo: (repo ?? "").trim(), rama: null, ticket: null, etiquetas: et, creado: ahora, cerrado: null };
}

export function cerrar(items, id, ahora = Date.now()) {
  return items.map((it) => (it.id === id && !it.cerrado ? { ...it, cerrado: ahora } : it));
}

export function leerAlmacen(texto) {
  try {
    const d = JSON.parse(texto);
    return Array.isArray(d?.items) ? d.items : [];
  } catch {
    return [];
  }
}
export const serializar = (items) => JSON.stringify({ version: 1, items }, null, 1);
