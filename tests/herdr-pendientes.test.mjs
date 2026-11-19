import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../herdr-app/mods/mi-pendientes/logica.js";

const D = 86400000;
const it = (o) => ({ id: o.id ?? "x", tipo: "auto", titulo: "t", repo: "web", etiquetas: [], creado: 1000, cerrado: null, ...o });

test("parseFiltro: estado, repo, etiquetas, orden y texto libre", () => {
  const f = L.parseFiltro('is:open repo:web label:pr-comentarios -label:manual sort:oldest login "a b"');
  assert.equal(f.estado, "open");
  assert.deepEqual(f.repos, [{ v: "web", no: false }]);
  assert.deepEqual(f.labels, [{ v: "pr-comentarios", no: false }, { v: "manual", no: true }]);
  assert.equal(f.orden, "oldest");
  assert.equal(f.texto, "login a b");
});

test("parseFiltro: comillas en valores y valores inválidos ignorados", () => {
  const f = L.parseFiltro('repo:"mi repo" is:otro sort:raro');
  assert.equal(f.repos[0].v, "mi repo");
  assert.equal(f.estado, null);
  assert.equal(f.orden, "newest");
});

test("aplicarFiltro: pestaña, repo, label negada y orden", () => {
  const xs = [
    it({ id: "a", repo: "web", etiquetas: ["sin-push"], creado: 3 }),
    it({ id: "b", repo: "api", etiquetas: ["manual"], creado: 2 }),
    it({ id: "c", repo: "web", etiquetas: ["manual"], creado: 1 }),
    it({ id: "d", repo: "web", cerrado: 9, creado: 0 }),
  ];
  const ids = (q, def) => L.aplicarFiltro(xs, L.parseFiltro(q), def).map((x) => x.id);
  assert.deepEqual(ids(""), ["a", "b", "c"]);
  assert.deepEqual(ids("repo:web -label:manual"), ["a"]);
  assert.deepEqual(ids("sort:oldest"), ["c", "b", "a"]);
  assert.deepEqual(ids("", "closed"), ["d"]);
  assert.deepEqual(ids("is:closed"), ["d"]);
  assert.deepEqual(ids("-repo:web"), ["b"]);
});

test("puntuar: subcadena, subsecuencia y no encaja", () => {
  assert.ok(L.puntuar("web", "web-front") > L.puntuar("web", "mi-web"));
  assert.ok(L.puntuar("wfr", "web-front") > 0);
  assert.equal(L.puntuar("zzz", "web"), -1);
  assert.equal(L.puntuar("", "web"), 0);
});

test("etiquetasGit: sin-commit, sin-push y olvidado", () => {
  const ahora = 100 * D;
  assert.deepEqual(L.etiquetasGit({ porcelain: " M a.js\n", sinPush: "", ultimoCommit: ahora, rama: "feature/X-1", ahora }), ["sin-commit"]);
  assert.deepEqual(L.etiquetasGit({ porcelain: "", sinPush: "abc123 algo\n", ultimoCommit: ahora, rama: "feature/X-1", ahora }), ["sin-push"]);
  assert.deepEqual(L.etiquetasGit({ porcelain: "", sinPush: "", ultimoCommit: ahora - 4 * D, rama: "feature/X-1", ahora }), ["olvidado"]);
  assert.deepEqual(L.etiquetasGit({ porcelain: "", sinPush: "", ultimoCommit: ahora - 4 * D, rama: "main", ahora }), []);
  assert.deepEqual(L.etiquetasGit({ porcelain: "", sinPush: "", ultimoCommit: ahora - 2 * D, rama: "feature/X-1", ahora }), []);
});

test("evaluarPrs: comentarios ajenos, cambios pedidos y CI rojo", () => {
  const prs = [
    { number: 1, title: "A", headRefName: "feature/A-1", author: { login: "yo" }, createdAt: "2026-01-01T00:00:00Z", url: "u1", reviewDecision: "", statusCheckRollup: [{ conclusion: "SUCCESS" }], comments: [{ author: { login: "yo" } }, { author: { login: "bot[bot]" } }] },
    { number: 2, title: "B", headRefName: "b", author: { login: "yo" }, reviewDecision: "CHANGES_REQUESTED", statusCheckRollup: [{ conclusion: "FAILURE" }], comments: [] },
    { number: 3, title: "C", headRefName: "c", author: { login: "yo" }, reviewDecision: "", statusCheckRollup: [{ state: "ERROR" }], comments: [{ author: { login: "ana" } }] },
  ];
  const r = L.evaluarPrs(JSON.stringify(prs));
  assert.deepEqual(r.map((x) => [x.numero, x.etiquetas]), [[2, ["pr-comentarios", "ci-rojo"]], [3, ["pr-comentarios", "ci-rojo"]]]);
  assert.equal(r[0].creado, null);
  assert.deepEqual(L.evaluarPrs("no es json"), []);
  assert.deepEqual(L.evaluarPrs(""), []);
});

