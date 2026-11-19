// Explorador de BBDD: elige una conexión de ~/conexionesLocal (secciones «##### NOMBRE #####»), ve sus tablas,
// escribe SQL y mira el resultado. Lecturas sin preguntar; cualquier otra sentencia pide confirmación.
// La clave la lee solo el script de shell de logica.js al ejecutar (MYSQL_PWD): este fichero nunca la ve.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { exec, theme, checking, shared, setShared, openOverlay, closeOverlay, props } from "herdr";
import { argvConexiones, argvMysql, argvGuardar, argvBorrar, argvProbar, argvDetalle, parseDetalle, validar, parseNombres, parseTablas, parseSalida, clasificar, filtrarTablas, selectTabla, MAX_FILAS } from "./logica.js";

const ROJO = "#ef5350";
const celda = (v) => (v == null ? "NULL" : String(v));

export default class DbExplorer extends View {
  init(_props, cx) {
    this.conexiones = [];
    this.modal = props()?.modal === "conexiones";
    if (this.modal) return this.initModal(cx);
    this.conn = null;
    this.tablas = [];
    this.q = "";
    this.res = null;      // { cols, filas, total } | { texto, error }
    this.pend = null;     // { conn, sql, c }: sentencia esperando confirmación
    this.corriendo = false;
    this.filtro = InputState.new({ placeholder: "Filtrar tablas" });
    this.filtro.on("change", (_e, cx2) => { this.q = this.filtro.value(); cx2.notify(); });
    this.editor = TextareaState.new({ placeholder: "SQL (ctrl-enter ejecuta)" });
    this.editor.set_auto_grow(3, 10);
    this.editor.on("submit", (_e, cx2) => this.ejecutar(cx2));
    if (checking()) return;
    this.ver = shared("dbx.ver");
    this.recargar(cx);
    // El modal (otra vista) avisa con shared("dbx.ver") al guardar/borrar: el panel relee la lista.
    cx.timer.every(1000, (cx2) => { const v = shared("dbx.ver"); if (v !== this.ver) { this.ver = v; this.recargar(cx2); } });
  }

  recargar(cx) {
    cx.spawn(async (cx2) => {
      try { const [c, a] = argvConexiones(); this.conexiones = parseNombres((await exec(c, a)).stdout); }
      catch { this.res = { texto: "No se pudo leer ~/conexionesLocal", error: true }; }
      cx2.notify();
    });
  }

  // --- Modal de conexiones (overlay) ---
  initModal(cx) {
    this.sel = null;          // nombre de la conexión en edición, null = nueva
    this.msg = null;          // { texto, error }
    this.confirmar = false;
    this.ocupado = false;
    const campo = (placeholder) => { const i = InputState.new({ placeholder }); i.on("change", (_e, cx2) => cx2.notify()); return i; };
    this.f = { nombre: campo("Nombre"), host: campo("Host"), usuario: campo("Usuario"), clave: campo("Clave"), bbdd: campo("BBDD") };
    this.f.clave.set_masked(true);
    if (checking()) return;
    this.recargar(cx);
  }

  datos() { const g = (k) => this.f[k].value(); return { nombre: g("nombre").trim(), host: g("host").trim(), usuario: g("usuario").trim(), clave: g("clave"), bbdd: g("bbdd").trim() }; }

  elegir(nombre, cx) {
    this.sel = nombre; this.msg = null; this.confirmar = false;
    for (const k of Object.keys(this.f)) this.f[k].set_value("");
    if (nombre) {
      this.f.nombre.set_value(nombre);
      cx.spawn(async (cx2) => {
        try {
          const [c, a] = argvDetalle(nombre);
          const d = parseDetalle((await exec(c, a)).stdout);
          if (this.sel === nombre) { this.f.host.set_value(d.host); this.f.usuario.set_value(d.usuario); this.f.bbdd.set_value(d.bbdd); }
        } catch { this.msg = { texto: "No se pudo leer la conexión", error: true }; }
        cx2.notify();
      });
    }
    cx.notify();
  }

