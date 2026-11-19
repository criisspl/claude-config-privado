import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const L = await import(new URL("../herdr-app/mods/mi-db-explorer/logica.js", import.meta.url).href);

test("clasificar: SELECT en minúsculas y con comentarios iniciales es lectura", () => {
  assert.equal(L.clasificar("select 1").lectura, true);
  assert.equal(L.clasificar("-- hola\n/* x */ # y\n  Select * from t").lectura, true);
  for (const q of ["SHOW TABLES", "describe t", "EXPLAIN select 1", "desc t"]) assert.equal(L.clasificar(q).lectura, true, q);
});

test("clasificar: escrituras piden confirmación", () => {
  for (const q of ["insert into t values (1)", "UPDATE t SET a=1 WHERE id=2", "drop table t", "/* select */ delete from t", "SET @a=1", "/*!50000 DELETE FROM t*/", "select * from t into outfile '/tmp/x'", ""])
    assert.equal(L.clasificar(q).lectura, false, q);
});

test("clasificar: UPDATE/DELETE sin WHERE detectado; con WHERE no; WHERE en cadena o comentario no cuenta", () => {
  assert.equal(L.clasificar("UPDATE t SET a=1").sentencias[0].sinWhere, true);
  assert.equal(L.clasificar("delete from t").sentencias[0].sinWhere, true);
  assert.equal(L.clasificar("UPDATE t SET a=1 where id=1").sentencias[0].sinWhere, false);
  assert.equal(L.clasificar("UPDATE t SET a='where'").sentencias[0].sinWhere, true);
  assert.equal(L.clasificar("DELETE FROM t -- where id=1").sentencias[0].sinWhere, true);
  assert.equal(L.clasificar("select * from t").sentencias[0].sinWhere, false);
});

test("clasificar: varias sentencias; si alguna no es lectura, no es lectura", () => {
  assert.equal(L.clasificar("select 1; select 2;").lectura, true);
  const c = L.clasificar("select 1; delete from t; select 3");
  assert.equal(c.lectura, false);
  assert.equal(c.sentencias.length, 3);
  assert.equal(c.sentencias[1].sinWhere, true);
  assert.equal(L.clasificar("select ';' ; select 2").sentencias.length, 2);
  assert.equal(L.clasificar("select 'a;b'").sentencias.length, 1);
});

test("parseSalida: cabecera, NULL, escapes y tope de 200 filas", () => {
  const r = L.parseSalida("id\tn\n1\tNULL\n2\ta\\tb\\nc\n");
  assert.deepEqual(r.cols, ["id", "n"]);
  assert.deepEqual(r.filas, [["1", null], ["2", "a\tb\nc"]]);
  const grande = "x\n" + Array.from({ length: 500 }, (_, i) => i).join("\n");
  const g = L.parseSalida(grande);
  assert.equal(g.filas.length, 200);
  assert.equal(g.total, 500);
  assert.deepEqual(L.parseSalida(""), { cols: [], filas: [], total: 0 });
});

test("tablas: parseo, filtro y SELECT con LIMIT 50", () => {
  const ts = L.parseTablas("Tables_in_db\nusers\norders\n");
  assert.deepEqual(ts, ["users", "orders"]);
  assert.deepEqual(L.filtrarTablas(ts, "ORD"), ["orders"]);
  assert.equal(L.selectTabla("users"), "SELECT * FROM `users` LIMIT 50");
  assert.equal(L.selectTabla("a`b"), "SELECT * FROM `a``b` LIMIT 50");
});

test("parseNombres: secciones sin duplicados", () => {
  assert.deepEqual(L.parseNombres("QA\nPRO SLAVE\n\nQA\n"), ["QA", "PRO SLAVE"]);
});

test("la clave no aparece en argv: la ve mysql solo por MYSQL_PWD (fichero y mysql falsos)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dbx-"));
  const CLAVE = "clave-falsa-9f3a";
  const fichero = join(dir, "conexiones");
  writeFileSync(fichero, `##### OTRA #####\nDBHOST=h2\nDBUSERNAME=u2\nDBPASSWORD=nope\nDBNAME=d2\n\n##### QA #####\nDBHOST=host-qa\nDBUSERNAME=usr\nDBPASSWORD=${CLAVE}\nDBNAME=bd\n`);
  const falso = join(dir, "mysql");
  writeFileSync(falso, '#!/bin/sh\necho "pwd=$MYSQL_PWD"\necho "args=$*"\n');
  chmodSync(falso, 0o755);

  const [cmd, args] = L.argvMysql("QA", "SELECT 1", { fichero, mysql: falso });
  assert.ok(!JSON.stringify([cmd, args]).includes(CLAVE));
  const out = execFileSync(cmd, args, { encoding: "utf8" });
  assert.match(out, new RegExp(`pwd=${CLAVE}`));          // llega por entorno
  const argsMysql = out.split("args=")[1];
  assert.ok(!argsMysql.includes(CLAVE));                   // no por argv de mysql
  assert.match(argsMysql, /-h host-qa -u usr bd -e SELECT 1/);

  const [c2, a2] = L.argvConexiones({ fichero });
  assert.ok(!JSON.stringify([c2, a2]).includes(CLAVE));
  const nombres = L.parseNombres(execFileSync(c2, a2, { encoding: "utf8" }));
  assert.deepEqual(nombres, ["OTRA", "QA"]);
  assert.ok(!nombres.join().includes(CLAVE));
});

