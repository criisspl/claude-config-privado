// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Under each space, one sub-row per agent
// (name, time, state dot; click focuses its pane). Click to switch, right-click for its menu, drag to reorder.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, agents, checking, notify, playSound } from "herdr";
import { PortScanner, forwards, openPort, stopForward } from "./ports.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and its separator.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();
const ROLES = { mecanico: "PO", buscador: "UX", implementador: "Senior", "revisor-pr": "QA", planificador: "Tech Lead" }; // agente -> rol de la oficina
const AGENT_ROW = 26;

// Estado: comecocos animado trabajando, tick al terminar, ? si necesita algo, anillo si espera.
const pacman = (k, n = 14) => {
  const ly = (f) => image(`mods/mi-spaces/pac/${f}.svg`).absolute().top(0).left(0).w(n).h(n);
  return div().relative().w(n).h(n).flex_none().child(ly(`${k}-a`)).child(ly(`${k}-b`).loop("opacity", { from: 0, to: 1, period: 600, easing: "linear" }));
};
const statusMark = (a) => {
  if (a.status === "working") return pacman(`pac${[...String(a.address)].reduce((x, c) => x + c.charCodeAt(0), 0) % 6}`, 16);
  if (a.status === "done" || a.status === "idle") return div().w(16).flex_none().text_size(15).text_color("#2dffa0").child("\u2713");
  if (a.status === "blocked") return div().w(16).flex_none().text_size(15).font_semibold().text_color("#ff5fcf").child("?");
  return div().size(6).flex_none().rounded(3).border(1).border_color("#c58bff").opacity(0.6);
};

// Iconos por palabras del título (el primero que coincide gana); si no, el del programa.
const ICONOS = [
  [/\b(pr|review|merge|pull)\b/i, "git-pull-request", "#c58bff"], [/bug|fix|error|incidenc|fallo|hotfix/i, "bug", "#ff5577"],
  [/test|qa\b|prueba|aduana/i, "flask-conical", "#2dffa0"], [/deploy|release|despliegue|publica/i, "rocket", "#ffb02e"],
  [/\b(vpo|vpb|vpa)-\d+|ticket|jira/i, "ticket", "#9cc0e8"], [/dise|design|estilo|personaliz|tema|herdr|css|ui\b/i, "palette", "#ff5fcf"],
  [/mail|correo|braze|newsletter/i, "mail", "#ecd49a"], [/checkout|pago|pay|esim|compra|reserva/i, "shopping-cart", "#9cd4cc"],
  [/segur|secur|auth|login|token/i, "shield", "#a8aee8"], [/refactor|wip|config|setup|migra/i, "wrench", "#e8d08a"],
  [/busca|search|investig|analis|an[aá]lisis/i, "search", "#8cc8e8"], [/web|front|pdp|pagina|landing/i, "globe", "#a8d8a0"],
  [/chat|talent|digest|revi|presenta/i, "message-square", "#d0a8e8"],
];
const iconColor = (texto, fallback) => ICONOS.find(([re]) => re.test(texto))?.[2] ?? fallback;
const agentIcon = (a, texto, color) => {
  const hit = ICONOS.find(([re]) => re.test(texto));
  if (hit) return svg(`mods/mi-spaces/icons/${hit[1]}.svg`).size(12).flex_none().text_color(a.status === "blocked" ? color : hit[2]);
  const p = a.program;
  if (p?.icon) return p.tint ? svg(p.icon).size(12).flex_none().text_color(color) : image(p.icon).w(12).h(12).flex_none();
  return svg("mods/mi-spaces/icons/sparkles.svg").size(12).flex_none().text_color(color);
};
const SUBBOT = { mecanico: 1, buscador: 3, implementador: 2, "revisor-pr": 4, experto: 0, planificador: 0 }; // cabeza de robot (colores de los bots)
const botHead = (k) => {
  const ly = (f) => image(`mods/mi-panel-resumen/bot${k}-${f}.svg`).absolute().top(0).left(0).w(14).h(14);
  return div().relative().w(14).h(14).flex_none().child(ly("a")).child(ly("b").loop("opacity", { from: 0, to: 1, period: 600, easing: "linear" }));
};
const PANEL = "http://127.0.0.1:4777/api/data";
const KEY = /[A-Z]+-\d+/;
const CI = { SUCCESS: ["CI ✓", "done"], FAILURE: ["CI ✗", "blocked"], ERROR: ["CI ✗", "blocked"], PENDING: ["CI …", "working"], EXPECTED: ["CI …", "working"] };
const REVIEW = { APPROVED: ["aprobada", "done"], CHANGES_REQUESTED: ["cambios", "blocked"], REVIEW_REQUIRED: ["review", "dim"] };
function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const RAIL_CELL = 32;
// A space's name and its git tail never shrink below this, so a short one ("api")
// stays readable instead of turning into an ellipsis next to a long branch.
const SIDE_MIN = 48;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// Places looked at together (two git runs each). All at once, a few hundred spaces
// run out of the app's open files (256 when started from the Dock on macOS) or
// past a machine core's 16 running execs, and those spaces wait for FALLBACK.
const AT_ONCE = 6;

