// Lógica pura del explorador de BBDD (sin gpui ni herdr): conexiones, clasificación de sentencias y salida de mysql.
// La clave NUNCA pasa por aquí: la lee el propio script de shell (MYSQL_PWD) en el momento de ejecutar.

export const MAX_FILAS = 200;
const LECTURA = new Set(["select", "show", "describe", "desc", "explain"]);

// Mismo parseo awk que ~/.claude/mcp/mysql-mcp.sh. $1 conexión, $2 SQL, $3 fichero, $4 binario.
const EJECUTAR = [
  'eval "$(awk -v s="##### $1 #####" \'$0==s{f=1;next} /^#####/{f=0} /^$/{f=0} f&&/^DB[A-Z]+=/{print}\' "${3:-$HOME/conexionesLocal}")"',
  'MYSQL_PWD="$DBPASSWORD" exec "$4" -B --connect-timeout=10 -h "$DBHOST" -u "$DBUSERNAME" "$DBNAME" -e "$2"',
].join("\n");
// Solo los nombres de sección: el fichero tiene claves y aquí no se leen.
const LISTAR = 'awk \'/^##### .* #####$/{sub(/^##### /,"");sub(/ #####$/,"");print}\' "${1:-$HOME/conexionesLocal}"';

// [comando, args] para exec(). Sin clave en argv: solo conexión, SQL y rutas.
export const argvMysql = (conexion, sql, { fichero = "", mysql = "/usr/bin/mysql" } = {}) =>
  ["sh", ["-c", EJECUTAR, "sh", conexion, sql, fichero, mysql]];
export const argvConexiones = ({ fichero = "" } = {}) => ["sh", ["-c", LISTAR, "sh", fichero]];

export const parseNombres = (stdout) => [...new Set((stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean))];

// Parte el SQL en sentencias por `;` fuera de comillas y comentarios. Cada una: texto sin comentarios y su versión
// con el contenido de las cadenas en blanco (para buscar palabras sin falsos positivos).
export function sentencias(sql) {
  const res = [];
  let txt = "", masc = "";
  const cerrar = () => { if (txt.trim()) res.push({ texto: txt.trim(), masc: masc.trim() }); txt = ""; masc = ""; };
  const s = sql ?? "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === "\\" && c !== "`" ? 2 : 1;
      const lit = s.slice(i, j + 1);
      txt += lit; masc += c + " ".repeat(Math.max(0, lit.length - 2)) + (lit.length > 1 ? c : "");
      i = j;
    } else if ((c === "-" && n === "-" && /[\s]|^$/.test(s[i + 2] ?? "")) || c === "#") {
      while (i < s.length && s[i] !== "\n") i++;
      txt += " "; masc += " ";
    } else if (c === "/" && n === "*" && s[i + 2] !== "!") {
      const f = s.indexOf("*/", i + 2);
      i = f < 0 ? s.length : f + 1;
      txt += " "; masc += " ";
    } else if (c === ";") cerrar();
    else { txt += c; masc += c; }
  }
  cerrar();
  return res;
}

// { lectura, sentencias: [{texto, tipo, lectura, sinWhere}] }. lectura = todas las sentencias son de lectura.
export function clasificar(sql) {
  const ss = sentencias(sql).map(({ texto, masc }) => {
    const tipo = (masc.match(/^[a-zA-Z]+/)?.[0] ?? "").toLowerCase();
    const escribe = /\binto\s+(outfile|dumpfile)\b/i.test(masc);
    return {
      texto, tipo,
      lectura: LECTURA.has(tipo) && !escribe,
      sinWhere: (tipo === "update" || tipo === "delete") && !/\bwhere\b/i.test(masc),
    };
  });
  return { lectura: ss.length > 0 && ss.every((x) => x.lectura), sentencias: ss };
}

const desescapar = (v) => (v === "NULL" ? null : v.replace(/\\([tn0\\])/g, (_m, c) => (c === "t" ? "\t" : c === "n" ? "\n" : c === "0" ? "\0" : "\\")));

// Salida de `mysql -B`: primera línea cabecera, valores separados por tab. {cols, filas (arrays), total}.
export function parseSalida(stdout, max = MAX_FILAS) {
  const lineas = (stdout ?? "").split("\n");
  if (lineas[lineas.length - 1] === "") lineas.pop();
  if (!lineas.length) return { cols: [], filas: [], total: 0 };
  const cols = lineas[0].split("\t");
  const filas = lineas.slice(1, 1 + max).map((l) => l.split("\t").map(desescapar));
  return { cols, filas, total: lineas.length - 1 };
}

export const parseTablas = (stdout) => parseSalida(stdout, Infinity).filas.map((f) => f[0]);
export const filtrarTablas = (tablas, q) => { const x = (q ?? "").trim().toLowerCase(); return x ? tablas.filter((t) => t.toLowerCase().includes(x)) : tablas; };
export const selectTabla = (t) => `SELECT * FROM \`${t.replace(/`/g, "``")}\` LIMIT 50`;

