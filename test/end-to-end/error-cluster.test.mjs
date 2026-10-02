// El cluster de error (DT-043), con lo medido en LabVIEW 2026 Q3
// (docs/reference/labview-errors.md): el tipo, Clear Errors, Merge Errors, el
// paso del error por una función y el manejo automático de errores.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { CAT } from "../helpers.mjs";

function vi(nodos, cables) {
  let g = Gr.nuevo();
  const id = {};
  for (const [nombre, bloque, config] of nodos) {
    const r = Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    id[nombre] = r.id;
  }
  for (const [de, a] of cables) {
    const [n1, p1] = [de.slice(0, de.lastIndexOf(".")), de.slice(de.lastIndexOf(".") + 1)];
    const [n2, p2] = [a.slice(0, a.lastIndexOf(".")), a.slice(a.lastIndexOf(".") + 1)];
    const r = Gr.conectar(g, CAT, { nodo: id[n1], puerto: p1, dir: "out" }, { nodo: id[n2], puerto: p2, dir: "in" });
    assert.ok(!r.motivo, `${de} → ${a}: ${r.motivo}`);
    g = r.g;
  }
  return { g, id };
}

async function correr({ g, id }, opciones = {}) {
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const nombre = Object.fromEntries(Object.entries(id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, {}, opciones);
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k], x]));
}

const err = (status, code, source) => ({ status, code, source });
const constante = (nombre, e) => [nombre, "error-cluster-constant", { value: e }];
const indicador = (nombre) => [nombre, "cluster-indicator", { type: ERROR }];

