// Lógica pura de mi-auditoria (sin API de Herdr): parseo de ultima.json / historial.jsonl, orden, escalas y tendencia.
// La prueba tests/herdr-auditoria.test.mjs. Contrato de ficheros: <repo>/.claude/auditoria/ (lo escribe /auditar).

export const SEVERIDADES = ["critica", "alta", "media", "baja"];
export const COLOR_SEV = { critica: "#ef5350", alta: "#f0883e", media: "#e5c23a", baja: "#8a8fa3" };
export const NOMBRE_SEV = { critica: "Crítica", alta: "Alta", media: "Media", baja: "Baja" };
export const TIPOS = ["dependencia", "codigo", "secreto"];
export const NOMBRE_TIPO = { dependencia: "Dependencias", codigo: "Código", secreto: "Secretos" };

const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : 0);
const objeto = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const contar = (obj, claves) => Object.fromEntries(claves.map((k) => [k, num(obj[k])]));

// ultima.json → objeto normalizado, o null si falta, está corrupto o no es un objeto.
export function parseUltima(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { return null; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const hallazgos = (Array.isArray(d.hallazgos) ? d.hallazgos : []).filter((h) => h && typeof h === "object" && !Array.isArray(h));
  const resumen = contar(objeto(d.resumen), SEVERIDADES);
  if (!d.resumen) for (const h of hallazgos) if (resumen[h.severidad] !== undefined) resumen[h.severidad]++;
  const por_tipo = contar(objeto(d.por_tipo), TIPOS);
  if (!d.por_tipo) for (const h of hallazgos) if (por_tipo[h.tipo] !== undefined) por_tipo[h.tipo]++;
  return {
    ts: typeof d.ts === "string" ? d.ts : null,
    proyecto: typeof d.proyecto === "string" ? d.proyecto : "",
    rama: typeof d.rama === "string" ? d.rama : "",
    herramientas: objeto(d.herramientas),
    resumen, por_tipo, hallazgos,
  };
}

// historial.jsonl → [{ts, resumen, total}] en orden de fichero; las líneas rotas se saltan.
export function parseHistorial(texto) {
  const out = [];
  for (const linea of (texto ?? "").split("\n")) {
    if (!linea.trim()) continue;
    let d;
    try { d = JSON.parse(linea); } catch { continue; }
    if (!d || typeof d !== "object" || Array.isArray(d)) continue;
    const resumen = contar(objeto(d.resumen), SEVERIDADES);
    const suma = SEVERIDADES.reduce((a, s) => a + resumen[s], 0);
    out.push({ ts: typeof d.ts === "string" ? d.ts : null, resumen, total: d.total === undefined ? suma : num(d.total) });
  }
  return out;
}

// Más graves primero; a igual severidad, por título.
export function ordenarHallazgos(hs) {
  const r = (h) => { const i = SEVERIDADES.indexOf(h.severidad); return i < 0 ? SEVERIDADES.length : i; };
  return [...hs].sort((a, b) => r(a) - r(b) || String(a.titulo ?? "").localeCompare(String(b.titulo ?? "")));
}

// Ancho en px de una barra: proporcional al máximo; un valor > 0 nunca desaparece (mínimo 3 px).
export function anchoBarra(valor, max, ancho) {
  if (!(valor > 0) || !(max > 0)) return 0;
  return Math.max(3, Math.round((valor / max) * ancho));
}

// Alturas de los segmentos de una columna apilada (crítica arriba). Mismo mínimo de 2 px por segmento no vacío.
export function segmentosApilados(resumen, maxTotal, alto) {
  return SEVERIDADES.filter((s) => resumen[s] > 0).map((s) => ({ sev: s, alto: Math.max(2, Math.round((resumen[s] / maxTotal) * alto)) }));
}

export const ultimasEjecuciones = (hist, n = 12) => hist.slice(-n);

// Total de la última ejecución frente a la anterior. null si hay menos de dos.
export function tendencia(hist) {
  if (hist.length < 2) return null;
  const delta = hist[hist.length - 1].total - hist[hist.length - 2].total;
  return { delta, flecha: delta > 0 ? "↑" : delta < 0 ? "↓" : "=" };
}

export function herramientasPorEstado(h) {
  const out = { ok: [], noDisponible: [], error: [] };
  for (const [nombre, estado] of Object.entries(objeto(h))) {
    if (estado === "ok") out.ok.push(nombre);
    else if (estado === "no-disponible") out.noDisponible.push(nombre);
    else out.error.push(nombre);
  }
  return out;
}

// paquete@versión o fichero:línea
export function lugarHallazgo(h) {
  if (h.paquete) return h.version ? `${h.paquete}@${h.version}` : String(h.paquete);
  if (h.fichero) return h.linea ? `${h.fichero}:${h.linea}` : String(h.fichero);
  return "";
}

export function arregloHallazgo(h) {
  const a = h.arreglo;
  if (!a || typeof a !== "object") return "";
  if (a.descripcion) return String(a.descripcion);
  return a.version_fija ? `actualizar a ${a.version_fija}` : "";
}

// Texto que se manda al agente; el id se limita a caracteres seguros (nada de saltos de línea ni espacios).
export const comandoArreglar = (id) => (/^[\w.:@\/#-]+$/.test(String(id ?? "")) ? `/auditar arreglar ${id}` : null);
export const COMANDO_AUDITAR = "/auditar";

export function fechaCorta(ts) {
  const d = new Date(ts ?? "");
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