// --- Edición de ~/conexionesLocal (solo la sección tocada; el resto del fichero queda intacto) ---
// $1 fichero, $2 nombre, $3 host, $4 usuario, $5 clave, $6 BBDD, $7 save|del. Los valores llegan como argumentos
// posicionales y pasan a awk por ENVIRON: nunca se interpolan en el script. Clave vacía = conservar la actual.
// Los valores con caracteres especiales se escriben entre comillas simples (el lector hace eval de las líneas DB*=).
const ESCRIBIR = String.raw`f="$1"; [ -n "$f" ] || f="$HOME/conexionesLocal"
[ -f "$f" ] || : > "$f" || exit 1
cp -p "$f" "$f.bak" || exit 1
tmp="$(mktemp "$f.XXXXXX")" || exit 1
N="$2" H="$3" U="$4" P="$5" D="$6" M="$7" awk '
function q(v) { if (v ~ /^[A-Za-z0-9_.@:\/%+=,-]*$/) return v; gsub(/\047/, "\047\\\047\047", v); return "\047" v "\047" }
function out() {
  print s; print "DBHOST=" q(H); print "DBUSERNAME=" q(U)
  print (P != "" ? "DBPASSWORD=" q(P) : (old != "" ? old : "DBPASSWORD="))
  print "DBNAME=" q(D)
  for (i = 0; i < nother; i++) print other[i]
}
function flush() { if (!sec) return; sec = 0; if (M == "save") out() }
BEGIN { N = ENVIRON["N"]; H = ENVIRON["H"]; U = ENVIRON["U"]; P = ENVIRON["P"]; D = ENVIRON["D"]; M = ENVIRON["M"]; s = "##### " N " #####" }
{
  if (sec && ($0 == "" || /^#####/)) { flush(); if ($0 == "") { if (M == "save") { print; last = $0 } next } }
  if ($0 == s) { sec = 1; found = 1; old = ""; nother = 0; next }
  if (sec) { if (/^DBPASSWORD=/) old = $0; else if (!/^DB(HOST|USERNAME|NAME)=/) other[nother++] = $0; next }
  print; last = $0
}
END { flush(); if (!found && M == "save") { if (NR > 0 && last != "") print ""; out() } }
' "$f" > "$tmp" || { rm -f "$tmp"; exit 1; }
chmod 600 "$tmp" "$f.bak" && mv "$tmp" "$f"`;
// Probar con los datos del formulario: $1 host, $2 usuario, $3 clave (MYSQL_PWD), $4 BBDD, $5 binario.
const PROBAR = 'MYSQL_PWD="$3" exec "$5" -B --connect-timeout=10 -h "$1" -u "$2" "$4" -e "SELECT 1"';

export const argvGuardar = (c, { fichero = "" } = {}) =>
  ["sh", ["-c", ESCRIBIR, "sh", fichero, c.nombre, c.host, c.usuario, c.clave ?? "", c.bbdd, "save"]];
export const argvBorrar = (nombre, { fichero = "" } = {}) =>
  ["sh", ["-c", ESCRIBIR, "sh", fichero, nombre, "", "", "", "", "del"]];
export const argvProbar = (c, { mysql = "/usr/bin/mysql" } = {}) =>
  ["sh", ["-c", PROBAR, "sh", c.host, c.usuario, c.clave ?? "", c.bbdd, mysql]];

// Error (texto) o null. Sin saltos de línea ni «#####» en nada; la clave solo sin saltos de línea.
export function validar(c) {
  for (const [k, et] of [["nombre", "Nombre"], ["host", "Host"], ["usuario", "Usuario"], ["bbdd", "BBDD"]]) {
    const v = c[k] ?? "";
    if (!v.trim()) return `${et} es obligatorio`;
    if (/[\r\n]/.test(v) || v.includes("#####")) return `${et} no puede tener saltos de línea ni #####`;
  }
  if (/[\r\n\0]/.test(c.clave ?? "")) return "La clave no puede tener saltos de línea";
  return null;
}

// Host, usuario y BBDD de una conexión para editarla (una por línea). La clave se queda en el shell: no se imprime.
const DETALLE = [
  'eval "$(awk -v s="##### $1 #####" \'$0==s{f=1;next} /^#####/{f=0} /^$/{f=0} f&&/^DB[A-Z]+=/{print}\' "${2:-$HOME/conexionesLocal}")"',
  "printf '%s\\n%s\\n%s\\n' \"$DBHOST\" \"$DBUSERNAME\" \"$DBNAME\"",
].join("\n");
export const argvDetalle = (nombre, { fichero = "" } = {}) => ["sh", ["-c", DETALLE, "sh", nombre, fichero]];
export const parseDetalle = (stdout) => { const [host = "", usuario = "", bbdd = ""] = (stdout ?? "").split("\n"); return { host, usuario, bbdd }; };