  // Ejecuta un argv de logica.js; al terminar bien avisa al panel y relee la lista.
  escribir(argv, ok, cx, nuevoSel) {
    this.ocupado = true; this.msg = null; cx.notify();
    cx.spawn(async (cx2) => {
      try {
        const r = await exec(argv[0], argv[1], { timeout: 20000 });
        if (r.code !== 0) this.msg = { texto: "No se pudo escribir ~/conexionesLocal", error: true };
        else {
          this.msg = { texto: ok };
          setShared("dbx.ver", Date.now());
          this.recargar(cx2);
          if (nuevoSel !== undefined) this.sel = nuevoSel;
          if (nuevoSel === null) for (const k of Object.keys(this.f)) this.f[k].set_value("");
        }
      } catch { this.msg = { texto: "No se pudo escribir ~/conexionesLocal", error: true }; }
      this.ocupado = false; cx2.notify();
    });
  }

  guardar(cx) {
    const d = this.datos();
    const err = validar(d);
    if (err) { this.msg = { texto: err, error: true }; cx.notify(); return; }
    this.escribir(argvGuardar(d), `Guardada «${d.nombre}»`, cx, d.nombre);
  }

  borrar(cx) {
    const n = this.sel; this.confirmar = false;
    if (n) this.escribir(argvBorrar(n), `Borrada «${n}»`, cx, null);
  }

  probar(cx) {
    const d = this.datos();
    // Existente con clave vacía: se prueba la guardada (la clave no se lee desde JS).
    const usaGuardada = !d.clave && this.sel;
    if (!usaGuardada) { const err = validar(d); if (err) { this.msg = { texto: err, error: true }; cx.notify(); return; } }
    this.ocupado = true; this.msg = { texto: "Probando…" }; cx.notify();
    cx.spawn(async (cx2) => {
      try {
        const [c, a] = usaGuardada ? argvMysql(this.sel, "SELECT 1") : argvProbar(d);
        const r = await exec(c, a, { timeout: 30000 });
        this.msg = r.code === 0 ? { texto: usaGuardada ? "Conexión OK (con los datos guardados)" : "Conexión OK" } : { texto: (r.stderr || `mysql terminó con código ${r.code}`).trim().slice(0, 300), error: true };
      } catch (e) { this.msg = { texto: String(e?.message ?? e).slice(0, 200), error: true }; }
      this.ocupado = false; cx2.notify();
    });
  }

  renderModal() {
    const t = theme();
    const boton = (id, txt, accion, color) => div().id(id).flex_none().h(28).px(12).flex().items_center().rounded(6).cursor_pointer()
      .text_size(12).bg(color ?? t.raised).text_color(color ? "#fff" : t.foreground).hover((s) => s.opacity(0.85)).on_click((_e, cx) => { if (!this.ocupado) accion(cx); }).child(txt);
    const item = (id, txt, on, accion) => div().id(id).flex_none().h(26).px(8).flex().items_center().truncate().rounded(6).cursor_pointer().text_size(12)
      .bg(on ? t.selected : t.background).hover((s) => s.bg(t.hover)).on_click((_e, cx) => accion(cx)).child(txt);
    const fila = (et, k) => v_flex().flex_none().gap(2).child(div().text_size(11).text_color(t.muted).child(et))
      .child(Input.new(this.f[k]).h(28).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12));

    const lista = v_flex().id("dbx-m-lista").flex_none().w(190).h_full().gap(2).overflow_y_scrollbar().pr(8).border_r_1().border_color(t.border)
      .child(item("dbx-m-nueva", "+ Nueva", this.sel === null, (cx) => this.elegir(null, cx)))
      .children(this.conexiones.map((n) => item(`dbx-m-${n}`, n, n === this.sel, (cx) => this.elegir(n, cx))));

