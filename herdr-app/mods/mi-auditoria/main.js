// Panel de la auditoría de seguridad del proyecto del space activo (la escribe la skill /auditar).
//  - Se abre desde la paleta de mi-pendientes («Auditoría de seguridad») o desde un pendiente `vulnerabilidad`
//    (en ese caso con props { spaceId }). Sin tecla propia.
//  - Lee <raíz del repo>/.claude/auditoria/ultima.json y historial.jsonl con exec (cat).
//  - Flechas navegan, Enter manda `/auditar arreglar <id>` al agente del space (o `/auditar` en «Volver a auditar»),
//    Esc cierra. El envío usa la CLI `herdr pane send-text`, igual que el script cw.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, exec, theme, closeOverlay, props, checking } from "herdr";
import {
  SEVERIDADES, COLOR_SEV, NOMBRE_SEV, TIPOS, NOMBRE_TIPO, COMANDO_AUDITAR, parseUltima, parseHistorial,
  ordenarHallazgos, anchoBarra, segmentosApilados, ultimasEjecuciones, tendencia, herramientasPorEstado,
  lugarHallazgo, arregloHallazgo, comandoArreglar, fechaCorta,
} from "./logica.js";

const OK = "#3fae6a";
const ANCHO_BARRA = 120;
const ALTO_COL = 44;

const lugar = (s, ps) => {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
};
const cat = async (ruta) => (await exec("sh", ["-c", 'cat "$1" 2>/dev/null', "sh", ruta])).stdout;