// --- Edición de conexiones: siempre sobre un fichero temporal, nunca ~/conexionesLocal ---
const tmpFichero = (txt) => {
  const f = join(mkdtempSync(join(tmpdir(), "dbx-")), "conexiones");
  writeFileSync(f, txt);
  return f;
};
const correr = ([c, a]) => execFileSync(c, a, { encoding: "utf8" });
const leerF = (f) => readFileSync(f, "utf8");
const BASE = "##### UNO #####\nDBHOST=h1\nDBUSERNAME=u1\nDBPASSWORD=p1\nDBNAME=d1\n\n##### DOS #####\nDBHOST=h2\nDBUSERNAME=u2\nDBPASSWORD=p2\nDBNAME=d2\n";

test("guardar: sección existente se reescribe, el resto intacto, con .bak y 600", () => {
  const f = tmpFichero(BASE);
  correr(L.argvGuardar({ nombre: "UNO", host: "nuevo", usuario: "uu", clave: "", bbdd: "dd" }, { fichero: f }));
  assert.equal(leerF(f), BASE.replace("DBHOST=h1", "DBHOST=nuevo").replace("DBUSERNAME=u1", "DBUSERNAME=uu").replace("DBNAME=d1", "DBNAME=dd"));
  assert.equal(leerF(f + ".bak"), BASE);
  assert.equal(statSync(f).mode & 0o777, 0o600);
});

test("guardar: clave nueva sustituye; vacía conserva", () => {
  const f = tmpFichero(BASE);
  correr(L.argvGuardar({ nombre: "DOS", host: "h2", usuario: "u2", clave: "nueva", bbdd: "d2" }, { fichero: f }));
  assert.match(leerF(f), /##### DOS #####\nDBHOST=h2\nDBUSERNAME=u2\nDBPASSWORD=nueva\nDBNAME=d2\n/);
  correr(L.argvGuardar({ nombre: "DOS", host: "h3", usuario: "u2", clave: "", bbdd: "d2" }, { fichero: f }));
  assert.match(leerF(f), /DBHOST=h3\nDBUSERNAME=u2\nDBPASSWORD=nueva\n/);
});

test("guardar: sección nueva se añade al final", () => {
  const f = tmpFichero(BASE);
  correr(L.argvGuardar({ nombre: "PRO ESCRITURA", host: "hp", usuario: "up", clave: "cp", bbdd: "dp" }, { fichero: f }));
  assert.equal(leerF(f), BASE + "\n##### PRO ESCRITURA #####\nDBHOST=hp\nDBUSERNAME=up\nDBPASSWORD=cp\nDBNAME=dp\n");
});

test("guardar: fichero inexistente se crea; valores con comillas, $ y espacios sobreviven al eval", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dbx-")), "nuevo");
  const clave = `a'b "c" $HOME \\n \`x\``;
  correr(L.argvGuardar({ nombre: "X", host: "h", usuario: "u", clave, bbdd: "d" }, { fichero: f }));
  const sal = execFileSync("sh", ["-c", 'eval "$(awk \'$0=="##### X #####"{f=1;next} /^$/{f=0} f\' "$1")"; printf %s "$DBPASSWORD"', "sh", f], { encoding: "utf8" });
  assert.equal(sal, clave);
});

test("borrar: quita la sección entera y deja el resto", () => {
  const f = tmpFichero(BASE);
  correr(L.argvBorrar("UNO", { fichero: f }));
  assert.equal(leerF(f), "##### DOS #####\nDBHOST=h2\nDBUSERNAME=u2\nDBPASSWORD=p2\nDBNAME=d2\n");
  assert.equal(leerF(f + ".bak"), BASE);
  const g = tmpFichero(BASE);
  correr(L.argvBorrar("DOS", { fichero: g }));
  assert.equal(leerF(g), "##### UNO #####\nDBHOST=h1\nDBUSERNAME=u1\nDBPASSWORD=p1\nDBNAME=d1\n\n");
});

test("guardar: nombre con metacaracteres de shell/awk no se interpreta", () => {
  const f = tmpFichero(BASE);
  correr(L.argvGuardar({ nombre: "a$(touch /tmp/dbx-pwn)\"b", host: "h", usuario: "u", clave: "c", bbdd: "d" }, { fichero: f }));
  assert.match(leerF(f), /##### a\$\(touch \/tmp\/dbx-pwn\)"b #####/);
});

test("validar: rechaza vacíos, saltos de línea y #####", () => {
  const ok = { nombre: "N", host: "h", usuario: "u", clave: "", bbdd: "d" };
  assert.equal(L.validar(ok), null);
  for (const k of ["nombre", "host", "usuario", "bbdd"]) {
    assert.ok(L.validar({ ...ok, [k]: "" }), k);
    assert.ok(L.validar({ ...ok, [k]: "a\nb" }), k);
    assert.ok(L.validar({ ...ok, [k]: "a ##### b" }), k);
  }
  assert.ok(L.validar({ ...ok, clave: "a\nb" }));
});

test("argvProbar: la clave va en argumento posicional, no en el script", () => {
  const [, a] = L.argvProbar({ host: "h", usuario: "u", clave: "secreta", bbdd: "d" });
  assert.ok(!a[1].includes("secreta"));
  assert.equal(a[5], "secreta");
});

test("argvDetalle: devuelve host/usuario/BBDD y nunca la clave", () => {
  const f = tmpFichero(BASE);
  const sal = correr(L.argvDetalle("DOS", { fichero: f }));
  assert.deepEqual(L.parseDetalle(sal), { host: "h2", usuario: "u2", bbdd: "d2" });
  assert.ok(!sal.includes("p2"));
});
