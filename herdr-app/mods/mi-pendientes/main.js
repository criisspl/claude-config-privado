// Pendientes estilo GitHub Issues + paleta de comandos.
//  - Con props { barra: true } (bloque «pendientes» del layout) es el motor y el contador: cada ~60 s mira
//    git y gh de los spaces abiertos sin bloquear la UI, deduce las etiquetas automáticas y las guarda.
//  - Sin props (tecla ctrl-shift-j o clic en el contador) es la paleta: pestañas Abiertos/Cerrados, filtros
//    escritos («is:open repo:web label:ci-rojo -label:manual sort:oldest»), saltar a space/agente/rama,
//    abrir PR, «Nuevo pendiente» y «Cerrar pendiente». Solo teclado: flechas, Tab, Enter, Esc.
// Los pendientes se guardan en ~/.config/herdr-app/pendientes.json (no en localStorage).
// Lo compartido con otros mods va por shared(): "pendientes.items" y "pendientes.ramas".

import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, run, exec, theme, shared, setShared, openOverlay, closeOverlay, props, checking } from "herdr";
import {
  esPersonal, ticketDe, nombreRepo, antiguedad, puntuar, parseFiltro, tieneFiltros, aplicarFiltro,
  etiquetasGit, evaluarPrs, vulnerabilidadesGraves, tituloVulnerabilidades, reconciliar, nuevoManual, cerrar, leerAlmacen, serializar, RAMAS_BASE,
} from "./logica.js";

const ARCHIVO = "$HOME/.config/herdr-app/pendientes.json";
const REFRESCO = 60000;
const A_LA_VEZ = 3;
const PERSONAL = "#f0a0c8"; // acento de la cuenta personal (el mismo en mi-tabs y mi-agents)
const COLOR = { "agente-esperando": "#e5c23a", "ci-rojo": "#ef5350", "pr-comentarios": "#e08a4f", "sin-commit": "#5b8def", "sin-push": "#8b7cf6", olvidado: "#8a8fa3", vulnerabilidad: "#ef5350", manual: "#3fae6a" };
const GH = "gh pr list --author @me --limit 30 --json number,title,headRefName,reviewDecision,statusCheckRollup,comments,author,createdAt,url";

const sinMe = (n) => (n ?? "").replace(/^me\s*·\s*/i, "");
const lugar = (s, ps) => {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
};
const ghEnv = (personal) => (personal ? 'GH_CONFIG_DIR="$HOME/.config/gh-personal" ' : "");

async function leer() {
  const r = await exec("sh", ["-c", `cat "${ARCHIVO}" 2>/dev/null`]);
  return leerAlmacen(r.stdout);
}
async function guardar(items) {
  // El contenido va como argumento ($1): no hace falta stdin.
  await exec("sh", ["-c", `f="${ARCHIVO}"; mkdir -p "$(dirname "$f")" && printf %s "$1" > "$f.tmp" && mv "$f.tmp" "$f"`, "sh", serializar(items)]);
}
const publicar = (items) => setShared("pendientes.items", items);
const abiertos = () => (shared("pendientes.items") ?? []).filter((i) => !i.cerrado);

// Salta al space (y a su agente, si lo hay) de un pendiente o de un space.
function saltar({ spaceId, dir, repo }) {
  const ps = panes();
  const sp = spaces().find((s) => s.id === spaceId) ?? spaces().find((s) => dir && lugar(s, ps) === dir) ?? (repo ? spaces().find((s) => (shared("pendientes.ramas") ?? {})[lugar(s, ps)]?.repo === repo) : null);
  if (!sp) return false;
  const ag = agents().find((a) => a.space === sp.id && a.status === "blocked") ?? agents().find((a) => a.space === sp.id);
  if (ag) run("pane.focus", { pane: ag.pane });
  else run("space.select", { id: sp.id });
  return true;
}