test("el cluster de error es status, code y source, y la constante llega igual", async () => {
  assert.deepEqual(ERROR.cluster.map((f) => [f.name, f.type]), [["status", "boolean"], ["code", "i32"], ["source", "string"]]);
  const v = vi([constante("k", err(true, 5000, "prueba")), indicador("r")], [["k.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: err(true, 5000, "prueba") });
});

// labview-errors.md §5, 87-clear-errors-resultado.png.
test("clear errors deja el error a cero", async () => {
  const v = vi([constante("k", err(true, 5000, "prueba")), ["c", "clear-errors"], indicador("r")], [["k.result", "c.error-in"], ["c.error-out", "r.value"]]);
  assert.deepEqual(await correr(v), { r: err(false, 0, "") });
});

// labview-errors.md §5, la tabla de Merge Errors (capturas 80 a 84).
test("merge errors: los errores antes que los avisos y, en cada clase, el primero de arriba", async () => {
  const caso = async (a, b) => {
    const v = vi([constante("a", a), constante("b", b), ["m", "merge-errors"], indicador("r")], [["a.result", "m.error-in-0"], ["b.result", "m.error-in-1"], ["m.error-out", "r.value"]]);
    return (await correr(v)).r;
  };
  assert.deepEqual(await caso(err(false, 100, "w1"), err(true, 200, "e2")), err(true, 200, "e2"), "gana el error aunque esté debajo");
  assert.deepEqual(await caso(err(true, 100, "w1"), err(true, 200, "e2")), err(true, 100, "w1"), "dos errores: el de arriba");
  assert.deepEqual(await caso(err(false, 100, "w1"), err(false, 200, "e2")), err(false, 100, "w1"), "dos avisos: el de arriba");
  assert.deepEqual(await caso(err(false, 0, "w1"), err(false, 200, "e2")), err(false, 200, "e2"), "un code 0 no cuenta como aviso");
  assert.deepEqual(await caso(err(false, 0, "w1"), err(false, 0, "e2")), err(false, 0, "w1"), "sin nada, la primera tal cual");
});

// labview-errors.md §3: con status TRUE una función no trabaja y pasa el mismo error.
test("una funcion con error a la entrada no trabaja y pasa el mismo error", async () => {
  const hacer = (entrada, code, aviso = false) =>
    vi(
      [constante("e", entrada), ["c", "const", { value: code }], ["w", "bool-const", { value: aviso }], ["m", "str-const", { value: "algo falló" }], ["f", "error-cluster-from-error-code"], indicador("r")],
      [["e.result", "f.error-in"], ["c.result", "f.code"], ["w.result", "f.is-warning"], ["m.result", "f.message"], ["f.error-out", "r.value"]],
    );
  assert.deepEqual((await correr(hacer(err(true, 5000, "prueba"), 7))).r, err(true, 5000, "prueba"), "con un error a la entrada, pasa ese");
  assert.deepEqual((await correr(hacer(err(false, 0, ""), 0))).r, err(false, 0, ""), "con código 0, no toca el error");
  assert.deepEqual((await correr(hacer(err(false, 0, ""), 7))).r, err(true, 7, "algo falló"), "un código: un error");
  assert.deepEqual((await correr(hacer(err(false, 0, ""), 7, true))).r, err(false, 7, "algo falló"), "con is warning?, un aviso");
});

// labview-errors.md §4: con «error out» sin cablear sale el diálogo y el VI espera.
test("manejo automatico de errores: el error out sin cablear para el vi y pregunta", async () => {
  const hacer = (cableado) =>
    vi(
      [["c", "const", { value: 7 }], ["f", "error-cluster-from-error-code"], ["k", "const", { value: 1 }], ["despues", "indicator"], ...(cableado ? [indicador("r")] : [])],
      [["c.result", "f.code"], ["k.result", "despues.value"], ...(cableado ? [["f.error-out", "r.value"]] : [])],
    );
  const vistos = [];
  const continuar = async (e) => (vistos.push(e), "continuar");
  await correr(hacer(false), { alErrorAutomatico: continuar });
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].code, 7);
  assert.equal(vistos[0].status, true);
  await assert.rejects(correr(hacer(false), { alErrorAutomatico: async () => "parar" }), (e) => e.abortado, "Stop aborta");
  await assert.rejects(correr(hacer(false)), /Error 7 occurred/, "sin nadie que conteste, el VI se para con el error");
  vistos.length = 0;
  await correr(hacer(true), { alErrorAutomatico: continuar });
  assert.equal(vistos.length, 0, "con error out cableado no hay diálogo");
  const sinAuto = hacer(false);
  sinAuto.g = { ...sinAuto.g, vi: { "automatic-error-handling": false } };
  await correr(sinAuto, { alErrorAutomatico: continuar });
  assert.equal(vistos.length, 0, "desactivado en VI Properties, tampoco");
});

// labview-errors.md §5: Simple Error Handler. Sin error no hay diálogo y `message` es «No Error»; con
// error sale su diálogo, que espera al usuario, y las salidas son las del error.
test("simple error handler: sin error no saca dialogo y con error espera al usuario", async () => {
  const hacer = (entrada, extra = []) =>
    vi(
      [constante("e", entrada), ["h", "simple-error-handler"], ["q", "bool-indicator"], ["c", "indicator", { type: "i32" }], ["s", "str-indicator"], indicador("o"), ["m", "str-indicator"], ...extra.map((x) => x[0]),],
      [["e.result", "h.error-in"], ["h.is-error", "q.value"], ["h.code-out", "c.value"], ["h.source-out", "s.value"], ["h.error-out", "o.value"], ["h.message", "m.value"]],
    );
  const vistos = [];
  const dialogo = async (e) => {
    await new Promise((ok) => setTimeout(ok, 5));
    vistos.push(e);
  };
  const sin = await correr(hacer(err(false, 0, "")), { alDialogoError: dialogo });
  assert.equal(vistos.length, 0, "sin error no hay diálogo");
  assert.deepEqual(sin, { q: false, c: 0, s: "", o: err(false, 0, ""), m: "No Error" });
  const con = await correr(hacer(err(true, 5000, "prueba")), { alDialogoError: dialogo });
  assert.equal(vistos.length, 1, "con error, un diálogo, y el VI esperó a que acabara");
  assert.deepEqual([vistos[0].status, vistos[0].code, vistos[0].source], [true, 5000, "prueba"]);
  assert.match(vistos[0].mensaje, /^Error 5000 occurred at prueba\n\nThis error code has no description/);
  assert.deepEqual([con.q, con.c, con.s, con.o], [true, 5000, "prueba", err(true, 5000, "prueba")]);
  assert.equal(con.m, vistos[0].mensaje, "message es el texto del diálogo");
  // Sin nadie que saque el diálogo —la línea de órdenes—, no se queda esperando.
  assert.equal((await correr(hacer(err(true, 7, "Read from Text File in X<APPEND>\nC:\\no.txt")))).m.split("\n")[0], "Error 7 occurred at Read from Text File in X");
  // Abort con el diálogo abierto no deja el VI colgado.
  const parar = new AbortController();
  const colgado = correr(hacer(err(true, 5000, "prueba")), { senal: parar.signal, alDialogoError: () => new Promise(() => {}) });
  setTimeout(() => parar.abort(), 10);
  await assert.rejects(colgado, (e) => e.abortado);
  // Un código a la entrada, sin error in, es un error con ese source.
  const porCodigo = vi(
    [["c", "const", { value: 7 }], ["t", "str-const", { value: "mi función" }], ["h", "simple-error-handler"], ["q", "bool-indicator"], ["s", "str-indicator"]],
    [["c.result", "h.error-code"], ["t.result", "h.error-source"], ["h.is-error", "q.value"], ["h.source-out", "s.value"]],
  );
  const r = await correr(porCodigo, { alDialogoError: dialogo });
  assert.deepEqual([r.q, r.s], [true, "mi función"]);
  assert.equal(vistos.at(-1).code, 7);
});

// DT-043 §5: los códigos son los de LabVIEW; los textos, nuestros. La estructura se calca de labview-errors.md §6.
test("los textos de los errores son nuestros y tienen la estructura de LabVIEW", async () => {
  const E = await import("../../core/runtime/error-codes.mjs");
  for (const code of [1, 2, 7, 8, 42, 43, 56, 63, 66]) assert.ok(E.razones(code)?.length, `el código ${code} está en la tabla`);
  assert.equal(E.razones(5000), null, "un código sin definir no tiene razones");
  assert.equal(E.hex(5000), "0x1388");
  assert.equal(E.cabecera(err(true, 7, "A in B")), "Error 7 occurred at A in B");
  assert.equal(E.cabecera(err(false, 7, "")), "Warning 7 occurred at an unidentified location");
  assert.deepEqual(E.partirSource("F in V<APPEND>\nC:\\x.txt"), { origen: "F in V", detalle: "C:\\x.txt" });
  const siete = E.explicar(err(true, 7, "Read in V<APPEND>\nC:\\x.txt"));
  assert.deepEqual([siete.titulo, siete.detalle], ["Possible reason(s):", "C:\\x.txt"]);
  assert.match(siete.razones[0], /^LabVIEW: \(Hex 0x7\) /);
  assert.equal(E.explicar(err(true, 2, "")).razones.length, 2, "el 2 tiene dos razones");
  assert.match(E.explicar(err(true, 2, "")).texto, /\n={26}\n/, "separadas por una línea de signos =");
  const indefinido = E.explicar(err(true, 5000, "prueba"));
  assert.equal(indefinido.titulo, null);
  assert.match(indefinido.razones[0], /\(5000\)/);
  assert.match(indefinido.razones[0], /0x00001388/, "en el código sin definir, el hexadecimal lleva 8 dígitos");
  assert.equal(E.mensaje(err(false, 0, "")), "No Error");
  // Nada de los textos de NI: ninguna razón repite su redacción.
  for (const code of Object.keys(E.CODIGOS)) for (const t of E.CODIGOS[code]) assert.doesNotMatch(t, /File not found\. The file might be/);
});

// labview-errors.md §5: Search and Replace String lleva error in y error out; con un error a la entrada no trabaja.
test("search and replace string lleva error in y error out y pasa el error", async () => {
  const hacer = (entrada) =>
    vi(
      [constante("e", entrada), ["a", "str-const", { value: "abc" }], ["b", "str-const", { value: "b" }], ["c", "str-const", { value: "X" }], ["f", "search-and-replace-string"], ["r", "str-indicator"], indicador("o")],
      [["e.result", "f.error-in"], ["a.result", "f.input-string"], ["b.result", "f.search-string"], ["c.result", "f.replace-string"], ["f.result-string", "r.value"], ["f.error-out", "o.value"]],
    );
  assert.deepEqual(await correr(hacer(err(false, 0, ""))), { r: "aXc", o: err(false, 0, "") });
  assert.deepEqual(await correr(hacer(err(true, 5000, "prueba"))), { r: "", o: err(true, 5000, "prueba") }, "con un error a la entrada, no trabaja");
  assert.deepEqual(await correr(hacer(err(false, 5000, "aviso"))), { r: "aXc", o: err(false, 5000, "aviso") }, "con un aviso, trabaja y lo pasa");
});

// DT-043 §1 y labview-errors.md §1: el cable de error, el terminal y la constante.
test("el cable de error es amarillo con trazos negros y borde oliva, la constante de error se edita y los dos diálogos salen calcados", async () => {
  const D = await import("../../editor/src/block-diagram/diagram-view.mjs");
  const ED = await import("../../editor/src/block-diagram/diagram-editing.mjs");
  const V = await import("../../editor/src/window/window-view.mjs");
  const { INV } = await import("../helpers.mjs");
  const ctx = D.contexto(CAT, D.glifosPorBloque(INV), ".");
  const v = vi([constante("k", err(false, 0, "")), clusterIndicador()], [["k.result", "r.value"]]);
  let d = { ...ED.inicial(), g: v.g };
  const html = D.contenido(d, ctx, (await import("../../core/model/graph.mjs")).tipos(d.g, CAT));
  assert.match(html, /stroke="#7f7f00" stroke-width="3"/, "3 px, borde oliva");
  assert.match(html, /stroke="#ffff00"[^>]*stroke-dasharray="2 2"/);
  assert.match(html, /stroke="#000"[^>]*stroke-dasharray="2 2" stroke-dashoffset="-2"/);
  // La constante: 22 × 57 px, con sus tres celdas.
  const k = d.g.nodos.find((n) => n.tipo === "error-cluster-constant");
  const caja = D.caja(k, ctx);
  assert.deepEqual([caja.ancho, caja.alto], [22, 57]);
  assert.match(html, /data-campo="status"[^>]*>F</);
  // Un clic en el status la alterna; con doble clic en code y en source se escribe.
  d = ED.pulsar(d, ctx, { tipo: "nodo", id: k.id, campo: "status" }, { x: 5, y: 5 });
  d = ED.soltar(d, ctx, { tipo: "nodo", id: k.id }, { x: 5, y: 5 });
  assert.equal(d.g.nodos.find((n) => n.id === k.id).config.value.status, true);
  d = ED.editar(d, ctx, k.id, "code");
  for (const t of ["4", "2"]) d = ED.teclear(d, t);
  d = ED.confirmar(d, ctx);
  assert.equal(d.g.nodos.find((n) => n.id === k.id).config.value.code, 42, "el code escrito, sin el 0 de antes: todo seleccionado");
  d = ED.editar(d, ctx, k.id, "source");
  for (const t of ["h", "Enter", "i"]) d = ED.teclear(d, t);
  assert.equal(d.edicion.cadena, true);
  d = ED.confirmar(d, ctx);
  assert.deepEqual(d.g.nodos.find((n) => n.id === k.id).config.value, { status: true, code: 42, source: "h\ni" });
  assert.equal(ED.editar(d, ctx, k.id, "status"), d, "el status no se escribe: se alterna");
  // El diálogo del manejo automático: icono, cabecera en negrita, razones, Continue y Stop.
  const auto = V.dialogoError({ id: 1, pregunta: "error-automatico", status: true, code: 7, source: "Leer in VI<APPEND>\nC:\\x.txt" });
  assert.match(auto, /<strong>Error 7 occurred at Leer in VI<\/strong>/);
  assert.match(auto, /<strong>Possible reason\(s\):<\/strong>/);
  assert.match(auto, /C:\\x\.txt/);
  assert.match(auto, /data-boton="continuar"[^>]*>Continue</);
  assert.match(auto, /data-boton="parar"[^>]*>Stop</);
  assert.match(auto, /dialogo-icono-error/);
  // El de Simple Error Handler: sin icono ni negritas, con OK; «Why not found?» sólo en un código sin definir.
  const simple = V.dialogoError({ id: 2, pregunta: "dialogo-error", status: true, code: 5000, source: "prueba" });
  assert.doesNotMatch(simple, /dialogo-icono-error|<strong>/);
  assert.match(simple, /Error 5000 occurred at prueba/);
  assert.match(simple, /data-boton="ok"[^>]*>OK</);
  assert.match(simple, /Why not found\?/);
  assert.doesNotMatch(V.dialogoError({ id: 3, pregunta: "dialogo-error", status: true, code: 7, source: "x" }), /Why not found/);
});

/** Un indicador de cluster de error con la etiqueta que usan estos tests. */
function clusterIndicador() {
  return ["r", "cluster-indicator", { type: ERROR }];
}

// errores/71.png: Merge Errors mide 32 × 18 px con dos entradas y crece de 9 en 9 hacia abajo; cada
// elemento de Dialog & User Interface y de Data Containers tiene su glifo, el de una carpeta si lo es.
test("merge errors mide lo que en labview y cada elemento de las paletas de error tiene su dibujo", async () => {
  const D = await import("../../editor/src/block-diagram/diagram-view.mjs");
  const G = await import("../../editor/src/common/glyphs.mjs");
  const { INV } = await import("../helpers.mjs");
  const ctx = D.contexto(CAT, D.glifosPorBloque(INV), ".");
  let g = Gr.nuevo();
  const r = Gr.crearNodo(g, CAT, "merge-errors", 0, 0);
  const medida = (g_, id) => {
    const c = D.caja(g_.nodos.find((n) => n.id === id), ctx);
    return [c.ancho, c.alto];
  };
  assert.deepEqual(medida(r.g, r.id), [32, 18]);
  assert.deepEqual(medida(Gr.fijarConfig(r.g, r.id, { inputs: 4 }), r.id), [32, 36]);
  assert.deepEqual(CAT.puertos(Gr.fijarConfig(r.g, r.id, { inputs: 3 }).nodos[0]).in.map((p) => p.label), ["error in 0", "error in 1", "error in 2"]);
  for (const e of INV.hijos("palette.functions.programming.dialog-and-user-interface").filter((x) => !x.id.endsWith(".thumbtack"))) {
    const id = e.id.slice(e.id.lastIndexOf(".") + 1);
    assert.ok(["multiple-errors", "events", "menu", "cursor", "help"].includes(id) ? G.SUBPALETAS[id] : G.FUNCIONES[id] && G.CAJAS[id], `${e.id}: sin dibujo`);
  }
  for (const e of INV.hijos("palette.controls.modern.data-containers").filter((x) => !x.id.endsWith(".thumbtack"))) assert.ok(G.CONTROLES[e.id.slice(e.id.lastIndexOf(".") + 1)], `${e.id}: sin dibujo`);
});
