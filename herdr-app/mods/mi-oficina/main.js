// Oficina comecocos: un rectángulo azul por proyecto (space) con una sesión de Claude activa.
// Dentro: la sesión (comecocos) y los agentes que lanzó (fantasmas). Crece y encoge solo.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, agents, terminals, panes, run, exec } from "herdr";

const D = "mods/mi-oficina/";
const MAZE = "#2121de";
const GHOSTS = ["PO", "UX", "Senior", "QA", "TechLead"]; // sprites de reserva, por orden
const AGENTS = { mecanico: "PO", buscador: "UX", implementador: "Senior", "revisor-pr": "QA", planificador: "TechLead" }; // agente -> sprite
const ghostOf = (k, i) => AGENTS[Object.keys(AGENTS).find(n => (k.title || "").toLowerCase().includes(n))] || GHOSTS[i % GHOSTS.length];
const S = 34; // tamaño sprite
const CELL = 84; // ancho de celda
const TITLE = "#8c9bff"; // azul claro legible sobre negro

const live = (s) => s === "working" || s === "blocked";
const sprite = (name, working, st) => {
  const box = div().relative().w(S).h(S).flex_none();
  const layer = (n) => image(`${D}${name}-${n}.svg`).absolute().top(0).left(0).w(S).h(S);
  return box.child(layer(working ? "a" : "idle"))
    .child(layer(working ? "b" : "blink").loop("opacity", working
      ? { from: 0, to: 1, period: 450, easing: "linear" }
      : { from: 0, to: 1, period: 2600, easing: "ease-in" }));
};
const pac = (working) => {
  const box = div().relative().w(S).h(S).flex_none();
  const layer = (n) => image(`${D}PM-${n}.svg`).absolute().top(0).left(0).w(S).h(S);
  return box.child(layer("a")).child(layer("b").loop("opacity", working
    ? { from: 0, to: 1, period: 450, easing: "linear" } : { from: 0, to: 0, period: 1000 }));
};
const badge = (st) => {
  if (st === "blocked") return image(`${D}alert.svg`).absolute().left(S - 6).top(-6).w(8).h(S).loop("opacity", { from: 0.4, to: 1, period: 600 });
  if (st === "done") return image(`${D}check.svg`).absolute().left(S - 10).top(-2).w(24).h(14);
  return null;
};

export default class MiOficina extends View {
  heights = new Map();
  last = 0;
  empty = false;
  subs = new Map(); // terminal -> tipos de subagente activos (los escribe el hook oficina-subagent.sh)

  init(_props, cx) {
    const poll = async (cx) => {
      const r = await exec("sh", ["-c", 'find "$HOME/.local/state/oficina" -type f -mmin -30 -exec grep -H . {} + 2>/dev/null']);
      const m = new Map();
      for (const l of (r.stdout || "").split("\n")) {
        const x = /oficina\/([^/]+)\/[^:]+:(.+)$/.exec(l);
        if (x) m.set(x[1], [...(m.get(x[1]) ?? []), x[2]]);
      }
      if (JSON.stringify([...m]) !== JSON.stringify([...this.subs])) { this.subs = m; cx.notify(); }
    };
    poll(cx);
    cx.timer.every(2000, poll);
  }

  // Ajusta el alto de su pane al contenido (rectángulos + huecos), con tope y sin oscilar.
  fit() {
    const pane = panes().find((p) => p.mod === "mi-oficina")?.pane;
    if (!pane) return;
    const sum = [...this.heights.values()].reduce((a, b) => a + b, 0);
    const want = this.empty ? 70 : Math.min(640, Math.max(90, Math.round(sum + this.heights.size * 6 + 12 + 30)));
    if (Math.abs(want - this.last) < 8) return;
    this.last = want;
    run("layout.resize", { id: pane, px: want });
  }

  render() {
    const t = theme();
    const all = terminals();
    const ags = agents().filter((a) => a.app === "claude-code");
    const branch = new Map(panes().filter((p) => p.terminal && p.branch).map((p) => [p.terminal, p.branch]));
    const groups = new Map();
    for (const a of ags) {
      const kids = all.filter((k) => k.parent === a.address && k.state === "live");
      const g = groups.get(a.space) ?? { name: a.space_name, items: [] };
      g.items.push({ a, kids });
      groups.set(a.space, g);
    }
    for (const k of [...this.heights.keys()]) if (!groups.has(k)) this.heights.delete(k);
    this.empty = !groups.size;
    if (this.empty) this.fit();
    const root = v_flex().id("of-root").size_full().bg("#000000").text_color(t.foreground).text_size(10)
      .overflow_y_scrollbar().p(6).gap(6);
    if (!groups.size) return root.child(div().p(8).text_color(t.dim).child("Sin sesiones de Claude activas"));
    for (const [id, g] of groups) {
      const row = h_flex().flex_wrap().gap(10).items_start();
      for (const { a, kids } of g.items) {
        row.child(this.cell(a.title || "claude", pac(a.status === "working"), a.status, t, `s-${a.address}`, branch.get(a.address)));
        kids.forEach((k, i) => {
          const st = k.status === "error" ? "blocked" : k.status;
          row.child(this.cell(k.title || k.address, sprite(ghostOf(k, i), st === "working", st), st, t, `k-${k.address}`));
        });
        (this.subs.get(a.address) ?? []).forEach((n, i) =>
          row.child(this.cell(ghostOf({ title: n }, kids.length + i), sprite(ghostOf({ title: n }, kids.length + i), true, "working"), "working", t, `h-${a.address}-${i}`, n)));
      }
      root.child(v_flex().id(`g-${id}`).flex_none().p(6).gap(4).rounded(8).border_2().border_color(MAZE)
        .on_size_change((size, cx) => { this.heights.set(id, size.height ?? size.h ?? 0); this.fit(); })
        .child(div().text_color(TITLE).font_semibold().child(g.name))
        .child(row));
    }
    return root;
  }

  cell(label, spr, st, t, id, sub) {
    const col = st === "working" ? t.working : st === "blocked" ? t.blocked : st === "done" ? t.done : t.idle;
    const b = badge(st);
    const box = div().id(id).w(CELL).flex_none().flex().flex_col().items_center().gap(2)
      .child(div().relative().w(S).h(S).flex_none().child(spr).children(b ? [b] : []))
      .child(div().w(CELL).truncate().text_size(9).text_center().text_color(col).child(label))
      .children(sub ? [div().w(CELL).truncate().text_size(8).text_center().text_color(t.dim).child(sub)] : []);
    return box;
  }
}