    const form = v_flex().flex_1().min_w(0).gap(8).pl(12)
      .child(div().font_semibold().child(this.sel ? `Editar «${this.sel}»` : "Nueva conexión"))
      .child(fila("Nombre", "nombre")).child(fila("Host", "host")).child(fila("Usuario", "usuario"))
      .child(fila(this.sel ? "Clave (vacía = conservar la actual)" : "Clave", "clave")).child(fila("BBDD", "bbdd"))
      .when(this.msg, (el) => el.child(div().text_size(11.5).text_color(this.msg.error ? ROJO : t.muted).child(this.msg.texto)))
      .child(this.confirmar
        ? h_flex().gap(6).items_center().child(div().text_color(ROJO).child(`¿Borrar «${this.sel}»?`))
          .child(boton("dbx-m-si", "Sí, borrar", (cx) => this.borrar(cx), ROJO)).child(boton("dbx-m-no", "No", (cx) => { this.confirmar = false; cx.notify(); }))
        : h_flex().gap(6).child(boton("dbx-m-probar", "Probar", (cx) => this.probar(cx)))
          .child(boton("dbx-m-guardar", "Guardar", (cx) => this.guardar(cx)))
          .child(boton("dbx-m-borrar", "Borrar", (cx) => { if (this.sel) this.confirmar = true; else this.msg = { texto: "Elige primero una conexión de la lista", error: true }; cx.notify(); }, ROJO))
          .child(boton("dbx-m-cerrar", "Cerrar", () => closeOverlay(props()?.overlay))));

