// Barra inferior: sesión 5 h, semana 7 d y tope de hoy, super resumido. Datos: ../mi-uso-claude/usage.py
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, exec, appHome, checking, panes } from "herdr";

const REFRESH_MS = 30000;

export default class MiUsoBarra extends View {
  init(_props, cx) {
    this.data = null;
    this.busy = false;
    this.ses = null;
    this.cwd = null;
    if (checking()) return;
    this.cx = cx;
    cx.timer.every(REFRESH_MS, (cx) => { this.refresh(cx); if (this.cwd) this.refreshSes(cx); });
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/mi-uso-claude/usage.py`], { timeout: 25000 });
        this.data = JSON.parse(r.stdout);
      } catch (_e) {
        this.data = null;
      }
      this.busy = false;
      cx.notify();
    });
  }

  refreshSes(cx) {
    const cwd = this.cwd;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/mi-uso-barra/sesion.py`, cwd], { timeout: 15000 });
        if (cwd === this.cwd) this.ses = JSON.parse(r.stdout);
      } catch (_e) {
        if (cwd === this.cwd) this.ses = null;
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const d = this.data;
    const fp = panes().find((p) => p.focused && p.terminal);
    if (fp?.cwd && fp.cwd !== this.cwd) {
      this.cwd = fp.cwd;
      this.ses = null;
      if (this.cx) this.refreshSes(this.cx);
    }
    const N = 30; // segmentos de la barra
    const seg = (i) => (i < N * 0.6 ? "#3ddc84" : i < N * 0.85 ? "#e5c23a" : "#ef5350");
    const line = (label, pct, tail) => {
      const known = pct !== null && pct !== undefined && !Number.isNaN(Number(pct));
      const p = known ? Math.max(0, Math.min(100, Number(pct))) : 0;
      const on = Math.round((p / 100) * N);
      const color = p >= 90 ? "#ef5350" : p >= 70 ? "#e5c23a" : "#3ddc84";
      const bar = h_flex().gap(1).w(N * 9);
      for (let i = 0; i < N; i++) bar.child(div().h(9).w(8).bg(i < on ? seg(i) : t.raised));
      return h_flex().gap(10).items_center()
        .child(div().w(42).text_color(t.muted).child(label))
        .child(bar)
        .child(div().w(44).font_semibold().text_color(known ? color : t.dim).child(known ? `${Math.round(p)}%` : "–"))
        .child(div().text_color(t.dim).child(tail ?? ""));
    };
    const col = v_flex().size_full().px(14).py(6).justify_center().gap(2).bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8);
    if (!d) return col.child(div().text_color(t.dim).child("Claude: sin datos"));
    return col
      .child(line("sess:", d.five_hour?.pct, reset(d.five_hour?.resets_at)))
      .child(line("week:", d.seven_day?.pct, reset(d.seven_day?.resets_at)))
      .child(line("hoy:", d.day ? (d.day.used / d.day.cap) * 100 : null, d.day ? `${M(d.day.used)} / ${M(d.day.cap)}` : ""))
      .child(h_flex().gap(14).text_color(t.muted)
        .child(div().child(`cache ${this.ses?.cache ?? "–"}${this.ses?.cache != null ? "%" : ""}`))
        .child(div().child(`${this.ses?.turn != null ? `+${this.ses.turn}` : "–"}/turno`))
        .child(div().text_color(t.dim).child(this.ses?.session ? `sesión ${this.ses.session}` : "sin sesión Claude en esta pestaña")));
  }
}

const M = (n) => `${(n / 1e6).toFixed(1)}M`;
const reset = (ts) => {
  if (!ts) return "";
  const s = Math.max(0, ts - Date.now() / 1000);
  const h = Math.floor(s / 3600);
  return `⏳ ${h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`}`;
};
