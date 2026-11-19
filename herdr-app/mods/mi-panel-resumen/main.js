// Resumen de bots (GET /api/bots del panel personal); al hacer clic abre la pestaña Panel completa.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, checking, run, spaces, notify, playSound } from "herdr";

const BASE = "http://127.0.0.1:4777";
const hhmm = (s) => { const m = /(\d\d:\d\d):\d\d/.exec(s ?? ""); return m ? m[1] : "—"; };
const D = "mods/mi-panel-resumen/";
const informe = (id) => {
  const name = `Bot ${id}`;
  for (const sp of spaces()) { const tb = (sp.tabs ?? []).find((x) => x.name === name); if (tb) { run("space.select", { id: sp.id }); return run("tab.select", { id: tb.id }); } }
  run("tab.new", { name, argv: ["journalctl", "--user", "-u", `${id}.service`, "-n", "300", "-f"] });
};
// Comecocos por estado (los de mi-bots): ok/working = amarillo comiendo, warn = naranja, error = fantasma, off = punto.
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const pacman = (st, n = 14, c) => {
  const box = div().relative().w(n).h(n).flex_none();
  const ly = (f) => image(`${D}${f}.svg`).absolute().top(0).left(0).w(n).h(n);
  const k = st === "warn" ? "botw" : st === "error" ? "bote" : st === "off" ? "boto" : `bot${hue(c ?? 0)}`;
  return box.child(ly(`${k}-a`)).child(ly(`${k}-b`).loop("opacity", { from: 0, to: 1, period: 600, easing: "linear" }));
};
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default class PanelResumen extends View {
  init(_props, cx) {
    this.bots = null;
    this.open = null;
    this.manual = true;
    if (checking()) return;
    const tick = (cx2) => cx2.spawn(async (cx3) => {
      try {
        const r = await fetch(`${BASE}/api/bots`, { headers: { "x-panel": "1" } });
        this.bots = r.ok ? await r.json() : null;
        // Aviso solo cuando un bot pasa a error (no repite mientras siga en error).
        this.seen ??= new Set();
        for (const b of this.bots ?? []) {
          if (b.state !== "error") { this.seen.delete(b.id); continue; }
          if (!this.seen.has(b.id)) { this.seen.add(b.id); try { notify({ title: "Bot en error", body: String(b.id), level: "error" }); playSound("blocked"); } catch { /* sin aviso */ } }
        }
      } catch { this.bots = null; }
      cx3.notify();
    });
    tick(cx);
    cx.timer.every(60000, tick);
  }

  render() {
    const t = theme();
    const bots = this.bots;
    // Una línea de 24 px abajo; la lista se despliega sola si hay un bot en warn/error/off.
    const box = v_flex().id("panel-resumen").size_full().min_h(0).bg(t.chrome).px(16).py(0).gap(2).text_size(13.5).justify_end();
    const title = (extra, col, open) => h_flex().id("bots-linea").h(28).flex_none().items_center().gap(8).text_size(13).cursor_pointer()
      .on_click((_e, cx) => { this.manual = !this.manual; cx.notify(); })
      .child(svg("mods/mi-spaces/icons/sparkles.svg").size(15).flex_none().text_color(t.muted)).child(div().text_color(col).child(extra))
      .child(div().flex_1()).child(div().text_size(11).text_color(t.dim).child(open ? "▾" : "▸"));
    if (!bots) return box.child(title("panel apagado", t.dim));
    const n = (s) => bots.filter((b) => b.state === s).length;
    const err = n("error"), warn = n("warn"), off = n("off"), ok = bots.length - err - warn - off;
    const open = err + warn + off > 0 || this.manual;
    box.child(title(`${ok} ok${warn ? ` · ${warn} aviso` : ""}${err ? ` · ${err} error` : ""}${off ? ` · ${off} off` : ""}`, err ? t.blocked : warn ? t.working : "#2dffa0", open));
    if (!open) return box;
    const list = v_flex().id("bots-resumen").flex_none().max_h(260).overflow_y_scrollbar().gap(1);
    for (const b of bots) {
      const col = b.state === "error" ? "#ff5577" : b.state === "warn" ? "#ffb02e" : b.state === "off" ? "#c4ccff" : t.foreground;
      const next = b.next && b.next !== "n/a" ? hhmm(b.next) : "—";
      const op = this.open === b.id;
      list.child(h_flex().id(`rb-${b.id}`).h(26).flex_none().gap(6).items_center().cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); this.open = op ? null : b.id; cx.notify(); })
        .child(pacman(b.state, 14, b.id))
        .child(div().flex_1().min_w(0).truncate().text_color(col).child(b.name))
        .child(div().flex_none().text_size(13.5).text_color(t.muted).child(next))
        .child(div().id(`inf-${b.id}`).flex_none().px(4).text_color("#ffb02e").cursor_pointer().on_click((_e, cx) => { cx.stop_propagation(); informe(b.id); }).child("↗"))
        .child(div().flex_none().text_size(9).text_color(t.dim).child(op ? "▾" : "▸")));
      if (op) {
        const info = v_flex().id(`ri-${b.id}`).flex_none().pl(14).pb(4).gap(1).text_size(13.5);
        info.child(div().text_color(t.muted).child(`${b.timer ?? ""}${b.active ? ` · ${b.active}` : ""} · próx ${next}`));
        info.child(div().text_color(b.state === "error" ? t.blocked : t.foreground).max_h(66).overflow_hidden().child(`${b.at ?? ""} ${b.line ?? ""}`.trim() || "(sin log)"));
        if (b.msg) info.child(div().text_color(t.dim).max_h(44).overflow_hidden().child(b.msg));
        list.child(info);
      }
    }
    box.child(list);
    return box;
  }
}
