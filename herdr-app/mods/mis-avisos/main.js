// Avisos de los bots que requieren acción (vigia-ci, pr-ready, pro-pendientes, eod-review, catbot crítico).
// Lee GET /api/avisos del panel (~/projects/panel, :4777); «Hecho» hace POST /api/avisos/ID/done.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, checking, notify, run, props, shared, setShared } from "herdr";

const BASE = "http://127.0.0.1:4777";
const REFRESH_MS = 60000;

export default class MisAvisos extends View {
  init(_props, cx) {
    this.state = { status: "loading", items: [], at: null };
    this.busy = false;
    this.exp = null;
    if (checking()) return;
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(`${BASE}/api/avisos`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const items = await r.json();
        this.state = { status: "ok", items, at: new Date() };
        try { setShared("avisos.n", items.length); } catch (_e) { /* sin contador */ }
        if (!props()?.panel) this.toasts(items);
      } catch (_e) {
        this.state = { status: "off", items: this.state.items, at: this.state.at };
      }
      this.busy = false;
      cx.notify();
    });
  }

  // Toast una sola vez por aviso con toast:true (ids ya vistos persistidos en shared).
  toasts(items) {
    let vistos = [];
    try { vistos = shared("avisos-vistos") ?? []; } catch (_e) { /* sin estado */ }
    const nuevos = items.filter((i) => i.toast && !vistos.includes(`${i.id}@${i.ts}`));
    for (const i of nuevos) notify({ title: i.title, body: String(i.msg ?? "").split("\n")[0], level: "warning", timeout: 15000 });
    if (nuevos.length) {
      const vivos = items.map((i) => `${i.id}@${i.ts}`);
      try { setShared("avisos-vistos", vivos); } catch (_e) { /* idem */ }
    }
  }

  // Barra lateral: abre el panel Avisos. Dentro del panel: despliega el texto completo.
  abrir(i, cx) {
    if (!props()?.panel) { run("layout.select", { stack: "panel-body", child: "p-avisos" }); run("layout.show", { id: "panel" }); return; }
    this.exp = this.exp === i.id ? null : i.id;
    cx.notify();
  }

  done(id, cx) {
    cx.spawn(async (cx) => {
      try {
        await fetch(`${BASE}/api/avisos/${id}/done`, { method: "POST", headers: { "x-panel": "1" } });
      } catch (_e) { /* el siguiente refresco lo recoge */ }
      this.busy = false;
      this.refresh(cx);
    });
  }

  render(_props, cx) {
    const t = theme();
    const { status, items, at } = this.state;
    const head = h_flex().h(32).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Avisos"))
      .child(div().text_size(11).text_color(t.dim).child(String(items.length)))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(
        status === "off" ? "panel apagado" : status === "loading" ? "cargando…" : at.toTimeString().slice(0, 5)));
    const body = v_flex().id("avisos-list").flex_1().min_h(0).overflow_y_scrollbar();
    if (!items.length) {
      body.child(div().p(12).text_size(12).text_color(t.dim).child(
        status === "off" ? "Panel no disponible en 127.0.0.1:4777" : status === "loading" ? "Cargando avisos…" : "Nada pendiente"));
    }
    for (const i of items) {
      const hora = String(i.ts ?? "").slice(11, 16);
      body.child(v_flex().id(`a-${i.id}`).flex_none().px(12).py(6).gap(4).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, c) => this.abrir(i, c)).border_b(1).border_color(t.border)
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.accent).child(i.title))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(hora)))
        .child(this.exp === i.id ? div().text_size(12).text_color(t.foreground).child(i.msg) : div().text_size(12).text_color(t.foreground).max_h(36).overflow_hidden().child(i.msg))
        .child(h_flex().gap(6).child(
          div().id(`d-${i.id}`).flex_none().px(8).h(22).rounded(5).bg(t.accent + "26").text_color(t.accent)
            .flex().items_center().cursor_pointer().hover((s) => s.bg(t.accent + "40"))
            .on_click((_e, c) => { c.stop_propagation(); this.done(i.id, c); }).child("Hecho"))));
    }
    return v_flex().size_full().bg(t.surface).text_color(t.foreground).text_size(12).child(head).child(body);
  }
}
