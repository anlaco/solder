// Saving and opening a VI (core/model/qvi-format.mjs): what is saved opens the
// same. The VI is built with the same operations the editor uses, written, read
// back, and both the text and what gets drawn are checked to be the same.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import { ErrorQvi, aTexto, escribir, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { CAT, INV, leer as leerJson } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validar = ajv.compile(leerJson("docs/schema/qvi.schema.json"));
const errores = () => (validar.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("\n");

/** Un VI con todo lo que el editor sabe poner hoy. */
function viCompleto() {
  let g = Gr.nuevo();
  const poner = (tipo, x, y, config) => {
    const r = Gr.crearNodo(g, CAT, tipo, x, y);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    return r.id;
  };
  // Un control y un indicador, con sus etiquetas; la del indicador, movida en los dos lienzos.
  let r = Gr.crearEnPanel(g, CAT, "control", 60, 80, "Numeric");
  g = r.g;
  const control = r.id;
  r = Gr.crearEnPanel(g, CAT, "indicator", 400, 80, "Numeric");
  g = r.g;
  const indicador = r.id;
  g = Gr.fijarEtiqueta(g, indicador, "Resultado\nen voltios");
  g = Gr.fijarSitioEtiqueta(g, indicador, "panel", 12, -40);
  g = Gr.fijarSitioEtiqueta(g, indicador, "diagrama", 45, 3);
  g = Gr.alternarIcono(g, control);
  // Representation: el control es U8 y el indicador, I16.
  g = Gr.fijarRepresentacion(Gr.fijarRepresentacion(g, control, "u8"), indicador, "i16");
  // Constantes de los tres tipos y funciones de Numeric y Boolean.
  const i32 = poner("num-const", 40, 200, { value: 7, type: "i32" });
  const dbl = poner("const", 40, 260, { value: 2.5 });
  const add = poner("add", 200, 90);
  const ca = poner("compound-arithmetic", 200, 220, { mode: "multiply", inputs: 3, inverted: ["value-1"] });
  const verdad = poner("bool-const", 40, 330, { value: true });
  const y = poner("and-op", 200, 330);
  // Comparison: In Range and Coerce con sus extremos cambiados y Greater? con una coerción.
  const rango = poner("in-range-and-coerce", 400, 330, { "include-upper-limit": true, "include-lower-limit": false });
  const mayor = poner("greater", 400, 400);
  g = Gr.alternarTerminales(g, add);
  // Cables, uno con los codos movidos.
  const cablear = (de, pde, a, pa, codos) => (g = Gr.conectar(g, CAT, { nodo: de, puerto: pde, dir: "out" }, { nodo: a, puerto: pa, dir: "in" }, codos).g);
  cablear(control, "result", add, "a");
  cablear(i32, "result", add, "b", [150, 140, 190]);
  cablear(add, "result", indicador, "value");
  cablear(dbl, "result", ca, "value-0");
  cablear(verdad, "result", y, "x");
  cablear(dbl, "result", mayor, "x");
  cablear(i32, "result", mayor, "y");
  void rango;
  // Una rama del cable de la constante DBL, con su punto de unión.
  cablear(dbl, "result", ca, "value-2", [120, 240, 188]);
  g = Gr.fijarUnion(g, g.cables.at(-1).id, [120, 266]);
  return g;
}

/** Lo que se dibuja, con los ids cambiados por su orden: al abrir, los ids se numeran de nuevo. */
function dibujo(g) {
  const ids = new Map([...g.nodos.map((n, i) => [n.id, `N${i}`]), ...g.cables.map((c, i) => [c.id, `C${i}`])]);
  const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT)) + P.contenido({ ...P.inicial(g) }, CTX);
  return html.replace(/(data-(?:nodo|cable|etiqueta)=")([^"]+)"/g, (_, a, id) => `${a}${ids.get(id) ?? id}"`).replace(/recorte-[^")]+/g, "recorte");
}

test("un vi guardado cumple el esquema del qvi", () => {
  const vi = escribir(viCompleto(), CAT);
  assert.ok(validar(vi), errores());
  // El programa y la presentación, separados.
  assert.deepEqual(vi["front-panel"].map((i) => [i.name, i.role]), [["control_1", "control"], ["indicator_1", "indicator"]]);
  assert.deepEqual(vi["front-panel"].map((i) => i.type), ["u8", "i16"], "la representación del panel va en el fichero");
  assert.equal(vi.layout.panel.indicator_1.label.text, "Resultado\nen voltios");
  assert.deepEqual(vi.layout.wires["add_1.b"].bends, [150, 140, 190]);
  assert.equal(vi.layout.diagram.control_1["view-as-icon"], false);
  assert.deepEqual(vi["block-diagram"].nodes.find((n) => n.name === "num-const_1").config, { default: 7, type: "i32" });
  // Los extremos de In Range and Coerce van en el fichero y vuelven.
  const enRango = vi["block-diagram"].nodes.find((n) => n.name === "in-range-and-coerce_1");
  assert.deepEqual(enRango.config, { "include-upper-limit": true, "include-lower-limit": false });
  assert.deepEqual(leer(aTexto(viCompleto(), CAT), CAT).nodos.find((n) => n.tipo === "in-range-and-coerce").config, { "include-upper-limit": true, "include-lower-limit": false });
});

test("lo que se guarda se abre igual", () => {
  const g = viCompleto();
  const texto = aTexto(g, CAT);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto, "guardar lo abierto da el mismo fichero");
  assert.equal(dibujo(abierto), dibujo(g), "y se dibuja igual en el panel y en el diagrama");
  assert.deepEqual(Gr.tipos(abierto, CAT).cables.size, g.cables.length);
  // Se puede seguir editando: los ids nuevos no chocan con los que hay.
  const mas = Gr.crearNodo(abierto, CAT, "add", 0, 0);
  assert.equal(new Set(mas.g.nodos.map((n) => n.id)).size, mas.g.nodos.length);
});

test("un vi vacío se guarda y se abre", () => {
  const texto = aTexto(Gr.nuevo(), CAT);
  assert.ok(validar(JSON.parse(texto)), errores());
  assert.deepEqual(leer(texto, CAT).nodos, []);
});

test("lo que no se sabe leer se rechaza con el motivo", () => {
  assert.throws(() => leer({ solder: 2, "block-diagram": {} }, CAT), ErrorQvi);
  assert.throws(() => leer({ solder: 1, "block-diagram": { nodes: [{ name: "a", type: "no-existe" }] } }, CAT), /no está en el catálogo/);
  assert.throws(() => leer({ solder: 1, "block-diagram": { structures: [{ name: "s", kind: "timed-loop" }] } }, CAT), /todavía no se sabe leer/);
  const malCable = { solder: 1, "block-diagram": { nodes: [{ name: "s", type: "add" }], wires: [{ from: "s.result", to: "s.nada" }] } };
  assert.throws(() => leer(malCable, CAT), /no tiene el puerto de entrada «nada»/);
});

// Un control booleano guarda en el panel su clase (`style`), su acción
// mecánica y su valor, que forman parte del programa; el indicador, su clase.
test("los controles e indicadores booleanos se guardan con su clase y su acción mecánica y se abren igual", () => {
  let g = Gr.nuevo();
  let r = Gr.crearEnPanel(g, CAT, "bool-control", 60, 300, "stop", { style: "stop-button", mechanical: "latch-when-released" });
  g = Gr.fijarValor(r.g, r.id, true);
  const control = r.id;
  r = Gr.crearEnPanel(g, CAT, "bool-indicator", 400, 300, "Boolean", { style: "square-led" });
  g = r.g;
  const led = r.id;
  r = Gr.crearEnPanel(g, CAT, "bool-control", 60, 380, "Boolean");
  g = r.g;
  const no = Gr.crearNodo(g, CAT, "not-op", 200, 300);
  g = no.g;
  g = Gr.conectar(g, CAT, { nodo: control, puerto: "result", dir: "out" }, { nodo: no.id, puerto: "x", dir: "in" }).g;
  g = Gr.conectar(g, CAT, { nodo: no.id, puerto: "result", dir: "out" }, { nodo: led, puerto: "value", dir: "in" }).g;

  const vi = escribir(g, CAT);
  assert.ok(validar(vi), errores());
  assert.deepEqual(vi["front-panel"].map((i) => [i.role, i.type, i.style, i["mechanical-action"], i.default]), [
    ["control", "boolean", "stop-button", "latch-when-released", true],
    ["indicator", "boolean", "square-led", undefined, false],
    ["control", "boolean", "push-button", "switch-when-pressed", false],
  ]);
  const texto = aTexto(g, CAT);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto, "guardar lo abierto da el mismo fichero");
  assert.equal(dibujo(abierto), dibujo(g), "y se dibuja igual en el panel y en el diagrama");
  assert.deepEqual(abierto.nodos.map((n) => n.config), g.nodos.map((n) => n.config), "con la misma configuración");
  assert.ok(Gr.ejecutable(abierto, CAT, Gr.tipos(abierto, CAT)));
});

// M3: las cadenas se guardan y se abren. Una constante de varias líneas, un control y un
// indicador de cadena con su valor, Concatenate Strings con tres entradas y funciones de
// String con sus entradas sin cablear (que valen su valor por defecto).
test("un vi de cadenas se guarda, se abre igual y se ejecuta", async () => {
  let g = Gr.nuevo();
  const poner = (tipo, x, y, config) => {
    const r = Gr.crearNodo(g, CAT, tipo, x, y);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    return r.id;
  };
  let r = Gr.crearEnPanel(g, CAT, "str-control", 60, 60, "String");
  g = Gr.fijarValor(r.g, r.id, "uno\ndos");
  const control = r.id;
  r = Gr.crearEnPanel(g, CAT, "str-indicator", 400, 60, "String");
  g = r.g;
  const indicador = r.id;
  const k = poner("str-const", 40, 200, { value: "línea 1\nlínea 2" });
  const fija = poner("tab-constant", 40, 260);
  let cs = poner("concatenate-strings", 200, 100, { inputs: 3 });
  const sub = poner("string-subset", 200, 300, { });
  const cablear = (de, pde, a, pa) => (g = Gr.conectar(g, CAT, { nodo: de, puerto: pde, dir: "out" }, { nodo: a, puerto: pa, dir: "in" }).g);
  cablear(control, "result", cs, "string-0");
  cablear(k, "result", cs, "string-1");
  cablear(fija, "result", cs, "string-2");
  cablear(cs, "concatenated-string", indicador, "value");
  cablear(k, "result", sub, "string");
  const vi = escribir(g, CAT);
  assert.ok(validar(vi), errores());
  assert.deepEqual(vi["front-panel"].map((i) => [i.name, i.role, i.type]), [["str-control_1", "control", "string"], ["str-indicator_1", "indicator", "string"]]);
  assert.equal(vi["block-diagram"].nodes.find((n) => n.name === "str-const_1").config.default, "línea 1\nlínea 2", "la constante, con su salto de línea");
  assert.equal(vi["block-diagram"].nodes.find((n) => n.name === "concatenate-strings_1").config.inputs, 3);
  const texto = aTexto(g, CAT);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto, "guardar lo abierto da el mismo fichero");
  assert.equal(dibujo(abierto), dibujo(g), "y se dibuja igual en el panel y en el diagrama");
  assert.equal(abierto.nodos.find((n) => n.tipo === "str-control").config.value, "uno\ndos", "el valor del control vuelve");
  assert.equal(abierto.nodos.find((n) => n.tipo === "str-const").config.value, "línea 1\nlínea 2");
  // Lo abierto compila y corre: el control da lo escrito en el panel.
  const { compilar } = await import("../../core/compiler/compiler.mjs");
  const { ejecutar } = await import("../../core/runtime/runtime.mjs");
  const c = compilar(abierto, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const idControl = abierto.nodos.find((n) => n.tipo === "str-control").id;
  const idIndicador = abierto.nodos.find((n) => n.tipo === "str-indicator").id;
  const escritos = await ejecutar(c, { [idControl]: "uno\ndos" });
  assert.equal(escritos[idIndicador], "uno\ndoslínea 1\nlínea 2\t");
});

// M6: un For con un array de constante, un túnel indexado, un control y un indicador de array con su índice y
// sus elementos visibles: se guarda, se abre igual (también `indexado`, `visibles` e `indice`) y se ejecuta.
test("un vi de arrays se guarda, se abre igual y se ejecuta", async () => {
  let g = Gr.nuevo();
  let r = Gr.crearEnPanel(g, CAT, "arr-control", 60, 60, "Array", { type: { array: "number" }, value: [] });
  g = Gr.fijarConfig(Gr.fijarValor(r.g, r.id, [1, 2, 3]), r.id, { visibles: 3, indice: 1 });
  const control = r.id;
  r = Gr.crearEnPanel(g, CAT, "arr-indicator", 400, 60, "Array", { type: { array: "number" }, value: [] });
  g = r.g;
  const indicador = r.id;
  r = Gr.crearNodo(g, CAT, "sort-1d-array", 200, 100);
  g = r.g;
  const orden = r.id;
  r = Gr.crearNodo(g, CAT, "arr-const", 40, 200);
  g = Gr.fijarConfig(r.g, r.id, { type: { array: "i32" }, value: [5, 4], visibles: 2 });
  g = Gr.conectar(g, CAT, { nodo: control, puerto: "result", dir: "out" }, { nodo: orden, puerto: "array", dir: "in" }).g;
  g = Gr.conectar(g, CAT, { nodo: orden, puerto: "result", dir: "out" }, { nodo: indicador, puerto: "value", dir: "in" }).g;
  const texto = aTexto(g, CAT);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto, "guardar lo abierto da el mismo fichero");
  const c0 = abierto.nodos.find((n) => n.tipo === "arr-control");
  assert.deepEqual([c0.config.value, c0.config.visibles, c0.config.indice], [[1, 2, 3], 3, 1]);
  assert.deepEqual(abierto.nodos.find((n) => n.tipo === "arr-const").config.value, [5, 4]);
  const { compilar } = await import("../../core/compiler/compiler.mjs");
  const { ejecutar } = await import("../../core/runtime/runtime.mjs");
  const c = compilar(abierto, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const escritos = await ejecutar(c, { [c0.id]: [3, 1, 2] });
  assert.deepEqual(escritos[abierto.nodos.find((n) => n.tipo === "arr-indicator").id], [1, 2, 3]);
});

test("el indexado de un túnel de bucle se guarda y se abre", () => {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = r.g;
  const f = r.id;
  r = Gr.crearNodo(g, CAT, "arr-const", 0, 0);
  g = Gr.fijarConfig(r.g, r.id, { type: { array: "number" }, value: [1] });
  const a = r.id;
  r = Gr.crearNodo(g, CAT, "square", 0, 0);
  g = Gr.meter(r.g, CAT, [r.id], f);
  g = Gr.conectarCruzando(g, CAT, { nodo: a, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "x", dir: "in" }).g;
  const antes = g.nodos.find((n) => n.tipo === "tunnel-in");
  assert.ok(antes.config.indexado);
  const texto = aTexto(g, CAT);
  const abierto = leer(texto, CAT);
  assert.ok(abierto.nodos.find((n) => n.tipo === "tunnel-in").config.indexado, "el túnel vuelve indexado");
  assert.equal(aTexto(abierto, CAT), texto);
});