// Both runs, finished: a place isn't done while one of its runs still holds a slot.
async function both(a, b) {
  const done = await Promise.allSettled([a, b]);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#2dffa0", ansi3: "#ffb02e", ansi4: "#9cc0e8", ansi5: "#c58bff", ansi2: "#a8d8a0", ansi1: "#ff5fcf" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Map(); // local repos' pending folder watches
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.scroll = ScrollHandle.new(); // the list's position: the active space is brought into view through it
    this.activeAt = -1; // the active space's place among the list's children (headers and rows), -1 when not drawn
    this.machines = [];
    try {
      this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
      if (!this.reconnecting || typeof this.reconnecting !== "object" || Array.isArray(this.reconnecting)) this.reconnecting = {};
      for (const state of Object.values(this.reconnecting)) state.busy = false;
    } catch { this.reconnecting = {}; }
    try { this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]")); } catch { this.folded = new Set(); }
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    setShared("agents.desde", this.changed);
    // Subagentes vivos por terminal (los escribe el hook oficina-subagent.sh): una sola lectura cada 5 s.
    this.hooked = new Map();
    if (!checking()) {
      const poll = async (cx) => {
        const r = await exec("sh", ["-c", 'find "$HOME/.local/state/oficina" -type f -mmin -30 -exec grep -H . {} + 2>/dev/null']);
        const m = new Map();
        for (const l of (r.stdout || "").split("\n")) {
          const x = /oficina\/([^/]+)\/[^:]+:(.+)$/.exec(l);
          if (x) m.set(x[1], [...(m.get(x[1]) ?? []), ROLES[x[2]] ? `${ROLES[x[2]]} · ${x[2]}` : x[2]]);
        }
        if (JSON.stringify([...m]) !== JSON.stringify([...this.hooked])) { this.hooked = m; cx.notify(); }
      };
      cx.spawn(poll);
      cx.timer.every(5000, (cx) => cx.spawn(poll));
    }
    cx.timer.every(30000, (cx) => cx.notify());
    // Puertos escuchando por space (ports.js), cada 5 s; si falla, no se pinta nada.
    try {
      this.ports = new PortScanner();
      const scan = (cx) => cx.spawn(async (cx) => { try { if (await this.ports.scan().catch(() => false)) cx.notify(); } catch {} });
      if (!checking()) cx.timer.every(5000, scan);
    } catch { this.ports = null; }
    // Datos del panel (PRs, CI, review, Jira) cada 120 s; los comparten los demás mods con shared("panel.data").
    // Si el panel cae, se guarda null y no se pinta nada.
    if (!checking()) {
      const tick = (cx) => cx.spawn(async (cx) => {
        let data = null;
        try {
          const r = await fetch(PANEL, { headers: { "x-panel": "1" } });
          data = r.ok ? await r.json() : null;
        } catch { data = null; }
        setShared("panel.data", data);
        // Aviso solo en la transición: CI rojo o cambios pedidos en una PR mía. La primera carga no avisa.
        try {
          const now = new Map((data?.prs ?? []).map((p) => [`${p.repo}#${p.number}`, p]));
          if (this.prState && data) {
            for (const [k, p] of now) {
              const was = this.prState.get(k);
              const red = (x) => x?.statusCheckRollup === "FAILURE" || x?.statusCheckRollup === "ERROR";
              const ch = (x) => x?.reviewDecision === "CHANGES_REQUESTED";
              if ((red(p) && !red(was)) || (ch(p) && !ch(was))) {
                notify({ title: red(p) && !red(was) ? "CI rojo en tu PR" : "Cambios pedidos en tu PR", body: `#${p.number} ${p.title}`, level: "warning", action: undefined });
                playSound("blocked");
              }
            }
          }
          if (data) this.prState = now;
        } catch { /* sin aviso */ }
        cx.notify();
      });
      tick(cx);
      cx.timer.every(120000, tick);
    }
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      delete this.git[k];
      delete this.checked[k];
      this.unsure.delete(k);
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const [repo, pending] of this.watching) if (!repos.has(JSON.stringify([null, repo]))) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
          while (next < keys.length) await this.check(keys[next++], cx);
        }));
      }
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      // Two reads: a folder name may itself contain a newline.
      const [r, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      );
      if (r.code !== 0 || common.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) {
          this.unsure.add(key);
          this.git[key] ??= null;
        } else this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await both(
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      );
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const mine = JSON.stringify([null, repo]);
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === mine);
          if (!keys.length) break;
          this.refreshGit(keys, cx);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "mi-menu", kind: "popup", width: 230, height: 420, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const live = agents();
    this.track(live, Date.now());
    const draw = (r) => (collapsed ? this.compact(r, t) : v_flex().flex_none().child(this.row(r, t)).children(this.panelInfo(r, t)).children(this.portsLine(r.w, t)).children(this.agentRows(r.w, live, t)));
    // Where the active space's row lands among the children this returns: the list scrolls by its direct
    // children, and machine headers, login notes and loading rows count too.
    this.activeAt = -1;
    this.used = 0; // alto de las filas dibujadas, para ajustar el bloque
    let before = 0;
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(13.5).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) {
      if (loading(null) && !rows.length) return [loadingRow(null)];
      this.activeAt = rows.findIndex(r => r.w.active);
      return rows.map(draw);
    }
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
      const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(12.5).text_color(t.dim)
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(machine?.keeps_running_after_logout === false, el => el.child(div().id(`machine-logout-${m}`)
          .flex_none().text_color(t.blocked).tooltip("Agents stop when you disconnect. Click for the fix.")
          .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }); }).child("⚠")))
        .when(!collapsed, el => el.child(icon))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
        .text_size(13.5).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
            .child(svg("mods/workspace-chrome/plus.svg").size(10))))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
      if (!collapsed && rebuilt) { before += 1; return [head]; }
      const cell = collapsed ? railCell : (el) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(12.5).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(12.5).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2).rounded(4)
            .text_size(12.5).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      const items = [cell(head), ...guidance, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : cell(empty)])];
      const first = folded ? -1 : mine.findIndex(r => r.w.active);
      if (first >= 0) this.activeAt = before + 1 + guidance.length + first;
      before += items.length;
      return items;
    });
  }

  // Stamps agents whose state changed. Done and idle count as one.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
    setShared("agents.desde", this.changed); // mi-tabs lo lee para el tiempo trabajando
  }

  // #PR, CI, review, open threads and Jira status for the space's ticket key. Never throws: no data, nothing drawn.
  panelInfo(r, t) {
    try {
      const data = shared("panel.data");
      if (!data) return [];
      const key = (KEY.exec(r.w.name) ?? KEY.exec(r.g?.branch ?? ""))?.[0];
      if (!key) return [];
      const pr = (data.prs ?? []).find((p) => p.key === key || KEY.exec(p.branch ?? "")?.[0] === key);
      const jira = (data.jira ?? []).find((j) => j.key === key);
      if (!pr && !jira) return [];
      const bit = (txt, tone) => div().flex_none().text_color(tone === "dim" ? t.dim : t[tone]).child(txt);
      const row = h_flex().h(20).flex_none().pl(34).pr(8).gap(8).items_center().text_size(12).text_color(t.dim).overflow_hidden();
      if (pr) {
        row.child(div().id(`pr-${r.w.id}`).flex_none().text_color(t.accent).cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(pr.url); }).child(`#${pr.number}`));
        const ci = CI[pr.statusCheckRollup];
        if (ci) row.child(bit(ci[0], ci[1]));
        const rv = REVIEW[pr.reviewDecision];
        if (rv) row.child(bit(rv[0], rv[1]));
        if (pr.open?.length) row.child(bit(`${pr.open.length} hilo${pr.open.length > 1 ? "s" : ""}`, "working"));
      }
      if (jira?.status) row.child(div().flex_1().min_w(0).truncate().text_right().child(jira.status));
      this.used += 20;
      return [row];
    } catch { return []; }
  }

  // Una línea tenue con los puertos del space (:3000 :5173, máx. 4 y "+N"); clic abre, clic derecho para el forward.
  portsLine(w, t) {
    try {
      const all = this.ports?.bySpace?.[w.id] ?? [];
      if (!all.length) return [];
      const machine = w.machine ?? null;
      const target = this.machines.find((m) => m.name === machine)?.target;
      const live = forwards();
      const chip = (port) => {
        const f = machine ? live[`${machine}:${port}`] : null;
        return div().id(`port-${w.id}-${port}`).flex_none().rounded(4).px(2).text_color(f ? t.accent : t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip(machine ? (f ? `Forwarded to localhost:${f.local}` : `Forward ${machine}:${port} and open`) : `Open localhost:${port}`)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_mouse_up("left", (_e, cx) => { cx.stop_propagation(); cx.spawn(async (cx) => { await openPort(machine, port, target); cx.notify(); }); })
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); if (f) cx.spawn(async (cx) => { await stopForward(machine, port); cx.notify(); }); })
          .child(`:${port}`);
      };
      const row = h_flex().h(18).flex_none().pl(34).pr(8).gap(4).items_center().text_size(11.5).text_color(t.dim).overflow_hidden()
        .children(all.slice(0, 4).map(chip));
      if (all.length > 4) row.child(div().flex_none().child(`+${all.length - 4}`));
      this.used += 18;
      return [row];
    } catch { return []; }
  }

  // One sub-row per agent of the space (name, time, state dot), plus its live sub-agents.
  agentRows(w, live, t) {
    const now = Date.now();
    const out = [];
    for (const a of live.filter((x) => x.space === w.id)) {
      this.used += AGENT_ROW;
      const col = a.status === "blocked" ? "#ff5577" : a.status === "working" ? t.working : a.status === "done" ? t.done : t.dim;
      const when = this.changed[a.address]?.at;
      out.push(h_flex().id(`ag-${a.address}`).h(AGENT_ROW).flex_none().pl(34).pr(8).gap(8).items_center().rounded(6).text_size(14)
        .when(a.focused, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.hover))
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(statusMark(a))
        .child(agentIcon(a, clean(a.title) || a.tab_name || "", a.status === "blocked" ? "#ff5577" : "#c58bff"))
        .child(div().flex_1().min_w(0).truncate().text_color(a.status === "blocked" ? "#ff5577" : a.focused ? t.foreground : t.muted).child(clean(a.title) || a.tab_name || a.program?.name || a.address))
        .when(Boolean(when), (el) => el.child(div().flex_none().text_size(13).text_color(t.dim).child(duration(now - when)))));
      for (const [j, n] of (this.hooked.get(a.address) ?? []).entries()) {
        this.used += AGENT_ROW;
        out.push(h_flex().id(`hk-${a.address}-${j}`).h(AGENT_ROW).flex_none().pl(48).gap(6).items_center().text_size(13).text_color(t.working)
          .child(botHead(SUBBOT[n.split(" · ").pop()] ?? 4))
          .child(div().truncate().child(n)));
      }
    }
    return out;
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one. When the row is full, it
  // and the name both start from their text's width and give way in proportion.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_auto()
      .min_w(where ? SIDE_MIN : 0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(14)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t) {
    this.used += rowHeight({ tree });
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(/^me(\s*·|$)/i.test(w.name) && !on, (el) => el.bg("#f0a0c80f"))
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim)))
          .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(9).bg(fill).items_center().justify_center().text_size(12).font_bold().text_color("#1b1d2b").child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_initial().min_w(SIDE_MIN).truncate().font_medium().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1()),
      );
  }

  compact({ w, i }, t) {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(tone(t, w.status)).child(glyph(w.status))));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const list = this.grouped(t, collapsed);
    // Alto según contenido: cabecera 31 + filas + cabeceras de máquina + pb 14; el sobrante queda abajo.
    if (!collapsed) {
      const want = Math.min(700, Math.max(90, Math.ceil(31 + 14 + this.used)));
      const cur = find(layout(), "spaces")?.size?.px;
      if (cur !== undefined && Math.abs(cur - want) > 1) run("layout.resize", { id: "spaces", px: want });
    }
    // Bring the active space into view when it, or its place in the list, changes; a row already in view stays put.
    const active = sp.find(p => p.active)?.id;
    if (active !== this.revealed || this.activeAt !== this.revealedAt) {
      this.revealed = active;
      this.revealedAt = this.activeAt;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
    }
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(14.5)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(13).text_color("#d9a6ff")
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/monitor.svg").size(15).flex_none().text_color(theme().muted)))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // A block above (another mod's) growing, or the window resizing, shrinks this list and can push the active space out.
        .on_size_change((_size, cx) => { if (this.activeAt >= 0) { this.scroll.scroll_to_item(this.activeAt); cx.notify(); } })
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(list))
      .when(collapsed, (el) => el.child(h_flex().h(28).flex_none().items_center().justify_center()
        .child(div().id("collapse").text_size(14.5).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»"))));
  }
}
