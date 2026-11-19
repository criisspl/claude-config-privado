import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../herdr-app/mods/mi-auditoria/logica.js";

const ultima = {
  version: 1, ts: "2026-11-19T10:00:00Z", proyecto: "web", rama: "main",
  herramientas: { "npm-audit": "ok", semgrep: "no-disponible", gitleaks: "error" },
  resumen: { critica: 1, alta: 2, media: 0, baja: 5 }, por_tipo: { dependencia: 6, codigo: 2, secreto: 0 },
  hallazgos: [
    { id: "b", severidad: "baja", titulo: "Zeta", fichero: "a.js", linea: 3 },
    { id: "a", severidad: "critica", titulo: "Alfa", paquete: "lodash", version: "4.17.15", arreglo: { version_fija: "4.17.21" } },
    { id: "c", severidad: "baja", titulo: "Beta" },
  ],
};

test("parseUltima: normaliza y tolera ausente, corrupto o con tipos raros", () => {
  const u = L.parseUltima(JSON.stringify(ultima));
  assert.equal(u.proyecto, "web");
  assert.deepEqual(u.resumen, { critica: 1, alta: 2, media: 0, baja: 5 });
  assert.equal(L.parseUltima(""), null);
  assert.equal(L.parseUltima("{roto"), null);
  assert.equal(L.parseUltima("[]"), null);
  assert.equal(L.parseUltima(undefined), null);
  const raro = L.parseUltima(JSON.stringify({ resumen: { critica: "x", alta: -3 }, hallazgos: [1, null, { severidad: "alta" }] }));
  assert.deepEqual(raro.resumen, { critica: 0, alta: 0, media: 0, baja: 0 });
  assert.equal(raro.hallazgos.length, 1);
});

test("parseUltima: sin resumen ni por_tipo los cuenta de los hallazgos", () => {
  const u = L.parseUltima(JSON.stringify({ hallazgos: ultima.hallazgos.map((h) => ({ ...h, tipo: "codigo" })) }));
  assert.deepEqual(u.resumen, { critica: 1, alta: 0, media: 0, baja: 2 });
  assert.equal(u.por_tipo.codigo, 3);
});

test("parseHistorial: salta líneas rotas y calcula total si falta", () => {
  const t = [
    JSON.stringify({ ts: "1", resumen: { critica: 1, alta: 1 }, total: 9 }),
    "basura",
    "",
    JSON.stringify({ ts: "2", resumen: { critica: 1, alta: 1, baja: 2 } }),
    "[1]",
  ].join("\n");
  const h = L.parseHistorial(t);
  assert.equal(h.length, 2);
  assert.equal(h[0].total, 9);
  assert.equal(h[1].total, 4);
  assert.deepEqual(L.parseHistorial(undefined), []);
});

test("ordenarHallazgos: por severidad y luego título, sin mutar", () => {
  const o = L.ordenarHallazgos(ultima.hallazgos);
  assert.deepEqual(o.map((h) => h.id), ["a", "c", "b"]);
  assert.equal(ultima.hallazgos[0].id, "b");
});

test("anchoBarra: proporcional, mínimo 3 px si hay valor, 0 si no", () => {
  assert.equal(L.anchoBarra(5, 10, 100), 50);
  assert.equal(L.anchoBarra(10, 10, 100), 100);
  assert.equal(L.anchoBarra(1, 1000, 100), 3);
  assert.equal(L.anchoBarra(0, 10, 100), 0);
  assert.equal(L.anchoBarra(3, 0, 100), 0);
});

test("segmentosApilados: crítica arriba, sin huecos vacíos y mínimo 2 px", () => {
  const s = L.segmentosApilados({ critica: 1, alta: 0, media: 10, baja: 1 }, 20, 40);
  assert.deepEqual(s.map((x) => x.sev), ["critica", "media", "baja"]);
  assert.deepEqual(s.map((x) => x.alto), [2, 20, 2]);
});

test("ultimasEjecuciones y tendencia", () => {
  const hs = Array.from({ length: 15 }, (_, i) => ({ total: i }));
  assert.equal(L.ultimasEjecuciones(hs).length, 12);
  assert.equal(L.ultimasEjecuciones(hs)[0].total, 3);
  assert.deepEqual(L.tendencia([{ total: 3 }, { total: 5 }]), { delta: 2, flecha: "↑" });
  assert.deepEqual(L.tendencia([{ total: 5 }, { total: 1 }]), { delta: -4, flecha: "↓" });
  assert.equal(L.tendencia([{ total: 5 }, { total: 5 }]).flecha, "=");
  assert.equal(L.tendencia([{ total: 5 }]), null);
});

test("herramientasPorEstado, lugarHallazgo y arregloHallazgo", () => {
  assert.deepEqual(L.herramientasPorEstado(ultima.herramientas), { ok: ["npm-audit"], noDisponible: ["semgrep"], error: ["gitleaks"] });
  assert.equal(L.lugarHallazgo(ultima.hallazgos[1]), "lodash@4.17.15");
  assert.equal(L.lugarHallazgo(ultima.hallazgos[0]), "a.js:3");
  assert.equal(L.lugarHallazgo({}), "");
  assert.equal(L.arregloHallazgo(ultima.hallazgos[1]), "actualizar a 4.17.21");
  assert.equal(L.arregloHallazgo({ arreglo: { descripcion: "quitar" } }), "quitar");
  assert.equal(L.arregloHallazgo({}), "");
});

test("comandoArreglar: solo ids seguros (nada de saltos de línea)", () => {
  assert.equal(L.comandoArreglar("npm-audit:GHSA-1234"), "/auditar arreglar npm-audit:GHSA-1234");
  assert.equal(L.comandoArreglar("a\nrm -rf"), null);
  assert.equal(L.comandoArreglar("a b"), null);
  assert.equal(L.comandoArreglar(undefined), null);
});

test("fechaCorta: formato dd/mm hh:mm y vacío si no es fecha", () => {
  assert.match(L.fechaCorta("2026-11-19T10:00:00Z"), /^\d\d\/\d\d \d\d:\d\d$/);
  assert.equal(L.fechaCorta("nada"), "");
  assert.equal(L.fechaCorta(null), "");
});