    return v_flex().id("dbx-modal").size_full().min_h(0).p(12).text_size(12.5).text_color(t.foreground).bg(t.background)
      .child(h_flex().flex_1().min_h(0).child(lista).child(form));
  }

  conectar(nombre, cx) {
    this.conn = nombre; this.tablas = []; this.res = null; this.pend = null;
    cx.spawn(async (cx2) => {
      const r = await this.sql(nombre, "SHOW TABLES");
      if (this.conn === nombre) { if (r.error) this.res = r; else this.tablas = parseTablas(r.stdout); }
      cx2.notify();
    });
    cx.notify();
  }

  // Ejecuta con mysql; devuelve {stdout} o {texto, error}. Nunca incluye la clave (no pasa por aquí).
  async sql(conn, sql) {
    try {
      const [c, a] = argvMysql(conn, sql);
      const r = await exec(c, a, { timeout: 60000 });
      if (r.code !== 0) return { texto: (r.stderr || `mysql terminó con código ${r.code}`).trim().slice(0, 600), error: true };
      return { stdout: r.stdout };
    } catch (e) { return { texto: String(e?.message ?? e).slice(0, 300), error: true }; }
  }

  ejecutar(cx) {
    if (!this.conn || this.corriendo || this.pend) return;
    const sql = this.editor.value();
    const c = clasificar(sql);
    if (!c.sentencias.length) return;
    if (!c.lectura) { this.pend = { conn: this.conn, sql, c }; cx.notify(); return; }
    this.lanzar(this.conn, sql, cx);
  }

  lanzar(conn, sql, cx) {
    this.corriendo = true; this.pend = null; cx.notify();
    cx.spawn(async (cx2) => {
      const r = await this.sql(conn, sql);
      this.res = r.error ? r : (r.stdout.trim() ? parseSalida(r.stdout) : { texto: "OK (sin filas)" });
      this.corriendo = false;
      cx2.notify();
    });
  }

  render() {
    if (this.modal) return this.renderModal();
    const t = theme();
    const boton = (id, txt, accion, color) => div().id(id).flex_none().h(26).px(10).flex().items_center().rounded(6).cursor_pointer()
      .text_size(12).bg(color ?? t.raised).text_color(color ? "#fff" : t.foreground).hover((s) => s.opacity(0.85)).on_click((_e, cx) => accion(cx)).child(txt);
    const raiz = v_flex().id("dbx").size_full().min_h(0).p(10).gap(8).text_size(12.5).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.key === "enter" && e.modifiers.control) { this.ejecutar(cx); cx.stop_propagation(); } });

    // Conexiones
    raiz.child(h_flex().flex_none().items_start().gap(4)
      .child(div().id("dbx-cfg").flex_none().h(24).w(24).flex().items_center().justify_center().rounded(6).cursor_pointer().text_size(14).bg(t.raised).hover((s) => s.bg(t.hover))
        .on_click(() => openOverlay({ mod: "mi-db-explorer", kind: "dialog", width: 760, height: 460, props: { modal: "conexiones" } })).child("⚙"))
      .child(h_flex().flex_1().min_w(0).flex_wrap().gap(4).children(this.conexiones.length ? this.conexiones.map((n) => {
      const on = n === this.conn;
      return div().id(`dbx-c-${n}`).flex_none().h(24).px(8).flex().items_center().rounded(6).cursor_pointer().text_size(12)
        .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.conectar(n, cx)).child(n);
    }) : [div().text_color(t.dim).child("Sin conexiones en ~/conexionesLocal")])));

    if (this.conn) {
      // Tablas
      const ts = filtrarTablas(this.tablas, this.q);
      raiz.child(Input.new(this.filtro).flex_none().h(28).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12));
      raiz.child(v_flex().id("dbx-tablas").flex_none().h(110).overflow_y_scrollbar().rounded(6).border_1().border_color(t.border)
        .children(ts.slice(0, 500).map((n) => div().id(`dbx-t-${n}`).flex_none().h(22).px(8).flex().items_center().truncate().cursor_pointer().text_size(12)
          .hover((s) => s.bg(t.hover)).on_click(() => this.editor.set_value(selectTabla(n))).child(n))));
      // Editor
      raiz.child(Textarea.new(this.editor).flex_none().px(8).py(6).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12.5));
    }

    // Confirmación o botón
    if (this.pend) {
      const p = this.pend;
      const sinWhere = p.c.sentencias.some((s) => s.sinWhere);
      raiz.child(v_flex().flex_none().gap(6).p(8).rounded(6).border_1().border_color(sinWhere ? ROJO : t.border).bg(t.raised)
        .child(div().font_semibold().child(`Se va a escribir en ${p.conn}`))
        .when(sinWhere, (el) => el.child(div().text_color(ROJO).font_semibold().child("UPDATE/DELETE sin WHERE: afecta a todas las filas.")))
        .child(div().max_h(110).overflow_hidden().text_size(11.5).text_color(t.muted).child(p.sql))
        .child(h_flex().gap(6)
          .child(boton("dbx-ok", "Ejecutar", (cx) => this.lanzar(p.conn, p.sql, cx), ROJO))
          .child(boton("dbx-no", "Cancelar", (cx) => { this.pend = null; cx.notify(); }))));
    } else if (this.conn) {
      raiz.child(h_flex().flex_none().gap(8).items_center()
        .child(boton("dbx-run", this.corriendo ? "Ejecutando…" : "Ejecutar", (cx) => this.ejecutar(cx)))
        .child(div().text_size(11).text_color(t.dim).child("ctrl-enter")));
    }

    // Resultado
    const r = this.res;
    if (r?.texto != null) {
      raiz.child(div().id("dbx-texto").flex_1().min_h(0).overflow_y_scrollbar().px(8).py(6).rounded(6).bg(t.raised).text_color(r.error ? ROJO : t.foreground).child(r.texto));
    } else if (r) {
      const filas = r.filas;
      const ancho = (i) => Math.min(240, Math.max(60, 14 + 7.4 * Math.max(r.cols[i].length, ...filas.slice(0, 50).map((f) => celda(f[i]).length))));
      const fila = (f, i, cab) => h_flex().flex_none().h(26).items_center().px(8).gap(12).bg(cab ? t.raised : i % 2 ? "#20233a" : "#1b1d2b")
        .children(r.cols.map((c, j) => div().flex_none().w(ancho(j)).truncate().text_color(cab ? t.muted : celda(f[j]) === "NULL" ? t.dim : t.foreground).child(cab ? c : celda(f[j]))));
      raiz.child(div().id("dbx-tabla-x").flex_1().min_h(0).overflow_x_scrollbar().rounded(6).border_1().border_color(t.border)
        .child(v_flex().id("dbx-tabla").h_full().overflow_y_scrollbar().child(fila(null, 0, true)).children(filas.map((f, i) => fila(f, i, false)))));
      raiz.child(div().flex_none().text_size(11).text_color(t.dim).child(`${r.total} filas${r.total > MAX_FILAS ? ` (se muestran ${MAX_FILAS})` : ""}`));
    }
    return raiz;
  }
}
