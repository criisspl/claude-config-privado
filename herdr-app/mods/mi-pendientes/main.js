// Pendientes (Jira, PRs y tapeos) del panel personal (~/projects/panel, http://127.0.0.1:4777).
// Pulsar un ticket de Jira abre sus transiciones; elegir una pide confirmación y hace POST /api/jira/KEY/transition.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, checking, shared, run, props } from "herdr";

const BASE = "http://127.0.0.1:4777";
const URL_DATA = `${BASE}/api/data`;
const URL_TAPEOS = `${BASE}/api/tapeos`;
const REFRESH_MS = 120000; // /api/data tarda (Jira + GitHub): sondeo suave

export default class MiPendientes extends View {
  init(_props, cx) {
    this.compact = Boolean(props()?.compact);
    if (this.compact) {
      // Modo compacto (barra del sidebar): sin fetch propio, lee shared("panel.data") que llena mi-spaces.
      this.open = true;
      this.last = 0;
      cx.timer.every(5000, (cx) => cx.notify());
      return;
    }
    this.state = { status: "loading", data: null, at: null };
    this.tapeos = null;
    this.busy = false;
    this.sel = null; // { key, status: "loading"|"ok"|"err"|"sending"|"done", list, pick, msg }
    if (checking()) return;
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(URL_DATA);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.state = { status: "ok", data: await r.json(), at: new Date() };
        try {
          const rt = await fetch(URL_TAPEOS);
          const d = rt.ok ? await rt.json() : null;
          if (Array.isArray(d)) this.tapeos = d;
        } catch (_e2) { /* tapeos opcional: conserva el último */ }
      } catch (_e) {
        this.state = { status: "off", data: this.state.data, at: this.state.at };
      }
      this.busy = false;
      cx.notify();
    });
  }

  select(key, cx) {
    if (this.sel?.key === key) { this.sel = null; cx.notify(); return; }
    const sel = { key, status: "loading", list: [], pick: null, msg: "" };
    this.sel = sel;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(`${BASE}/api/jira/${key}/transitions`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        sel.list = await r.json();
        sel.status = "ok";
      } catch (e) { sel.status = "err"; sel.msg = String(e?.message ?? e); }
      cx.notify();
    });
  }

  send(cx) {
    const sel = this.sel;
    if (!sel?.pick || sel.status === "sending") return;
    const pick = sel.pick;
    sel.status = "sending";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(`${BASE}/api/jira/${sel.key}/transition`, {
          method: "POST",
          headers: { "x-panel": "1", "content-type": "application/json" },
          body: JSON.stringify({ id: pick.id }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        sel.status = "done"; sel.msg = `${sel.key} → ${pick.name}`;
        sel.pick = null;
        this.refresh(cx);
      } catch (e) { sel.status = "err"; sel.msg = String(e?.message ?? e); sel.pick = null; }
      cx.notify();
    });
  }

  renderCompact(cx) {
    const t = theme();
    const box = v_flex().id("pend-compact").size_full().min_h(0).bg(t.chrome).px(16).text_size(13.5);
    let items = [];
    try {
      const d = shared("panel.data");
      if (d) {
        items = (d.prs ?? []).map((p) => { const ch = p.reviewDecision === "CHANGES_REQUESTED"; return { id: `p-${p.repo}-${p.number}`, tag: ch ? "cambios" : "abierta", text: `#${p.number} ${p.title}`, url: p.url, color: ch ? "#ffb02e" : "#d9a6ff", icon: ch ? "message-square" : "git-pull-request" }; });
      }
    } catch { items = []; }
    const shown = Math.min(items.length, 8);
    const want = this.open && items.length ? 26 + shown * 26 + 4 : 26;
    if (want !== this.last) { this.last = want; run("layout.resize", { id: "pendientes", px: want }); }
    const count = (tag) => items.filter((i) => i.tag === tag).length;
    box.child(h_flex().id("pend-head").h(26).flex_none().gap(8).items_center().cursor_pointer()
      .on_click((_e, c) => { this.open = !this.open; c.notify(); })
      .child(svg("mods/mi-spaces/icons/ticket.svg").size(15).flex_none().text_color(t.muted))
      .child(div().flex_1().truncate().text_size(11).text_color(t.dim).child(items.length ? `${count("abierta") + count("cambios")} abiertas · ${count("cambios")} ${count("cambios") === 1 ? "cambio" : "cambios"}` : ""))
      .child(div().text_size(11).text_color(t.dim).child(this.open ? "▾" : "▸")));
    if (this.open && items.length) {
      const list = v_flex().id("pend-items").flex_none().gap(0);
      for (const i of items.slice(0, shown)) {
        list.child(h_flex().id(i.id).h(26).flex_none().gap(8).items_center().text_size(13).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, c) => c.open_url(i.url))
          .child(svg(`mods/mi-spaces/icons/${i.icon}.svg`).size(14).flex_none().text_color(i.color))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(i.text)));
      }
      box.child(list);
    }
    return box;
  }

  render(_props, cx) {
    if (this.compact) return this.renderCompact(cx);
    const t = theme();
    const { status, data, at } = this.state;
    const head = h_flex().h(32).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Pendientes"))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(
        status === "off" ? (at ? `panel apagado · último ${hhmm(at)}` : "panel apagado")
          : status === "loading" ? "cargando…" : hhmm(at)));
    const body = v_flex().id("pend-list").flex_1().min_h(0).overflow_y_scrollbar();
    if (!data) {
      body.child(div().p(12).text_size(12).text_color(t.dim).child(status === "off" ? "Panel no disponible en 127.0.0.1:4777" : "Cargando pendientes…"));
    } else {
      body.child(section("Jira", data.jira?.length ?? 0, t));
      for (const i of data.jira ?? []) {
        body.child(row(`j-${i.key}`, i.key, i.title, i.status + (i.blockPr ? " · bloqueado" : ""), i.url, t, false, () => this.select(i.key, cx)));
        if (this.sel?.key === i.key) body.child(this.panel(this.sel, i.url, t, cx));
      }
      body.child(section("PRs abiertas", data.prs?.length ?? 0, t));
      for (const p of data.prs ?? []) {
        const n = p.open?.length ?? 0;
        body.child(row(`p-${p.repo}-${p.number}`, `#${p.number}`, p.title, `${p.repo.split("/")[1]}${p.draft ? " · draft" : ""}${n ? ` · ${n} sin resolver` : ""}`, p.url, t, n > 0));
      }
    }
    if (data && this.tapeos) {
      body.child(section("Mis tapeos", this.tapeos.length, t));
      for (const i of this.tapeos) {
        body.child(row(`t-${i.key}`, i.key, i.title, [i.status, i.priority, i.area].filter(Boolean).join(" · "), i.url, t));
      }
    }
    return v_flex().size_full().bg(t.surface).text_color(t.foreground).text_size(12).child(head).child(body);
  }
}