export default class Pendientes extends View {
  init(_props, cx) {
    this.gitInfo = new Map();
    this.prs = [];
    this.busy = false;
    this.scroll = ScrollHandle.new();
    this.q = "";
    this.tab = "open";
    this.at = 0;
    this.modo = "buscar"; // buscar | cerrar | nuevo
    this.paso = 0;
    this.form = {};
    this.handle = cx.focus_handle();
    if (!props()?.barra) {
      this.handle.focus();
      return;
    }
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { publicar(await leer()); } catch { publicar([]); }
      this.refrescar(cx);
      cx.notify();
    });
    cx.timer.every(REFRESCO, (cx) => this.refrescar(cx));
    // El estado de los agentes cambia a menudo: solo se recalcula, sin lanzar nada.
    cx.timer.every(5000, (cx) => { this.combinar().then(() => cx.notify()).catch(() => {}); });
  }

  // ---------- motor ----------
  refrescar(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try { await this.ciclo(); } catch { /* sin datos esta vez: se conserva lo anterior */ }
      this.busy = false;
      cx.notify();
    });
  }

  async ciclo() {
    const ps = panes();
    const lugares = new Map();
    for (const s of spaces()) {
      if (s.machine) continue; // solo máquina local
      const dir = lugar(s, ps);
      if (dir && !lugares.has(dir)) lugares.set(dir, { dir, personal: esPersonal(s.name), nombre: s.name, spaceId: s.id });
    }
    const dirs = [...lugares.values()];
    const nuevos = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, dirs.length) }, async () => {
      while (next < dirs.length) {
        const l = dirs[next++];
        try {
          const info = await this.mirarGit(l);
          if (info) nuevos.set(l.dir, info);
        } catch {
          const antes = this.gitInfo.get(l.dir);
          if (antes) nuevos.set(l.dir, antes); // no se pudo preguntar: se conserva
        }
      }
    }));
    this.gitInfo = nuevos;
    // Una vez por repo: sus PR propias.
    const repos = new Map();
    for (const i of nuevos.values()) if (!repos.has(i.common)) repos.set(i.common, i);
    const lista = [...repos.values()];
    const prs = [];
    next = 0;
    await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lista.length) }, async () => {
      while (next < lista.length) {
        const i = lista[next++];
        try {
          const r = await exec("sh", ["-c", `${ghEnv(i.personal)}${GH}`], { cwd: i.dir, timeout: 30000 });
          if (r.code !== 0) throw new Error("gh");
          for (const pr of evaluarPrs(r.stdout)) {
            const mismo = [...nuevos.values()].find((g) => g.common === i.common && g.rama === pr.rama) ?? i;
            prs.push({ id: `pr:${i.repo}#${pr.numero}`, titulo: `#${pr.numero} ${pr.titulo}`, repo: i.repo, rama: pr.rama, ticket: ticketDe(pr.rama), etiquetas: pr.etiquetas, creado: pr.creado, dir: mismo.dir, spaceId: mismo.spaceId, personal: i.personal, pr: pr.numero });
          }
        } catch {
          // gh sin red o sin sesión: las PR abiertas de ese repo se quedan como estaban
          for (const p of abiertos()) if (p.id.startsWith(`pr:${i.repo}#`)) prs.push(p);
        }
      }
    }));
    this.prs = prs;
    const ramas = Object.fromEntries([...nuevos.values()].map((i) => [i.dir, { rama: i.rama, ticket: i.ticket, repo: i.repo, personal: i.personal }]));
    if (JSON.stringify(ramas) !== JSON.stringify(shared("pendientes.ramas"))) setShared("pendientes.ramas", ramas);
    await this.combinar();
  }

  async mirarGit(l) {
    const g = (args) => exec("git", args, { cwd: l.dir, timeout: 20000 });
    const [top, st, br, ct, raiz] = await Promise.all([
      g(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      g(["--no-optional-locks", "status", "--porcelain"]),
      g(["symbolic-ref", "-q", "--short", "HEAD"]),
      g(["log", "-1", "--format=%ct"]),
      g(["rev-parse", "--show-toplevel"]),
    ]);
    if (top.code !== 0) return null; // no es un repo
    const rama = br.code === 0 ? br.stdout.trim() : "(detached)";
    let push = await g(["log", "--oneline", "@{u}.."]);
    // Sin upstream: lo que ningún remoto tiene (salvo en la rama principal)
    if (push.code !== 0) push = RAMAS_BASE.includes(rama) ? { stdout: "" } : await g(["log", "--oneline", "-20", "HEAD", "--not", "--remotes"]);
    const etiquetas = etiquetasGit({ porcelain: st.stdout, sinPush: push.stdout, ultimoCommit: (parseInt(ct.stdout, 10) || 0) * 1000, rama });
    const common = top.stdout.trim();
    // Auditoría de /auditar: críticas + altas de <raíz>/.claude/auditoria/ultima.json (0 si no hay)
    let vulns = 0;
    if (raiz.code === 0 && raiz.stdout.trim()) {
      const u = await exec("sh", ["-c", 'cat "$1/.claude/auditoria/ultima.json" 2>/dev/null', "sh", raiz.stdout.trim()]);
      vulns = vulnerabilidadesGraves(u.stdout);
    }
    return { vulns, dir: l.dir, spaceId: l.spaceId, nombre: l.nombre, personal: l.personal, common, repo: nombreRepo(common), rama, ticket: ticketDe(rama), etiquetas };
  }

  async combinar() {
    const base = shared("pendientes.items");
    if (!base) return; // aún sin cargar el archivo
    const vivos = agents();
    const det = [];
    for (const i of this.gitInfo.values()) {
      const et = [...i.etiquetas];
      if (vivos.some((a) => a.space === i.spaceId && a.status === "blocked")) et.unshift("agente-esperando");
      if (et.length) det.push({ id: `git:${i.dir}`, titulo: sinMe(i.nombre), repo: i.repo, rama: i.rama, ticket: i.ticket, etiquetas: et, dir: i.dir, spaceId: i.spaceId, personal: i.personal });
      if (i.vulns > 0) det.push({ id: `vuln:${i.dir}`, titulo: tituloVulnerabilidades(i.vulns), repo: i.repo, rama: i.rama, ticket: i.ticket, etiquetas: ["vulnerabilidad"], dir: i.dir, spaceId: i.spaceId, personal: i.personal });
    }
    det.push(...this.prs);
    const nuevo = reconciliar(base, det, Date.now());
    if (JSON.stringify(nuevo) === JSON.stringify(base)) return;
    publicar(nuevo);
    await guardar(nuevo);
  }

  // ---------- paleta ----------
  filas() {
    const items = shared("pendientes.items") ?? [];
    if (this.modo === "cerrar") {
      const f = parseFiltro(this.q);
      return aplicarFiltro(items.filter((i) => i.tipo === "manual"), f, "open").map((it) => ({ tipo: "pend", it, cierra: true }));
    }
    const f = parseFiltro(this.q);
    const filas = aplicarFiltro(items, f, this.tab).map((it) => ({ tipo: "pend", it }));
    const texto = f.texto;
    const ramas = shared("pendientes.ramas") ?? {};
    const ps = panes();
    if (texto) {
      const saltos = spaces().map((s) => {
        const r = ramas[lugar(s, ps)] ?? {};
        const ags = agents().filter((a) => a.space === s.id);
        const estado = ags.some((a) => a.status === "blocked") ? "esperando" : ags.some((a) => a.status === "working") ? "trabajando" : ags.length ? "listo" : "";
        const hay = [s.name, r.repo, r.rama, r.ticket, estado].filter(Boolean).join(" ");
        return { tipo: "salto", s, r, estado, puntos: puntuar(texto, hay), dir: lugar(s, ps) };
      }).filter((x) => x.puntos >= 0).sort((a, b) => b.puntos - a.puntos);
      filas.push(...saltos);
    }
    const acciones = [
      { id: "nuevo", etiqueta: "Nuevo pendiente" },
      { id: "cerrar", etiqueta: "Cerrar pendiente" },
      { id: "pr", etiqueta: "Abrir PR del space actual" },
      { id: "auditoria", etiqueta: "Auditoría de seguridad" },
    ].filter((a) => !texto || puntuar(texto, a.etiqueta) >= 0);
    filas.push(...acciones.map((a) => ({ tipo: "accion", a })));
    return filas;
  }

  elegir(fila, cx) {
    if (!fila) return;
    if (fila.tipo === "accion") {
      if (fila.a.id === "nuevo") {
        const act = spaces().find((s) => s.active);
        const r = act ? (shared("pendientes.ramas") ?? {})[lugar(act, panes())] : null;
        Object.assign(this, { modo: "nuevo", paso: 0, form: { repoPorDefecto: r?.repo ?? "" }, q: "", at: 0 });
      } else if (fila.a.id === "cerrar") Object.assign(this, { modo: "cerrar", q: "", at: 0 });
      else if (fila.a.id === "auditoria") {
        openOverlay({ mod: "mi-auditoria", kind: "dialog", width: 820, height: 600 });
        closeOverlay(props()?.overlay);
      } else {
        const act = spaces().find((s) => s.active);
        const dir = act && lugar(act, panes());
        if (dir) exec("sh", ["-c", `${ghEnv(esPersonal(act.name))}gh pr view --web`], { cwd: dir }).catch(() => {});
        closeOverlay(props()?.overlay);
      }
      cx.notify();
      return;
    }
    if (fila.tipo === "salto") {
      saltar({ spaceId: fila.s.id });
      closeOverlay(props()?.overlay);
      return;
    }
    const it = fila.it;
    if (fila.cierra) {
      const nuevo = cerrar(shared("pendientes.items") ?? [], it.id);
      publicar(nuevo);
      guardar(nuevo).catch(() => {});
      this.at = 0;
      cx.notify();
      return;
    }
    if (it.cerrado) return;
    if ((it.etiquetas ?? []).includes("vulnerabilidad")) {
      openOverlay({ mod: "mi-auditoria", kind: "dialog", width: 820, height: 600, props: { spaceId: it.spaceId } });
      closeOverlay(props()?.overlay);
      return;
    }
    if (it.pr) exec("sh", ["-c", `${ghEnv(it.personal)}gh pr view ${Number(it.pr)} --web`], { cwd: it.dir }).catch(() => {});
    else if (!saltar(it)) return;
    closeOverlay(props()?.overlay);
  }

  formulario(cx) {
    const v = this.q.trim();
    if (this.paso === 0) {
      if (!v) return;
      this.form.titulo = v;
      this.q = this.form.repoPorDefecto;
    } else if (this.paso === 1) {
      this.form.repo = v;
      this.q = "";
    } else {
      const it = nuevoManual({ titulo: this.form.titulo, repo: this.form.repo, etiquetas: v.split(",") }, Date.now());
      const nuevo = [it, ...(shared("pendientes.items") ?? [])];
      publicar(nuevo);
      guardar(nuevo).catch(() => {});
      Object.assign(this, { modo: "buscar", tab: "open", q: "", at: 0, paso: 0 });
      cx.notify();
      return;
    }
    this.paso++;
    cx.notify();
  }

  tecla(e, cx) {
    const k = e.key;
    const filas = this.modo === "nuevo" ? [] : this.filas();
    const n = filas.length;
    if (k === "escape") {
      if (this.modo !== "buscar") Object.assign(this, { modo: "buscar", q: "", at: 0, paso: 0 });
      else return closeOverlay(props()?.overlay);
    } else if (k === "down" && n) this.at = (this.at + 1) % n;
    else if (k === "up" && n) this.at = (this.at + n - 1) % n;
    else if ((k === "tab" || k === "left" || k === "right") && this.modo === "buscar") Object.assign(this, { tab: this.tab === "open" ? "closed" : "open", at: 0 });
    else if (k === "enter") {
      if (this.modo === "nuevo") return this.formulario(cx);
      return this.elegir(filas[Math.min(this.at, n - 1)], cx);
    } else if (k === "backspace") { this.q = this.q.slice(0, -1); this.at = 0; }
    else if (k === "space") { this.q += " "; this.at = 0; }
    else {
      const ch = e.key_char ?? (k.length === 1 ? k : null);
      if (!ch) return;
      this.q += ch;
      this.at = 0;
    }
    if (this.modo !== "nuevo" && n) this.scroll.scroll_to_item(Math.min(this.at, n - 1));
    cx.notify();
  }

  pildora(t, texto, color) {
    return div().flex_none().px(6).h(16).rounded(5).bg(color + "26").text_size(10.5).text_color(color).flex().items_center().child(texto);
  }

  fila(t, f, i, ahora) {
    const sel = i === this.at;
    const base = h_flex().id(`pf-${i}`).h(44).px(10).gap(9).rounded(7).flex_none().items_center()
      .when(sel, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.elegir(f, cx));
    if (f.tipo === "accion") return base.h(32).child(div().text_color(t.accent).child("›")).child(div().flex_1().text_color(t.foreground).child(f.a.etiqueta));
    if (f.tipo === "salto") {
      const per = esPersonal(f.s.name);
      return base
        .child(div().text_color(t.dim).child("→"))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_color(per ? PERSONAL : t.foreground).child(sinMe(f.s.name)))
          .child(div().truncate().text_size(11).text_color(t.dim).child([f.r.repo, f.r.rama, f.estado].filter(Boolean).join(" · "))));
    }
    const it = f.it;
    const cuando = it.cerrado ? `cerrado hace ${antiguedad(it.cerrado, ahora)}` : `hace ${antiguedad(it.creado, ahora)}`;
    return base
      .child(div().size(8).flex_none().rounded(4).bg(it.cerrado ? t.dim : (it.personal ? PERSONAL : t.done)))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(6).items_center()
          .child(div().min_w(0).truncate().text_color(it.cerrado ? t.muted : t.foreground).child(it.titulo))
          .children((it.etiquetas ?? []).map((e) => this.pildora(t, e, COLOR[e] ?? t.dim)))
          .when(Boolean(it.personal), (el) => el.child(this.pildora(t, "personal", PERSONAL))))
        .child(div().truncate().text_size(11).text_color(t.dim).child([it.repo, it.ticket && it.rama ? `${it.ticket} · ${it.rama}` : it.rama, cuando].filter(Boolean).join(" · "))));
  }

  render(cx) {
    const t = theme();
    if (props()?.barra) return this.barra(t);
    const ahora = Date.now();
    const todos = shared("pendientes.items") ?? [];
    const nAb = todos.filter((i) => !i.cerrado).length, nCe = todos.length - nAb;
    const nuevo = this.modo === "nuevo";
    const filas = nuevo ? [] : this.filas();
    const PASOS = ["Título del pendiente", "Repo (opcional, p. ej. web)", "Etiquetas separadas por comas (opcional)"];
    const tabBtn = (id, txt, n) => div().id(`tab-${id}`).px(10).h(26).rounded(6).flex().items_center().text_size(12)
      .bg(this.tab === id && this.modo === "buscar" ? t.selected : t.popover)
      .text_color(this.tab === id && this.modo === "buscar" ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.tab = id; this.modo = "buscar"; this.at = 0; cx.notify(); })
      .child(`${txt} ${n}`);
    return v_flex().id("pendientes").track_focus(this.handle).size_full().min_h(0).p(8).gap(6).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => this.tecla(e, cx))
      .child(h_flex().gap(6).items_center().px(4)
        .child(tabBtn("open", "Abiertos", nAb)).child(tabBtn("closed", "Cerrados", nCe))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(this.modo === "cerrar" ? "Enter cierra el pendiente · Esc vuelve" : nuevo ? "Enter siguiente · Esc cancela" : "Tab: Abiertos/Cerrados")))
      .child(h_flex().h(34).px(10).gap(8).items_center().rounded(7).bg(t.raised).border(1).border_color(t.border)
        .child(div().text_color(t.accent).child(nuevo ? `${this.paso + 1}/3` : "›"))
        .child(div().flex_1().truncate().text_color(this.q ? t.foreground : t.dim).child(this.q ? `${this.q}▏` : (nuevo ? PASOS[this.paso] : "is:open repo:web label:ci-rojo -label:manual sort:oldest · o busca un ticket, rama o space")))
        )
      .when(!nuevo, (el) => el.child(v_flex().id("pf-lista").flex_1().min_h(0).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        .children(filas.length ? filas.map((f, i) => this.fila(t, f, i, ahora)) : [div().px(10).py(12).text_color(t.dim).child("Nada que mostrar con ese filtro.")])));
  }

  barra(t) {
    const todos = shared("pendientes.items");
    const n = (todos ?? []).filter((i) => !i.cerrado).length;
    const urgentes = (todos ?? []).filter((i) => !i.cerrado && (i.etiquetas ?? []).some((e) => e === "agente-esperando" || e === "ci-rojo" || e === "pr-comentarios")).length;
    return h_flex().id("pendientes-barra").size_full().px(10).gap(6).items_center().justify_end().bg(t.chrome).border_t(1).border_color(t.border)
      .text_size(11.8).text_color(n ? t.foreground : t.dim).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => openOverlay({ mod: "mi-pendientes", kind: "dialog", width: 760, height: 520 }))
      .child(div().text_color(t.muted).child("Pendientes"))
      .child(div().font_semibold().text_color(urgentes ? "#e5c23a" : t.foreground).child(todos ? String(n) : "–"));
  }
}