export default class Auditoria extends View {
  init(_props, cx) {
    this.u = null;
    this.hist = [];
    this.cargado = false;
    this.at = 0;
    this.aviso = "";
    this.spaceId = null;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { await this.cargar(); } catch { /* sin datos: se enseña «Sin auditoría» */ }
      this.cargado = true;
      this.at = this.u?.hallazgos.length ? 1 : 0; // la primera fila es «Volver a auditar»
      cx.notify();
    });
  }

  async cargar() {
    const ps = panes();
    const sp = spaces().find((s) => s.id === props()?.spaceId) ?? spaces().find((s) => s.active);
    if (!sp) return;
    this.spaceId = sp.id;
    const dir = lugar(sp, ps);
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dir, timeout: 20000 });
    if (r.code !== 0 || !r.stdout.trim()) return;
    const base = `${r.stdout.trim()}/.claude/auditoria`;
    this.u = parseUltima(await cat(`${base}/ultima.json`));
    this.hist = parseHistorial(await cat(`${base}/historial.jsonl`));
  }

  filas() {
    return [{ accion: true }, ...ordenarHallazgos(this.u?.hallazgos ?? []).map((h) => ({ h }))];
  }

  // Manda texto al agente del space (el que espera, si hay varios) con la CLI de herdr, como hace cw.
  async enviar(texto, cx) {
    const ag = agents().find((a) => a.space === this.spaceId && a.status === "blocked") ?? agents().find((a) => a.space === this.spaceId);
    if (!ag) { this.aviso = "No hay agente en este space."; cx.notify(); return; }
    try {
      const r = await exec("herdr", ["pane", "send-text", ag.pane, `${texto}\n`], { timeout: 15000 });
      if (r.code !== 0) throw new Error("send-text");
      closeOverlay(props()?.overlay);
    } catch {
      this.aviso = `No se pudo enviar al agente. Escríbelo tú: ${texto}`;
      cx.notify();
    }
  }

  elegir(f, cx) {
    if (!f) return;
    if (f.accion) return this.enviar(COMANDO_AUDITAR, cx);
    const c = comandoArreglar(f.h.id);
    if (!c) { this.aviso = "Este hallazgo no tiene un id válido."; cx.notify(); return; }
    return this.enviar(c, cx);
  }

  tecla(e, cx) {
    const k = e.key;
    const filas = this.filas();
    const n = filas.length;
    if (k === "escape") return closeOverlay(props()?.overlay);
    if (k === "down") this.at = (this.at + 1) % n;
    else if (k === "up") this.at = (this.at + n - 1) % n;
    else if (k === "enter") return this.elegir(filas[Math.min(this.at, n - 1)], cx);
    else return;
    this.aviso = "";
    this.scroll.scroll_to_item(Math.min(this.at, n - 1));
    cx.notify();
  }

  pildora(texto, color) {
    return div().flex_none().px(6).h(16).rounded(5).bg(color + "26").text_size(10.5).text_color(color).flex().items_center().child(texto);
  }

  // Barras horizontales: etiqueta, barra proporcional al máximo y número.
  grafica(t, titulo, datos) {
    const max = Math.max(0, ...datos.map((d) => d.valor));
    return v_flex().flex_1().min_w(0).gap(3)
      .child(div().text_size(11).text_color(t.muted).child(titulo))
      .children(datos.map((d) => h_flex().gap(6).items_center()
        .child(div().w(70).text_size(11).text_color(t.dim).child(d.nombre))
        .child(div().h(9).w(anchoBarra(d.valor, max, ANCHO_BARRA)).rounded(2).bg(d.color))
        .child(div().text_size(11).font_semibold().text_color(d.valor ? t.foreground : t.dim).child(String(d.valor)))));
  }

  evolucion(t) {
    const hs = ultimasEjecuciones(this.hist, 12);
    const tend = tendencia(hs);
    const max = Math.max(0, ...hs.map((h) => h.total));
    const colorFlecha = !tend || tend.delta === 0 ? t.dim : tend.delta > 0 ? COLOR_SEV.critica : OK;
    return v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11).text_color(t.muted).child("Evolución"))
        .when(Boolean(tend), (el) => el.child(div().text_size(11).font_semibold().text_color(colorFlecha).child(`${tend.flecha} ${tend.delta > 0 ? "+" : ""}${tend.delta}`))))
      .child(hs.length
        ? h_flex().gap(3).h(ALTO_COL).children(hs.map((h) => v_flex().w(14).h(ALTO_COL).justify_end()
          .children(segmentosApilados(h.resumen, max, ALTO_COL).map((s) => div().w(14).h(s.alto).bg(COLOR_SEV[s.sev])))))
        : div().text_size(11).text_color(t.dim).child("Sin historial"));
  }

  cabecera(t) {
    const u = this.u;
    const hp = herramientasPorEstado(u.herramientas);
    return v_flex().gap(4).px(4)
      .child(h_flex().gap(8).items_center()
        .child(div().font_semibold().text_color(t.foreground).child(u.proyecto || "Proyecto"))
        .child(div().text_color(t.muted).child(u.rama))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(u.ts ? `Auditoría del ${fechaCorta(u.ts)}` : "")))
      .child(h_flex().gap(5).items_center()
        .children(hp.ok.map((n) => this.pildora(n, OK)))
        .children(hp.error.map((n) => this.pildora(`${n}: error`, COLOR_SEV.critica)))
        .children(hp.noDisponible.map((n) => this.pildora(`${n}: no disponible`, t.dim))));
  }

  fila(t, f, i) {
    const sel = i === this.at;
    const base = h_flex().id(`au-${i}`).px(10).gap(9).rounded(7).flex_none().items_center()
      .when(sel, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.elegir(f, cx));
    if (f.accion) return base.h(32).child(div().text_color(t.accent).child("›")).child(div().flex_1().text_color(t.foreground).child("Volver a auditar"));
    const h = f.h;
    const color = COLOR_SEV[h.severidad] ?? t.dim;
    const arreglo = arregloHallazgo(h);
    return base.h(44)
      .child(this.pildora(NOMBRE_SEV[h.severidad] ?? "?", color))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_color(t.foreground).child(String(h.titulo ?? h.id ?? "")))
        .child(div().truncate().text_size(11).text_color(t.dim).child([lugarHallazgo(h), arreglo && `arreglo: ${arreglo}`].filter(Boolean).join(" · "))));
  }

  render(cx) {
    const t = theme();
    const raiz = v_flex().id("auditoria").track_focus(this.handle).size_full().min_h(0).p(8).gap(8).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => this.tecla(e, cx));
    if (!this.cargado) return raiz.child(div().px(10).py(12).text_color(t.dim).child("Cargando…"));
    const lista = this.filas();
    const u = this.u;
    const pie = this.aviso ? div().px(10).text_size(11).text_color(COLOR_SEV.critica).child(this.aviso) : div().px(10).text_size(11).text_color(t.dim).child("↑↓ navegar · Enter manda al agente · Esc cierra");
    if (!u) {
      return raiz
        .child(div().px(10).py(12).text_color(t.dim).child("Sin auditoría: ejecuta /auditar"))
        .child(this.fila(t, lista[0], 0))
        .child(pie);
    }
    return raiz
      .child(this.cabecera(t))
      .child(h_flex().gap(14).px(4)
        .child(this.grafica(t, "Por severidad", SEVERIDADES.map((s) => ({ nombre: NOMBRE_SEV[s], valor: u.resumen[s], color: COLOR_SEV[s] }))))
        .child(this.grafica(t, "Por tipo", TIPOS.map((k) => ({ nombre: NOMBRE_TIPO[k], valor: u.por_tipo[k], color: t.accent }))))
        .child(this.evolucion(t)))
      .child(v_flex().id("au-lista").flex_1().min_h(0).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        .children(lista.map((f, i) => this.fila(t, f, i)))
        .when(lista.length === 1, (el) => el.child(div().px(10).py(12).text_color(t.dim).child("Sin hallazgos."))))
      .child(pie);
  }
}