MiPendientes.prototype.panel = function (sel, url, t, cx) {
  const btn = (id, label, color, fn) => div().id(id).flex_none().px(8).h(22).rounded(5).bg(color + "26").text_color(color)
    .flex().items_center().cursor_pointer().hover((s) => s.bg(color + "40")).on_click((_e, c) => fn(c)).child(label);
  const box = v_flex().flex_none().px(12).py(6).gap(6).bg(t.raised).border_b(1).border_color(t.border);
  const msg = (text, color) => div().text_size(11).text_color(color).child(text);
  if (sel.status === "loading") return box.child(msg("Cargando transiciones…", t.dim));
  if (sel.status === "sending") return box.child(msg(`Enviando ${sel.key}…`, t.dim));
  if (sel.status === "done") return box.child(msg(`Hecho: ${sel.msg}`, t.done));
  if (sel.status === "err") return box.child(msg(`Error: ${sel.msg}`, t.blocked))
    .child(h_flex().gap(6).child(btn(`x-retry`, "Reintentar", t.accent, (c) => { this.sel = null; this.select(sel.key, c); })));
  if (sel.pick) {
    return box.child(msg(`¿Mover ${sel.key} a "${sel.pick.name}"?`, t.foreground))
      .child(h_flex().gap(6)
        .child(btn("x-ok", "Confirmar", t.accent, (c) => this.send(c)))
        .child(btn("x-no", "Cancelar", t.dim, (c) => { sel.pick = null; c.notify(); })));
  }
  const bar = h_flex().gap(6).flex_wrap();
  for (const tr of sel.list) bar.child(btn(`tr-${tr.id}`, tr.name, t.accent, (c) => { sel.pick = tr; c.notify(); }));
  if (!sel.list.length) bar.child(msg("Sin transiciones disponibles", t.dim));
  bar.child(btn("x-open", "Abrir en Jira", t.dim, (c) => c.open_url(url)));
  return box.child(msg("Cambiar estado a…", t.dim)).child(bar);
};

const hhmm = (d) => d.toTimeString().slice(0, 5);

const section = (title, n, t) => h_flex().h(26).flex_none().px(12).gap(8).items_center().bg(t.raised)
  .child(div().flex_1().text_color(t.muted).child(title)).child(div().text_color(t.muted).child(String(n)));

const row = (id, key, title, sub, url, t, warn = false, onPick = null) => v_flex().id(id).flex_none().px(12).py(5).gap(1)
  .border_b(1).border_color(t.border).cursor_pointer().hover((s) => s.bg(t.hover))
  .on_click((_e, cx) => (onPick ? onPick() : cx.open_url(url)))
  .child(h_flex().gap(8).child(div().flex_none().font_semibold().text_color(t.accent).child(key)).child(div().flex_1().min_w(0).truncate().child(title)))
  .child(div().truncate().text_size(11).text_color(warn ? t.blocked : t.dim).child(sub));
