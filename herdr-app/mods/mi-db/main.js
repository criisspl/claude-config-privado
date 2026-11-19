// Visor de la última consulta SQL que ejecuta Claude (la guarda hooks/db-visor.sh en data/db-ultima.json).
//  - Con props { barra: true } (bloque `db` del layout) vigila el fichero y abre el panel al llegar una consulta nueva.
//  - Sin props es el panel: consulta arriba y resultado como tabla. Esc cierra.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, openOverlay, closeOverlay, props, checking } from "herdr";

const FICHERO = "$HOME/.config/herdr-app/data/db-ultima.json";
const MAX_FILAS = 200;
const leer = async () => {
  try {
    const r = await exec("sh", ["-c", `cat ${FICHERO} 2>/dev/null`]);
    return r.stdout ? JSON.parse(r.stdout) : null;
  } catch { return null; }
};

// Saca filas {col: valor} de lo que devuelva la herramienta; si no hay tabla, devuelve el texto.
const aFilas = (x) => {
  if (typeof x === "string") { try { return aFilas(JSON.parse(x)); } catch { return { texto: x }; } }
  if (Array.isArray(x)) {
    if (x.length && x.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      if (x.every((r) => r.type === "text" && "text" in r)) return aFilas(x.map((r) => r.text).join("\n"));
      return { filas: x };
    }
    if (x.length && x.every((r) => Array.isArray(r))) return { filas: x.map((r) => Object.fromEntries(r.map((v, i) => [`#${i + 1}`, v]))) };
    return { texto: JSON.stringify(x, null, 1) };
  }
  if (x && typeof x === "object") {
    for (const k of ["rows", "results", "data", "result"]) if (x[k] != null && k !== "result") { const r = aFilas(x[k]); if (r.filas) return r; }
    if (x.result != null) return aFilas(x.result);
    if (x.content != null) return aFilas(x.content);
    return { texto: JSON.stringify(x, null, 1) };
  }
  return { texto: String(x ?? "") };
};
const celda = (v) => (v == null ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));
const hora = (ts) => new Date(ts * 1000).toTimeString().slice(0, 8);

export default class Db extends View {
  init(_props, cx) {
    this.barra = Boolean(props()?.barra);
    this.d = null;
    this.visto = 0;
    if (checking()) return;
    const tick = (cx2) => cx2.spawn(async (cx3) => {
      const d = await leer();
      if (this.barra) {
        if (d && !this.visto) this.visto = d.ts;            // lo anterior al arranque no abre nada
        else if (d && d.ts > this.visto) { this.visto = d.ts; openOverlay({ mod: "mi-db", kind: "dialog", width: 980, height: 620 }); }
      } else if (d?.ts !== this.d?.ts) this.d = d;
      cx3.notify();
    });
    tick(cx);
    cx.timer.every(this.barra ? 2000 : 1500, tick);
  }

  render(cx) {
    const t = theme();
    if (this.barra) return div().size_full();
    const raiz = v_flex().id("db").size_full().min_h(0).p(10).gap(8).bg(t.popover).text_size(12.5)
      .on_key_down((e) => { if (e.key === "escape") closeOverlay(props()?.overlay); });
    const d = this.d;
    if (!d) return raiz.child(div().text_color(t.dim).child("Aún no hay consultas. Aparecerán cuando Claude use una base de datos."));
    const r = aFilas(d.response);
    raiz.child(h_flex().flex_none().gap(8).text_size(11).text_color(t.dim)
      .child(div().child(hora(d.ts))).child(div().flex_1().truncate().child(String(d.tool).replace(/^mcp__/, ""))).child(div().child("Esc cierra")));
    raiz.child(div().flex_none().max_h(110).overflow_hidden().px(10).py(8).rounded(6).bg(t.raised).text_color(t.foreground).child(String(d.query)));
    if (!r.filas) {
      return raiz.child(div().flex_1().min_h(0).overflow_y_scrollbar().id("db-texto").px(10).py(8).rounded(6).bg(t.raised).text_color(t.foreground).child(r.texto || "(sin resultado)"));
    }
    const filas = r.filas.slice(0, MAX_FILAS);
    const cols = [...new Set(filas.slice(0, 50).flatMap((f) => Object.keys(f)))];
    const ancho = (c) => Math.min(280, Math.max(60, 14 + 7.4 * Math.max(c.length, ...filas.slice(0, 50).map((f) => celda(f[c]).length))));
    const fila = (f, i, cab) => h_flex().flex_none().h(26).items_center().px(8).gap(12).bg(cab ? t.raised : i % 2 ? t.hover : "#00000000")
      .children(cols.map((c) => div().flex_none().w(ancho(c)).truncate().text_color(cab ? t.muted : celda(f[c]) === "NULL" ? t.dim : t.foreground).child(cab ? c : celda(f[c]))));
    raiz.child(v_flex().id("db-tabla").flex_1().min_h(0).overflow_y_scrollbar().rounded(6).border_1().border_color(t.border)
      .child(fila(null, 0, true)).children(filas.map((f, i) => fila(f, i, false))));
    return raiz.child(div().flex_none().text_size(11).text_color(t.dim).child(`${r.filas.length} filas${r.filas.length > MAX_FILAS ? ` (se muestran ${MAX_FILAS})` : ""}`));
  }
}