test("reconciliar: abre, actualiza, cierra solo y reabre; no toca manuales", () => {
  const man = L.nuevoManual({ titulo: "Hablar con Ana", repo: "web", etiquetas: ["Urgente"] }, 5);
  assert.deepEqual(man.etiquetas, ["manual", "urgente"]);
  let xs = L.reconciliar([man], [{ id: "git:/a", titulo: "A", repo: "web", etiquetas: ["sin-push"] }], 10);
  assert.equal(xs.length, 2);
  assert.equal(xs.find((x) => x.id === "git:/a").creado, 10);
  xs = L.reconciliar(xs, [{ id: "git:/a", titulo: "A", repo: "web", etiquetas: ["sin-push", "sin-commit"] }], 20);
  const a = xs.find((x) => x.id === "git:/a");
  assert.deepEqual(a.etiquetas, ["sin-push", "sin-commit"]);
  assert.equal(a.creado, 10);
  xs = L.reconciliar(xs, [], 30);
  assert.equal(xs.find((x) => x.id === "git:/a").cerrado, 30);
  assert.equal(xs.find((x) => x.id === man.id).cerrado, null);
  xs = L.reconciliar(xs, [{ id: "git:/a", titulo: "A", repo: "web", etiquetas: ["ci-rojo"] }], 40);
  assert.equal(xs.find((x) => x.id === "git:/a").cerrado, null);
  assert.equal(xs.find((x) => x.id === "git:/a").creado, 40);
});

test("reconciliar: poda automáticos cerrados hace más de 30 días", () => {
  const viejo = it({ id: "v", cerrado: 1 });
  assert.equal(L.reconciliar([viejo], [], 31 * D).length, 0);
});

test("cerrar y almacén: ida y vuelta, y JSON roto da lista vacía", () => {
  const m = L.nuevoManual({ titulo: "x" }, 1);
  const cerrados = L.cerrar([m], m.id, 99);
  assert.equal(cerrados[0].cerrado, 99);
  assert.deepEqual(L.leerAlmacen(L.serializar(cerrados)), cerrados);
  assert.deepEqual(L.leerAlmacen("{roto"), []);
  assert.deepEqual(L.leerAlmacen(""), []);
});

test("ticket, repo, antigüedad y cuenta personal", () => {
  assert.equal(L.ticketDe("feature/proj-211-algo"), "PROJ-211");
  assert.equal(L.ticketDe("main"), null);
  assert.equal(L.nombreRepo("/home/u/projects/web/.git"), "web");
  assert.equal(L.nombreRepo("/srv/web.git"), "web");
  assert.equal(L.antiguedad(0), "");
  assert.equal(L.antiguedad(1000, 1000 + 3 * D), "3d");
  assert.equal(L.antiguedad(1000, 1000 + 90 * 60000), "1h");
  assert.equal(L.esPersonal("me · mi-proyecto"), true);
  assert.equal(L.esPersonal("web"), false);
});

test("vulnerabilidadesGraves: suma críticas y altas; 0 si falta, corrupto o sin resumen", () => {
  assert.equal(L.vulnerabilidadesGraves(JSON.stringify({ resumen: { critica: 1, alta: 2, media: 9 } })), 3);
  assert.equal(L.vulnerabilidadesGraves(JSON.stringify({ resumen: { critica: 0, alta: 0, baja: 4 } })), 0);
  assert.equal(L.vulnerabilidadesGraves(""), 0);
  assert.equal(L.vulnerabilidadesGraves("{roto"), 0);
  assert.equal(L.vulnerabilidadesGraves("null"), 0);
  assert.equal(L.vulnerabilidadesGraves(JSON.stringify({ resumen: { critica: "x", alta: -1 } })), 0);
});

test("tituloVulnerabilidades y etiqueta vulnerabilidad en las automáticas", () => {
  assert.equal(L.tituloVulnerabilidades(3), "3 vulnerabilidades críticas/altas");
  assert.equal(L.tituloVulnerabilidades(1), "1 vulnerabilidad crítica/alta");
  assert.ok(L.ETIQUETAS_AUTO.includes("vulnerabilidad"));
});

test("reconciliar: el item vulnerabilidad se cierra solo al bajar a 0 y se reabre si vuelven", () => {
  const det = { id: "vuln:/p", titulo: "2 vulnerabilidades críticas/altas", etiquetas: ["vulnerabilidad"] };
  let items = L.reconciliar([], [det], 1000);
  assert.equal(items[0].cerrado, null);
  items = L.reconciliar(items, [{ ...det, titulo: "5 vulnerabilidades críticas/altas" }], 2000);
  assert.equal(items[0].titulo, "5 vulnerabilidades críticas/altas");
  items = L.reconciliar(items, [], 3000);
  assert.equal(items[0].cerrado, 3000);
  items = L.reconciliar(items, [det], 4000);
  assert.equal(items[0].cerrado, null);
});
