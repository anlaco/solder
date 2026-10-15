// Editing the Block Diagram with mouse and keyboard (spec/05-editor.md §3–§5),
// as in labview-captures/block-diagram/numeric-cablear.mp4. No browser needed:
// diagram-editing.mjs is pure functions.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { MEDIDAS_COMPUESTO, caja, contenido, contexto, extremos, glifosPorBloque, ruta, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { tipos } from "../../core/model/graph.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = contexto(CAT, glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };

/** El terminal de un nodo, como lo resuelve la ventana, y su punto. */
function terminal(d, id, puerto) {
  const n = d.g.nodos.find((k) => k.id === id);
  const t = terminales(n, CTX).find((k) => k.puerto === puerto);
  return [{ tipo: "terminal", nodo: id, puerto, dir: t.dir }, { x: t.x, y: t.y }];
}

/** Coger un bloque de la paleta y hacer clic en el lienzo. */
function poner(d, bloque, p) {
  d = ED.coger(d, bloque);
  d = ED.moverA(d, CTX, p);
  return ED.pulsar(d, CTX, FONDO, p);
}

/** Arrastrar de un terminal a otro. */
function cablear(d, [t1, p1], [t2, p2]) {
  d = ED.pulsar(d, CTX, t1, p1);
  d = ED.moverA(d, CTX, { x: p2.x, y: p2.y });
  return ED.soltar(d, CTX, t2, p2);
}

const ids = (d) => d.g.nodos.map((n) => n.id);

test("en el lienzo se colocan mueven y cablean los bloques", () => {
  let d = ED.inicial();
  d = poner(d, "num-const", { x: 40, y: 40 });
  d = poner(d, "const", { x: 40, y: 100 });
  d = poner(d, "add", { x: 160, y: 60 });
  const [a, b, add] = ids(d);
  assert.deepEqual(d.seleccion, [add], "lo recién puesto queda seleccionado");

  // Mover: arrastrar el nodo lo desplaza, y sólo cambia su posición.
  const antes = d.g.nodos.find((n) => n.id === add);
  d = ED.pulsar(d, CTX, { tipo: "nodo", id: add }, { x: 170, y: 70 });
  d = ED.moverA(d, CTX, { x: 190, y: 80 });
  d = ED.soltar(d, CTX, { tipo: "nodo", id: add }, { x: 190, y: 80 });
  const despues = d.g.nodos.find((n) => n.id === add);
  assert.deepEqual([despues.x - antes.x, despues.y - antes.y], [20, 10]);

  // Cablear arrastrando, en los dos sentidos.
  d = cablear(d, terminal(d, a, "result"), terminal(d, add, "a"));
  d = cablear(d, terminal(d, add, "b"), terminal(d, b, "result"));
  assert.equal(d.g.cables.length, 2);
  const t = tipos(d.g, CAT);
  assert.equal(t.salidas.get(`${add}.result`), "number");
  assert.equal([...t.cables.values()].filter((c) => c.coercion).length, 1, "el I32 entra con coerción");
});

// En el vídeo, el tramo vertical de un cable nuevo queda pegado a la entrada donde se suelta.
test("un cable nuevo gira junto a la entrada donde se suelta", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "increment", { x: 200, y: 60 });
  const [c, inc] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, inc, "x"));
  const ext = extremos(d.g, CTX);
  const destino = ext.get(`${inc}.x`);
  const [x] = d.g.cables[0].codos;
  assert.ok(destino.x - x > 0 && destino.x - x <= 6, `el codo está a ${destino.x - x} px de la entrada`);
});

test("un cable también se hace con dos clics", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "increment", { x: 100, y: 0 });
  const [c, inc] = ids(d);
  const [t1, p1] = terminal(d, c, "result");
  const [t2, p2] = terminal(d, inc, "x");
  d = ED.pulsar(d, CTX, t1, p1);
  d = ED.soltar(d, CTX, t1, p1);
  assert.equal(d.accion.tipo, "cablear", "tras un clic el cable sigue al ratón");
  d = ED.moverA(d, CTX, p2);
  d = ED.pulsar(d, CTX, FONDO, { x: 60, y: 60 });
  assert.equal(d.accion.tipo, "cablear", "un clic en el fondo no lo corta");
  d = ED.pulsar(d, CTX, t2, p2);
  assert.equal(d.g.cables.length, 1);
  assert.equal(d.accion, null);
});

// «Reposicionar los cables»: un clic en un tramo lo selecciona y arrastrarlo lo mueve de lado.
test("un tramo de un cable se selecciona y se arrastra", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "increment", { x: 200, y: 80 });
  const [c, inc] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, inc, "x"));
  const cable = d.g.cables[0];
  const x0 = cable.codos[0];
  d = ED.pulsar(d, CTX, { tipo: "tramo", cable: cable.id, k: 1 }, { x: x0, y: 40 });
  assert.deepEqual(d.seleccion, [`${cable.id}#1`], "sólo ese tramo");
  d = ED.moverA(d, CTX, { x: x0 - 60, y: 45 });
  d = ED.soltar(d, CTX, FONDO, { x: x0 - 60, y: 45 });
  assert.equal(d.g.cables[0].codos[0], x0 - 60, "el vertical se mueve de lado, no de arriba abajo");
  // Mover el nodo de destino conserva el codo.
  d = ED.pulsar(d, CTX, { tipo: "nodo", id: inc }, { x: 210, y: 90 });
  d = ED.moverA(d, CTX, { x: 230, y: 120 });
  d = ED.soltar(d, CTX, { tipo: "nodo", id: inc }, { x: 230, y: 120 });
  assert.equal(d.g.cables[0].codos[0], x0 - 60);
});

test("mover el primer tramo de un cable le añade un codo", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "increment", { x: 200, y: 0 });
  const [c, inc] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, inc, "x"));
  const cable = d.g.cables[0];
  d = ED.pulsar(d, CTX, { tipo: "tramo", cable: cable.id, k: 0 }, { x: 20, y: 9 });
  d = ED.moverA(d, CTX, { x: 20, y: 39 });
  const r = ruta(...["de", "a"].map((l) => extremos(d.g, CTX).get(`${d.g.cables[0][l].nodo}.${d.g.cables[0][l].puerto}`)), d.g.cables[0].codos);
  assert.equal(d.g.cables[0].codos.length, 3);
  assert.ok(r.some(([, y]) => Math.abs(y - (r[0][1] + 30)) < 0.01), "hay un tramo 30 px más abajo");
  assert.deepEqual(d.seleccion, [`${cable.id}#2`], "sigue seleccionado el tramo que se arrastra");
});

// Lo que se ve en el vídeo: 43,3 en una constante I32 la vuelve DBL, naranja.
test("una constante se edita y escribir un decimal la vuelve dbl", () => {
  let d = poner(ED.inicial(), "num-const", { x: 0, y: 0 });
  const [c] = ids(d);
  d = ED.editar(d, CTX, c);
  assert.deepEqual(d.edicion, { nodo: c, texto: "0", todo: true }, "el texto entra seleccionado");
  for (const k of "32") d = ED.teclear(d, k);
  d = ED.confirmar(d, CTX);
  let n = d.g.nodos[0];
  assert.deepEqual([n.config.value, n.config.type], [32, "i32"], "un entero la deja I32");
  d = ED.editar(d, CTX, c);
  for (const k of "43,3") d = ED.teclear(d, k);
  d = ED.teclear(d, "Backspace");
  d = ED.teclear(d, "3");
  d = ED.pulsar(d, CTX, FONDO, { x: 300, y: 300 });
  n = d.g.nodos[0];
  assert.equal(d.edicion, null, "un clic fuera confirma");
  assert.deepEqual([n.config.value, n.config.type], [43.3, "number"]);
  assert.equal(tipos(d.g, CAT).salidas.get(`${c}.result`), "number");
  d = ED.editar(d, CTX, c);
  assert.equal(d.edicion.texto, "43,3", "con el separador decimal del sistema");
  d = ED.escape(ED.teclear(d, "x"));
  assert.equal(d.g.nodos[0].config.value, 43.3, "Esc no cambia nada");
});

test("lo que no es un número deja la constante como estaba", () => {
  let d = poner(ED.inicial(), "const", { x: 0, y: 0 });
  d = ED.editar(d, CTX, ids(d)[0]);
  for (const k of "abc") d = ED.teclear(d, k);
  d = ED.confirmar(d, CTX);
  assert.equal(d.g.nodos[0].config.value, 0);
});

test("el menú de una función enseña sus terminales", () => {
  let d = poner(ED.inicial(), "add", { x: 0, y: 0 });
  const [add] = ids(d);
  d = ED.abrirMenu(d, "context.function", add, 50, 50);
  d = ED.sobreMenu(d, "context.function.visible-items", true);
  assert.equal(d.menu.abierto, "context.function.visible-items");
  d = ED.orden(d, "context.function.visible-items.terminals");
  assert.equal(d.menu, null, "la orden cierra el menú");
  assert.equal(d.g.nodos[0].vista.terminales, true);
  d = ED.abrirMenu(d, "context.function", add, 50, 50);
  assert.ok(ED.marcados(d).has("context.function.visible-items.terminals"), "la fila lleva la marca");
});

// Los menús de clic derecho de Comparison, capturados en LabVIEW 2026 Q3
// (block-diagram/comparison-menu-*.png): cada familia tiene el suyo.
test("el menú de una función de comparison enseña sus terminales", async () => {
  const { menuContextual, menuDe } = await import("../../editor/src/block-diagram/diagram-view.mjs");
  const filas = (raiz) => [...menuContextual(INV, { raiz, x: 0, y: 0 }).matchAll(/data-id="([^"]+)"/g)].map((m) => m[1].slice(raiz.length + 1));
  assert.deepEqual(filas("context.comparison-function"), [
    "visible-items", "help", "examples", "description-and-tip", "add-breakpoint", "comparison-palette", "boolean-palette", "create",
    "replace", "replace-comparison", "comparison-mode", "remove-and-rewire", "properties",
  ]);
  assert.ok(!filas("context.select").includes("comparison-mode"), "Select no tiene Comparison Mode");
  assert.ok(filas("context.max-and-min").includes("numeric-palette"), "Max & Min viene también de Numeric");
  assert.deepEqual(filas("context.in-range-and-coerce").slice(9), ["comparison-mode", "include-upper-limit", "include-lower-limit", "remove-and-rewire", "properties"]);
  assert.deepEqual(INV.hijos("context.comparison-function.comparison-mode").map((e) => e.etiqueta), ["Compare Elements", "Compare Aggregates"]);

  let d = poner(ED.inicial(), "equal", { x: 0, y: 0 });
  const [igual] = ids(d);
  assert.equal(menuDe(d.g.nodos[0]), "context.comparison-function");
  d = ED.abrirMenu(d, menuDe(d.g.nodos[0]), igual, 50, 50);
  d = ED.orden(d, "context.comparison-function.visible-items.terminals");
  assert.equal(d.g.nodos[0].vista.terminales, true);
  for (const [bloque, menu] of Object.entries({
    "equal-to-0": "context.comparison-with-zero", select: "context.select", "max-and-min": "context.max-and-min", "in-range-and-coerce": "context.in-range-and-coerce",
  })) assert.equal(menuDe({ tipo: bloque }), menu);
});

// In Range and Coerce: de fábrica se incluye el límite inferior y no el superior
// (comprobado en LabVIEW: el menú sale con sólo «Include lower limit» marcado).
test("include upper limit e include lower limit alternan los extremos de in range and coerce", () => {
  let d = poner(ED.inicial(), "in-range-and-coerce", { x: 0, y: 0 });
  const [nodo] = ids(d);
  const R = "context.in-range-and-coerce";
  d = ED.abrirMenu(d, R, nodo, 50, 50);
  assert.deepEqual([...ED.marcados(d)].filter((m) => m.includes("limit")), [`${R}.include-lower-limit`]);
  d = ED.orden(d, `${R}.include-upper-limit`);
  assert.equal(d.g.nodos[0].config["include-upper-limit"], true);
  d = ED.abrirMenu(d, R, nodo, 50, 50);
  d = ED.orden(d, `${R}.include-lower-limit`);
  assert.equal(d.g.nodos[0].config["include-lower-limit"], false);
  d = ED.abrirMenu(d, R, nodo, 50, 50);
  assert.deepEqual([...ED.marcados(d)].filter((m) => m.includes("limit")), [`${R}.include-upper-limit`]);
});

test("las pistas de los terminales siguen al ratón", () => {
  let d = poner(ED.inicial(), "add", { x: 0, y: 0 });
  const [add] = ids(d);
  d = ED.sobrevolar(d, { tipo: "nodo", id: add });
  assert.deepEqual(d.sobre, { nodo: add });
  assert.equal(ED.sobrevolar(d, { tipo: "nodo", id: add }), d, "sin cambios no hay estado nuevo");
  d = ED.sobrevolar(d, { tipo: "terminal", nodo: add, puerto: "a", dir: "in" });
  assert.deepEqual(d.sobre, { nodo: add, puerto: "a" });
  assert.equal(ED.sobrevolar(d, FONDO).sobre, null);
});

test("deshacer vuelve atrás un gesto entero", () => {
  let d = ED.inicial();
  let h = H.nuevo(d.g);
  d = poner(d, "add", { x: 0, y: 0 });
  h = H.registrar(h, d.g);
  const puesto = d.g;
  d = ED.pulsar(d, CTX, { tipo: "nodo", id: ids(d)[0] }, { x: 10, y: 10 });
  for (const x of [20, 30, 40]) d = ED.moverA(d, CTX, { x, y: 10 });
  d = ED.soltar(d, CTX, FONDO, { x: 40, y: 10 });
  h = H.registrar(h, d.g);
  let r = H.deshacer(h);
  assert.equal(r.g, puesto, "un arrastre es un solo paso");
  r = H.deshacer(r.h);
  assert.equal(r.g.nodos.length, 0);
  assert.equal(H.deshacer(r.h), null);
  assert.equal(H.rehacer(r.h).g, puesto);
});

test("unir dos salidas no crea nada y dice por qué", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "const", { x: 0, y: 50 });
  const [a, b] = ids(d);
  d = cablear(d, terminal(d, a, "result"), terminal(d, b, "result"));
  assert.equal(d.g.cables.length, 0);
  assert.match(d.aviso.texto, /salidas/);
  assert.equal(ED.escape(d).aviso, null, "Esc lo quita");
});

test("la selección se mueve con las flechas y se borra dejando sus cables rotos (DT-046)", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "negate", { x: 100, y: 0 });
  const [c, neg] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, neg, "x"));
  d = ED.pulsar(d, CTX, { tipo: "nodo", id: neg }, { x: 110, y: 10 });
  d = ED.soltar(d, CTX, { tipo: "nodo", id: neg }, { x: 110, y: 10 });
  const x0 = d.g.nodos[1].x;
  d = ED.flecha(d, "ArrowRight", false);
  d = ED.flecha(d, "ArrowRight", true);
  assert.equal(d.g.nodos[1].x, x0 + 9);
  d = ED.borrarSeleccion(d, CTX);
  assert.deepEqual(ids(d), [c]);
  assert.equal(d.g.cables.length, 1, "the wire stays, broken (DT-046)");
  assert.ok(Gr.esSuelto(d.g.cables[0].a), "with its loose end where the terminal was");
});

test("un tramo seleccionado borra su cable", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "negate", { x: 100, y: 0 });
  const [c, neg] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, neg, "x"));
  d = ED.pulsar(d, CTX, { tipo: "tramo", cable: d.g.cables[0].id, k: 1 }, { x: 90, y: 5 });
  d = ED.borrarSeleccion(ED.soltar(d, CTX, FONDO, { x: 90, y: 5 }));
  assert.equal(d.g.cables.length, 0);
  assert.equal(d.g.nodos.length, 2);
});

test("arrastrar por el fondo selecciona lo que toca y Shift suma", () => {
  let d = poner(poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "const", { x: 0, y: 100 }), "add", { x: 200, y: 0 });
  const [a, b, add] = ids(d);
  d = ED.pulsar(d, CTX, FONDO, { x: -10, y: -10 });
  d = ED.moverA(d, CTX, { x: 60, y: 130 });
  d = ED.soltar(d, CTX, FONDO, { x: 60, y: 130 });
  assert.deepEqual(d.seleccion.sort(), [a, b].sort());
  d = ED.pulsar(d, CTX, { tipo: "nodo", id: add }, { x: 205, y: 5 }, true);
  assert.deepEqual(d.seleccion.sort(), [a, b, add].sort());
  d = ED.pulsar(d, CTX, FONDO, { x: 500, y: 500 });
  d = ED.soltar(d, CTX, FONDO, { x: 500, y: 500 });
  assert.deepEqual(d.seleccion, [], "un clic en el fondo vacía la selección");
});

test("un bloque cogido de la paleta se suelta arrastrando", () => {
  let d = ED.coger(ED.inicial(), "sign");
  d = ED.moverA(d, CTX, { x: 50, y: 60 });
  d = ED.soltar(d, CTX, FONDO, { x: 50, y: 60 });
  assert.equal(d.g.nodos.length, 1);
  assert.equal(d.g.nodos[0].tipo, "sign");
  assert.equal(ED.soltar(ED.coger(ED.inicial(), "sign"), CTX, null, { x: 0, y: 0 }).g.nodos.length, 0, "fuera del lienzo no se suelta");
});

// ——— Compound Arithmetic (labview-captures/block-diagram/compound-*) ———

const CA = "compound-arithmetic";
const menuCA = (d, id, puerto) => ED.abrirMenu(d, puerto ? "context.compound-arithmetic-input" : "context.compound-arithmetic", id, 0, 0, puerto);

test("compound arithmetic cambia de modo y con and su salida es entera", () => {
  let d = poner(poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "const", { x: 0, y: 40 }), CA, { x: 80, y: 10 });
  const [a, b, ca] = ids(d);
  d = cablear(d, terminal(d, a, "result"), terminal(d, ca, "value-0"));
  d = cablear(d, terminal(d, b, "result"), terminal(d, ca, "value-1"));
  let t = tipos(d.g, CAT);
  assert.equal(t.salidas.get(`${ca}.result`), "number", "en Add, dos DBL dan DBL");
  assert.ok([...t.cables.values()].every((c) => !c.coercion));
  d = ED.orden(menuCA(d, ca), "context.compound-arithmetic.change-mode.and", CTX);
  assert.equal(d.g.nodos[2].config.mode, "and");
  t = tipos(d.g, CAT);
  assert.equal(t.salidas.get(`${ca}.result`), "i64", "en AND la operación es entera: la salida sale azul");
  assert.ok([...t.cables.values()].every((c) => c.coercion), "y las DBL entran con coerción, como en compound-and.png");
  assert.ok(ED.marcados(menuCA(d, ca)).has("context.compound-arithmetic.change-mode.and"), "el modo actual lleva la marca");
});

test("invertir y añadir o quitar entradas conserva los cables", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), CA, { x: 80, y: 0 });
  const [c, ca] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, ca, "value-1"));
  d = ED.orden(menuCA(d, ca, "value-0"), "context.compound-arithmetic-input.add-input", CTX);
  assert.equal(CAT.puertos(d.g.nodos[1]).in.length, 3);
  assert.equal(d.g.cables[0].a.puerto, "value-2", "la nueva va debajo de la pulsada y el cable sigue a la suya");
  d = ED.orden(menuCA(d, ca, "value-2"), "context.compound-arithmetic-input.invert", CTX);
  assert.deepEqual(d.g.nodos[1].config.inverted, ["value-2"]);
  d = ED.orden(menuCA(d, ca, "value-0"), "context.compound-arithmetic-input.remove-input", CTX);
  assert.equal(d.g.cables[0].a.puerto, "value-1");
  assert.deepEqual(d.g.nodos[1].config.inverted, ["value-1"], "la marca de invertida también");
  d = ED.orden(menuCA(d, ca, "value-1"), "context.compound-arithmetic-input.remove-input", CTX);
  assert.equal(CAT.puertos(d.g.nodos[1]).in.length, 2, "no baja de dos entradas");
  d = ED.orden(menuCA(d, ca), "context.compound-arithmetic.invert", CTX);
  assert.ok(d.g.nodos[1].config.inverted.includes("result"), "Invert en el nodo invierte la salida");
});

test("create constant crea la constante cableada y lista para escribir", () => {
  let d = poner(ED.inicial(), CA, { x: 100, y: 40 });
  const [ca] = ids(d);
  d = ED.orden(menuCA(d, ca, "value-1"), "context.compound-arithmetic-input.create.constant", CTX);
  const c = d.g.nodos[1];
  assert.equal(c.tipo, "num-const", "del tipo de la entrada: DBL");
  assert.equal(c.config.type, "number");
  assert.equal(d.g.cables.length, 1);
  assert.deepEqual([d.g.cables[0].de.nodo, d.g.cables[0].a.puerto], [c.id, "value-1"]);
  const [, pe] = terminal(d, ca, "value-1");
  const [, pc] = terminal(d, c.id, "result");
  assert.ok(Math.abs(pe.y - pc.y) < 0.6, "a la altura de la entrada");
  assert.equal(pe.x - pc.x, 16, "16 px a su izquierda (labview-captures/create-paste/)");
  assert.deepEqual(d.edicion, { nodo: c.id, texto: "0", todo: true, nuevo: true }, "con el texto seleccionado");
});

test("estirar compound arithmetic por sus asas añade y quita entradas", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), CA, { x: 80, y: 0 });
  const [c, ca] = ids(d);
  d = cablear(d, terminal(d, c, "result"), terminal(d, ca, "value-0"));
  const celda = MEDIDAS_COMPUESTO.celda;
  const y0 = d.g.nodos[1].y;
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: ca, lado: "abajo" }, { x: 90, y: 20 });
  d = ED.moverA(d, CTX, { x: 90, y: 20 + 3 * celda });
  d = ED.soltar(d, CTX, FONDO, { x: 90, y: 20 + 3 * celda });
  assert.equal(CAT.puertos(d.g.nodos[1]).in.length, 5, "tres celdas más");
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: ca, lado: "arriba" }, { x: 90, y: 0 });
  d = ED.moverA(d, CTX, { x: 90, y: -celda });
  d = ED.soltar(d, CTX, FONDO, { x: 90, y: -celda });
  assert.equal(CAT.puertos(d.g.nodos[1]).in.length, 6);
  assert.ok(Math.abs(d.g.nodos[1].y - (y0 - celda)) < 0.01, "por arriba el nodo crece hacia arriba");
  assert.equal(d.g.cables[0].a.puerto, "value-1", "y el cable sigue en su celda");
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: ca, lado: "abajo" }, { x: 90, y: 60 });
  d = ED.moverA(d, CTX, { x: 90, y: -200 });
  assert.equal(CAT.puertos(d.g.nodos[1]).in.length, 2, "nunca menos de dos");
});

// El usuario, contra LabVIEW: Compound Arithmetic es un píxel más ancho que Add.
test("compound arithmetic es un pixel mas ancho que add", () => {
  const d = poner(poner(ED.inicial(), "add", { x: 0, y: 0 }), CA, { x: 60, y: 0 });
  const [add, ca] = d.g.nodos.map((n) => caja(n, CTX).ancho);
  assert.ok(Math.abs(ca - add - 1) < 0.01, `Add ${add}, Compound Arithmetic ${ca}`);
});

// En LabVIEW, un clic en la constante booleana la cambia de TRUE a FALSE; y de
// la paleta Boolean, True Constant sale en TRUE y Compound Arithmetic en AND.
test("la constante booleana cambia con un clic y se mueve arrastrándola", () => {
  let d = ED.coger(ED.inicial(), "bool-const", { value: true });
  d = ED.moverA(d, CTX, { x: 100, y: 100 });
  d = ED.pulsar(d, CTX, FONDO, { x: 100, y: 100 });
  const id = d.g.nodos[0].id;
  assert.equal(d.g.nodos[0].config.value, true);
  const k = caja(d.g.nodos[0], CTX);
  const cuerpo = { x: k.x + 2, y: k.y + k.alto / 2 };
  d = ED.soltar(ED.pulsar(d, CTX, { tipo: "nodo", id }, cuerpo), CTX, { tipo: "nodo", id }, cuerpo);
  assert.equal(d.g.nodos[0].config.value, false, "un clic la cambia");
  d = ED.pulsar(d, CTX, { tipo: "nodo", id }, cuerpo);
  d = ED.moverA(d, CTX, { x: cuerpo.x + 30, y: cuerpo.y });
  d = ED.soltar(d, CTX, FONDO, { x: cuerpo.x + 30, y: cuerpo.y });
  assert.equal(d.g.nodos[0].config.value, false, "arrastrarla no la cambia");
  assert.equal(d.g.nodos[0].x, k.x + 30);

  let e = ED.coger(ED.inicial(), "compound-arithmetic", { mode: "and" });
  e = ED.pulsar(ED.moverA(e, CTX, { x: 50, y: 50 }), CTX, FONDO, { x: 50, y: 50 });
  assert.equal(e.g.nodos[0].config.mode, "and");
});

// En LabVIEW 2026 Q3: un cable que se tira desde una entrada y se suelta en otro
// cable sale de él, con un punto de unión, y baja 12 px antes de la entrada.
test("un cable que acaba en otro cable sale de él como una rama", () => {
  let d = ED.inicial();
  d = poner(d, "const", { x: 20, y: 40 });
  d = poner(d, "add", { x: 200, y: 100 });
  const [k, add] = ids(d);
  d = cablear(d, terminal(d, k, "result"), terminal(d, add, "a"));
  const padre = d.g.cables[0];
  const [tb, pb] = terminal(d, add, "b");
  // Clic en la entrada b y clic en el primer tramo del cable.
  d = ED.pulsar(d, CTX, tb, pb);
  d = ED.soltar(d, CTX, tb, pb);
  const r = ruta(...[`${k}.result`, `${add}.a`].map((t) => extremos(d.g, CTX).get(t)), padre.codos);
  d = ED.pulsar(d, CTX, { tipo: "tramo", cable: padre.id, k: 0 }, { x: r[0][0] + 5, y: r[0][1] });
  assert.equal(d.g.cables.length, 2);
  const nueva = d.g.cables[1];
  assert.deepEqual([nueva.de, nueva.a], [padre.de, { nodo: add, puerto: "b" }], "lleva el mismo dato que el cable del que sale");
  assert.equal(nueva.union[1], r[0][1], "la unión está en el tramo pinchado");
  assert.equal(nueva.union[0], Math.min(pb.x - 12, r[1][0]), "tan cerca del destino como deja el tramo");
  assert.equal(tipos(d.g, CAT).cables.get(nueva.id).roto, null);
  assert.match(D_contenido(d), /class="union"/);

  // Desde una salida, no: ese cable ya tiene fuente.
  d = poner(d, "const", { x: 20, y: 200 });
  const k2 = ids(d)[2];
  const [ts, ps] = terminal(d, k2, "result");
  d = ED.soltar(ED.pulsar(d, CTX, ts, ps), CTX, ts, ps);
  d = ED.pulsar(d, CTX, { tipo: "tramo", cable: padre.id, k: 0 }, { x: r[0][0] + 5, y: r[0][1] });
  assert.equal(d.g.cables.length, 2);
  assert.match(d.aviso.texto, /ya tiene una fuente/);
});

function D_contenido(d) {
  return contenido(d, CTX, tipos(d.g, CAT));
}

// numeric-menu-constante-representacion.png y numeric-menu-control-
// representacion.png: la rejilla de Representation cambia el tipo del objeto.
test("representation cambia el tipo de una constante, un control y un indicador", () => {
  let d = poner(poner(ED.inicial(), "const", { x: 0, y: 0 }), "control", { x: 100, y: 0 });
  d = poner(d, "indicator", { x: 200, y: 0 });
  const [c, k, i] = ids(d);
  const cambiar = (d, id, raiz, abrev) => ED.orden(ED.abrirMenu(d, raiz, id, 0, 0), `${raiz}.representation.${abrev}`, CTX);

  // Una constante DBL con 3,7 pasa a I32 y el valor se lleva a su tipo.
  d = { ...d, g: Gr.fijarValor(d.g, c, 3.7) };
  d = cambiar(d, c, "context.numeric-constant", "i32");
  const k0 = d.g.nodos.find((n) => n.id === c);
  assert.deepEqual([k0.tipo, k0.config.type, k0.config.value], ["num-const", "i32", 4], "la DBL de la paleta pasa a la numérica general");
  assert.ok(ED.marcados(ED.abrirMenu(d, "context.numeric-constant", c, 0, 0)).has("context.numeric-constant.representation.i32"));
  d = cambiar(d, c, "context.numeric-constant", "dbl");
  assert.equal(d.g.nodos.find((n) => n.id === c).config.type, "number");

  // Un control y un indicador cambian el tipo del terminal y del cable.
  d = cambiar(d, k, "context.numeric-control", "u8");
  d = cambiar(d, i, "context.numeric-indicator", "i16");
  d = { ...d, g: Gr.conectar(d.g, CAT, { nodo: k, puerto: "result", dir: "out" }, { nodo: i, puerto: "value", dir: "in" }).g };
  const t = tipos(d.g, CAT);
  assert.equal(t.salidas.get(`${k}.result`), "u8");
  assert.equal(t.entradas.get(`${i}.value`), "i16");
  assert.equal(t.cables.values().next().value.coercion, true, "U8 a I16 lleva punto de coerción");
  assert.match(D_contenido(d), />U8</);
  assert.ok(ED.marcados(ED.abrirMenu(d, "context.numeric-control", k, 0, 0)).has("context.numeric-control.representation.u8"));
  assert.ok(!ED.marcados(ED.abrirMenu(d, "context.numeric-control", k, 0, 0)).has("context.numeric-control.representation.dbl"));

  // Lo que LabVIEW tiene y Solder no (EXT, FXP y los complejos) no actúa.
  const antes = d.g;
  d = ED.orden(ED.abrirMenu(d, "context.numeric-control", k, 0, 0), "context.numeric-control.representation.csg", CTX);
  assert.equal(d.g, antes);
});

// Expression Node: la expresión se escribe dentro del propio nodo, que se ensancha
// con el texto (block-diagram/numeric-expression-node.png).
test("el texto de un expression node se edita en su sitio y el nodo se ensancha", () => {
  let d = poner(ED.inicial(), "expression-node", { x: 100, y: 100 });
  const [id] = ids(d);
  const ancho0 = caja(d.g.nodos[0], CTX).ancho;
  assert.ok(Math.abs(ancho0 - 24) < 2, `con «x» mide 24 px en LabVIEW; aquí ${ancho0}`);
  d = ED.editar(d, CTX, id);
  assert.deepEqual(d.edicion, { nodo: id, texto: "x", todo: true });
  for (const t of "x*2+sqrt(x)") d = ED.teclear(d, t);
  assert.ok(caja(d.g.nodos[0], CTX, d.edicion).ancho > ancho0 + 30, "crece mientras se escribe");
  d = ED.confirmar(d, CTX);
  assert.equal(d.g.nodos[0].config.expression, "x*2+sqrt(x)");
  assert.match(D_contenido(d), /class="texto-expresion"><span>x\*2\+sqrt\(x\)<\/span>/);
});

// ——— While Loop y For Loop (M4): lo que hace LabVIEW 2026 Q3 en labview-captures/structures/ ———

import { idsPintados } from "../../editor/src/window/window-view.mjs";

/** Coger una estructura de la paleta y soltarla con dos clics: la esquina y la opuesta. */
function colocarBucle(d, tipo, p0, p1) {
  d = ED.moverA(ED.coger(d, tipo), CTX, p0);
  d = ED.pulsar(d, CTX, FONDO, p0);
  d = ED.soltar(d, CTX, FONDO, p0);
  d = ED.moverA(d, CTX, p1);
  return ED.pulsar(d, CTX, FONDO, p1);
}
const nodoDe = (d, id) => d.g.nodos.find((n) => n.id === id);
const hijo = (d, id, tipo) => d.g.nodos.find((n) => n.dentro === id && n.tipo === tipo);
const cajaDe = (d, id) => caja(nodoDe(d, id), CTX);
/** Arrastrar un nodo (o una estructura por su borde) de un punto a otro. */
function arrastrar(d, id, p0, p1) {
  d = ED.pulsar(d, CTX, { tipo: "nodo", id }, p0);
  d = ED.moverA(d, CTX, p1);
  return ED.soltar(d, CTX, { tipo: "nodo", id }, p1);
}
/** Estirar una estructura por una de sus asas, que sólo existen con la estructura seleccionada. */
function estirar(d, id, lado, p0, p1) {
  d = { ...d, seleccion: [id] };
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: id, lado }, p0);
  d = ED.moverA(d, CTX, p1);
  return ED.soltar(d, CTX, FONDO, p1);
}

// while-loop.png y minimo-*.png: el primer clic fija una esquina, y el segundo,
// o soltar tras arrastrar, la opuesta; un clic sin mover deja 48 × 48 centrado.
test("una estructura se coloca con dos clics o arrastrando un rectángulo", () => {
  // Dos clics.
  let d = ED.moverA(ED.coger(ED.inicial(), "while-loop"), CTX, { x: 800, y: 400 });
  d = ED.pulsar(d, CTX, FONDO, { x: 800, y: 400 });
  assert.deepEqual(d.accion.esquina, { x: 800, y: 400 }, "el primer clic fija la esquina");
  assert.equal(d.g.nodos.length, 0, "y todavía no pone nada");
  d = ED.moverA(ED.soltar(d, CTX, FONDO, { x: 800, y: 400 }), CTX, { x: 1000, y: 600 });
  assert.match(contenido(d, CTX, tipos(d.g, CAT)), /class="rectangulo-estructura" style="left:800px;top:400px;width:200px;height:200px"/, "el rectángulo sigue al cursor");
  d = ED.pulsar(d, CTX, FONDO, { x: 1000, y: 600 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop");
  assert.deepEqual([w.x, w.y, w.tam.ancho, w.tam.alto], [800, 400, 200, 200]);
  assert.deepEqual(d.seleccion, [], "una estructura recién puesta no queda seleccionada");
  assert.equal(d.accion, null);
  assert.deepEqual(cajaDe(d, hijo(d, w.id, "loop-iteration").id).x, 810, "con sus terminales ya en su sitio");

  // Arrastrando: pulsar, mover y soltar en la esquina opuesta; el rectángulo puede ir en cualquier dirección.
  d = ED.moverA(ED.coger(d, "for-loop"), CTX, { x: 1400, y: 600 });
  d = ED.pulsar(d, CTX, FONDO, { x: 1400, y: 600 });
  d = ED.moverA(d, CTX, { x: 1100, y: 400 });
  d = ED.soltar(d, CTX, FONDO, { x: 1100, y: 400 });
  const f = d.g.nodos.find((n) => n.tipo === "for-loop");
  assert.deepEqual([f.x, f.y, f.tam.ancho, f.tam.alto], [1100, 400, 300, 200]);
  assert.ok(hijo(d, f.id, "loop-count") && hijo(d, f.id, "loop-iteration"));

  // Un clic sin arrastrar: el tamaño mínimo, centrado en el clic.
  d = colocarBucle(d, "while-loop", { x: 700, y: 700 }, { x: 700, y: 700 });
  const mini = d.g.nodos.filter((n) => n.tipo === "while-loop").at(-1);
  assert.deepEqual([mini.x, mini.y, mini.tam.ancho, mini.tam.alto], [676, 676, 48, 48]);
  // Un rectángulo más pequeño que el mínimo también se queda en 48.
  d = colocarBucle(d, "for-loop", { x: 300, y: 700 }, { x: 320, y: 710 });
  const chico = d.g.nodos.filter((n) => n.tipo === "for-loop").at(-1);
  assert.deepEqual([chico.tam.ancho, chico.tam.alto], [48, 48]);
  // Esc suelta la estructura que se llevaba.
  assert.equal(ED.escape(ED.coger(ED.inicial(), "while-loop")).accion, null);
});

test("soltar un nodo dentro de un bucle lo mete y fuera lo saca", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  d = poner(d, "add", { x: 200, y: 150 });
  const [add] = d.seleccion;
  assert.equal(nodoDe(d, add).dentro, w, "puesto dentro del bucle, es del bucle");
  d = poner(d, "const", { x: 600, y: 150 });
  const [c] = d.seleccion;
  assert.equal(nodoDe(d, c).dentro, undefined, "puesto fuera, es del diagrama");

  // Un cable de fuera a dentro pasa por un túnel; meter la constante lo deja sin túnel.
  d = cablear(d, terminal(d, c, "result"), terminal(d, add, "a"));
  assert.equal(d.g.nodos.filter((n) => n.tipo === "tunnel-in").length, 1);
  assert.equal(d.g.cables.length, 2);
  d = arrastrar(d, c, { x: 600, y: 150 }, { x: 250, y: 250 });
  assert.equal(nodoDe(d, c).dentro, w, "arrastrada hasta dentro, entra");
  assert.equal(d.g.nodos.filter((n) => n.tipo === "tunnel-in").length, 0, "el túnel ya no hace falta");
  assert.deepEqual(d.g.cables.map((k) => [k.de.nodo, k.a.nodo]), [[c, add]], "el cable va directo");

  // Y sacarla vuelve a pedirlo.
  d = arrastrar(d, c, { x: 250, y: 250 }, { x: 600, y: 150 });
  assert.equal(nodoDe(d, c).dentro, undefined);
  assert.equal(d.g.nodos.filter((n) => n.tipo === "tunnel-in").length, 1);
  assert.equal(d.g.cables.length, 2);
  const t = d.g.nodos.find((n) => n.tipo === "tunnel-in");
  assert.equal(cajaDe(d, t.id).x, 100, "el túnel, en el borde izquierdo");
  const aT = terminales(nodoDe(d, add), CTX).find((k) => k.puerto === "a");
  assert.equal(cajaDe(d, t.id).y + 4.5, Math.round(aT.y - 4.5) + 4.5, "a la altura del terminal de dentro");

  // Soltar una estructura alrededor de nodos ya puestos los mete, con sus túneles (structures/rodear-nodo.png).
  let e = poner(poner(ED.inicial(), "const", { x: 20, y: 200 }), "increment", { x: 300, y: 200 });
  const [c2, inc] = e.g.nodos.map((n) => n.id);
  e = cablear(e, terminal(e, c2, "result"), terminal(e, inc, "x"));
  e = colocarBucle(e, "while-loop", { x: 250, y: 150 }, { x: 400, y: 260 });
  const w2 = e.g.nodos.find((n) => n.tipo === "while-loop").id;
  assert.equal(nodoDe(e, inc).dentro, w2, "lo rodeado entra");
  assert.equal(nodoDe(e, c2).dentro, undefined, "y lo que queda fuera, no");
  assert.equal(e.g.nodos.filter((n) => n.tipo === "tunnel-in").length, 1, "con el túnel donde cruza el cable");
  // Un bucle dentro de otro: lo que se suelta en el interior es del bucle interior.
  e = colocarBucle(e, "for-loop", { x: 270, y: 160 }, { x: 330, y: 250 });
  assert.equal(e.g.nodos.find((n) => n.tipo === "for-loop").dentro, w2, "una estructura dentro de otra");
});

// seleccion.png y rs*.png: el borde se agarra para mover, y las asas, para estirar.
test("mover y estirar un bucle lleva su contenido y deja los túneles en el borde", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 300, y: 300 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  d = poner(d, "add", { x: 150, y: 150 });
  const [add] = d.seleccion;
  d = ED.orden(ED.abrirMenu(d, "context.while-loop", w, 0, 0, null, { x: 100, y: 200 }), "context.while-loop.add-shift-register", CTX);
  const izq = d.g.nodos.find((n) => n.tipo === "shift-register-left");
  const der = d.g.nodos.find((n) => n.tipo === "shift-register-right");
  d = poner(d, "const", { x: 20, y: 150 });
  d = cablear(d, terminal(d, d.g.nodos.at(-1).id, "result"), terminal(d, add, "a"));
  const t = d.g.nodos.find((n) => n.tipo === "tunnel-in").id;

  // Mover el bucle por su borde se lleva el add, los terminales, el shift register y el túnel.
  const antes = ["x", "y"].map((k) => [nodoDe(d, add)[k], nodoDe(d, t)[k], nodoDe(d, izq.id)[k]]);
  d = arrastrar(d, w, { x: 100, y: 200 }, { x: 130, y: 220 });
  assert.deepEqual(["x", "y"].map((k, i) => [nodoDe(d, add)[k], nodoDe(d, t)[k], nodoDe(d, izq.id)[k]].map((v, j) => v - antes[i][j])), [[30, 30, 30], [20, 20, 20]]);
  assert.deepEqual([nodoDe(d, w).x, nodoDe(d, w).y], [130, 120]);

  // Estirar por la esquina sudeste: los de la derecha y los de abajo la siguen; lo de la izquierda, no.
  d = estirar(d, w, "se", { x: 330, y: 320 }, { x: 390, y: 360 });
  assert.deepEqual([nodoDe(d, w).tam.ancho, nodoDe(d, w).tam.alto], [260, 240]);
  assert.equal(cajaDe(d, der.id).x, 130 + 260 - 16, "el shift register de la derecha, pegado al nuevo lado");
  assert.equal(cajaDe(d, hijo(d, w, "loop-condition").id).x, 130 + 260 - 26);
  assert.equal(cajaDe(d, hijo(d, w, "loop-iteration").id).y, 120 + 240 - 26);
  assert.equal(cajaDe(d, t).x, 130, "el túnel de la izquierda se queda");
  assert.equal(cajaDe(d, izq.id).y, nodoDe(d, izq.id).y, "los shift registers conservan su altura");
  // Por el noroeste: el lado de arriba y el izquierdo se mueven, y lo de dentro no.
  const posAdd = [nodoDe(d, add).x, nodoDe(d, add).y];
  d = estirar(d, w, "nw", { x: 129, y: 119 }, { x: 109, y: 99 });
  assert.deepEqual([nodoDe(d, w).x, nodoDe(d, w).y, nodoDe(d, w).tam.ancho, nodoDe(d, w).tam.alto], [110, 100, 280, 260]);
  assert.deepEqual([nodoDe(d, add).x, nodoDe(d, add).y], posAdd, "estirar no mueve lo de dentro");
  assert.equal(cajaDe(d, t).x, 110, "pero el túnel sigue al borde");
  // Nunca por debajo de 48 × 48.
  d = estirar(d, w, "se", { x: 389, y: 359 }, { x: 0, y: 0 });
  assert.deepEqual([nodoDe(d, w).tam.ancho, nodoDe(d, w).tam.alto], [48, 48]);
  assert.equal(cajaDe(d, hijo(d, w, "loop-condition").id).x, 110 + 48 - 26);

  // Un túnel resbala por su borde sin salirse de él; con el shift register, su pareja lo sigue.
  d = estirar(d, w, "se", { x: 158, y: 148 }, { x: 358, y: 348 });
  const y0 = nodoDe(d, t).y;
  d = arrastrar(d, t, { x: 114, y: y0 + 4 }, { x: 200, y: y0 + 44 });
  assert.deepEqual([cajaDe(d, t).x, cajaDe(d, t).y], [110, y0 + 40], "sólo cambia su altura");
  const yr = nodoDe(d, izq.id).y;
  d = arrastrar(d, izq.id, { x: 114, y: yr + 4 }, { x: 114, y: yr - 10 });
  assert.equal(nodoDe(d, der.id).y, nodoDe(d, izq.id).y, "las dos flechas, a la misma altura");
  assert.equal(nodoDe(d, izq.id).y, yr - 14, "arrastrado de yr + 4 a yr - 10");
  d = arrastrar(d, izq.id, { x: 114, y: yr - 6 }, { x: 114, y: -500 });
  assert.equal(nodoDe(d, izq.id).y, nodoDe(d, w).y + 6, "sin salirse del marco");
  // Los terminales del bucle no se mueven.
  const i0 = [nodoDe(d, hijo(d, w, "loop-iteration").id).x, nodoDe(d, hijo(d, w, "loop-iteration").id).y];
  d = arrastrar(d, hijo(d, w, "loop-iteration").id, { x: 120, y: 330 }, { x: 200, y: 200 });
  assert.deepEqual([nodoDe(d, hijo(d, w, "loop-iteration").id).x, nodoDe(d, hijo(d, w, "loop-iteration").id).y], i0);

  // Borrar un shift register se lleva a su pareja; los terminales del bucle no se borran; el bucle se va con todo lo suyo.
  d = ED.borrarSeleccion({ ...d, seleccion: [izq.id, hijo(d, w, "loop-iteration").id] });
  assert.ok(!d.g.nodos.some((n) => n.tipo.startsWith("shift-register")), "se van los dos");
  assert.ok(hijo(d, w, "loop-iteration"), "pero «i» se queda");
  d = ED.borrarSeleccion({ ...d, seleccion: [w] });
  assert.deepEqual(d.g.nodos.map((n) => n.tipo), ["const"], "el bucle se va con todo lo suyo y sólo queda lo de fuera");
});

// tunel-entrada.png y tunel-salida.png: un cable de un ámbito a otro lleva un
// túnel donde cruza el borde, a la altura del terminal de dentro.
test("cablear a través del borde crea el túnel", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  d = poner(d, "increment", { x: 200, y: 150 });
  const [inc] = d.seleccion;
  d = poner(d, "const", { x: 20, y: 200 });
  const [k] = d.seleccion;
  d = poner(d, "increment", { x: 480, y: 220 });
  const [fuera] = d.seleccion;

  // Entrar: de una salida de fuera a una entrada de dentro.
  d = cablear(d, terminal(d, k, "result"), terminal(d, inc, "x"));
  assert.equal(d.aviso, null);
  const tin = d.g.nodos.find((n) => n.tipo === "tunnel-in");
  assert.equal(tin.dentro, w);
  assert.deepEqual(d.g.cables.map((c) => [c.de.nodo, c.a.nodo]), [[k, tin.id], [tin.id, inc]]);
  const [xi, yi] = [terminal(d, inc, "x")[1].y, cajaDe(d, tin.id)];
  assert.equal(yi.y + 4.5, Math.round(xi - 4.5) + 4.5, "el túnel, a la altura de la entrada a la que va");
  assert.equal(yi.x, 100, "pegado al lado izquierdo");

  // Salir, arrastrando desde la entrada de fuera hacia la salida de dentro: el túnel de salida.
  d = cablear(d, terminal(d, fuera, "x"), terminal(d, inc, "result"));
  const tout = d.g.nodos.find((n) => n.tipo === "tunnel-out");
  assert.equal(tout.dentro, w);
  assert.equal(cajaDe(d, tout.id).x, 400 - 9, "pegado al lado derecho");
  assert.equal(d.g.cables.length, 4);
  assert.equal(tipos(d.g, CAT).salidas.get(`${tin.id}.y`), "number", "el tipo pasa por los túneles");

  // Entre dos bucles, uno dentro de otro: un túnel en cada borde que cruza.
  d = colocarBucle(d, "for-loop", { x: 150, y: 210 }, { x: 260, y: 290 });
  const f = d.g.nodos.find((n) => n.tipo === "for-loop").id;
  d = poner(d, "increment", { x: 180, y: 240 });
  const [nieto] = d.seleccion;
  assert.equal(nodoDe(d, nieto).dentro, f);
  d = cablear(d, terminal(d, k, "result"), terminal(d, nieto, "x"));
  assert.equal(d.g.nodos.filter((n) => n.tipo === "tunnel-in").length, 3, "uno en cada borde: el While, y el For, más el de antes");
  assert.equal(d.aviso, null);
  // Un cable entre dos terminales del mismo bucle no necesita túnel.
  const antes = d.g.nodos.length;
  d = poner(d, "increment", { x: 330, y: 150 });
  d = cablear(d, terminal(d, inc, "result"), terminal(d, d.seleccion[0], "x"));
  assert.equal(d.g.nodos.length, antes + 1, "sólo el nodo nuevo");
});

// menu-while-loop.png, menu-for-loop.png, menu-condicion.png y shift-register.png.
test("los menús de un bucle añaden un shift register y cambian la condición", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 800, y: 400 }, { x: 1000, y: 600 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop");
  assert.equal(D.menuDe(w), "context.while-loop");
  d = ED.abrirMenu(d, "context.while-loop", w.id, 803, 500, null, { x: 803, y: 500 });
  const html = D.menuContextual(INV, d.menu, ED.marcados(d));
  assert.deepEqual(idsPintados(html).map((id) => id.slice("context.while-loop.".length)).filter((id) => !id.startsWith("context.")), [
    "visible-items", "help", "examples", "description-and-tip", "add-breakpoint", "structures-palette", "auto-grow", "exclude-from-diagram-cleanup",
    "replace-with-for-loop", "replace-with-timed-loop", "remove-while-loop", "add-shift-register", "stop-if-true", "continue-if-true", "remove-and-rewire", "properties",
  ]);
  assert.equal((html.match(/separador-menu/g) ?? []).length, 6, "los separadores de la captura");
  assert.match(html, /class="item-menu hueco marcado" data-id="context\.while-loop\.auto-grow"/, "Auto Grow, marcado de fábrica");
  assert.match(html, /class="item-menu marcado" data-id="context\.while-loop\.stop-if-true"/, "Stop if True, marcado de fábrica");
  assert.match(html, /class="item-menu hueco" data-id="context\.while-loop\.replace-with-for-loop"/);
  // Visible Items: Label, Subdiagram Label y, tras un separador, Iteration Terminal con su marca.
  const sub = D.menuContextual(INV, ED.sobreMenu(d, "context.while-loop.visible-items", true).menu, ED.marcados(d));
  assert.match(sub, /data-id="context\.while-loop\.visible-items\.subdiagram-label"/);
  assert.match(sub, /class="item-menu hueco marcado" data-id="context\.while-loop\.visible-items\.iteration-terminal"/);

  // Add Shift Register: el par, a la altura del clic, uno en cada lado (shift-register.png: y = 494 con el clic en 500).
  d = ED.orden(d, "context.while-loop.add-shift-register", CTX);
  assert.equal(d.menu, null);
  const izq = d.g.nodos.find((n) => n.tipo === "shift-register-left");
  const der = d.g.nodos.find((n) => n.tipo === "shift-register-right");
  assert.deepEqual([cajaDe(d, izq.id).x, cajaDe(d, izq.id).y, cajaDe(d, der.id).x, cajaDe(d, der.id).y], [800, 494, 984, 494]);
  assert.equal(izq.config.par, der.id);

  // Continue if True, desde el borde del bucle y desde el terminal de condición.
  d = ED.orden(ED.abrirMenu(d, "context.while-loop", w.id, 0, 0), "context.while-loop.continue-if-true", CTX);
  const cond = hijo(d, w.id, "loop-condition");
  assert.equal(cond.config.mode, "continue-if-true");
  d = ED.abrirMenu(d, "context.loop-condition", cond.id, 0, 0);
  assert.ok(ED.marcados(d).has("context.loop-condition.continue-if-true") && !ED.marcados(d).has("context.loop-condition.stop-if-true"));
  d = ED.orden(d, "context.loop-condition.stop-if-true", CTX);
  assert.equal(hijo(d, w.id, "loop-condition").config.mode, "stop-if-true");
  assert.equal(D.menuDe(cond), "context.loop-condition");

  // El For Loop tiene su propio menú, con Add Shift Register y sin Stop if True.
  let e = colocarBucle(ED.inicial(), "for-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const f = e.g.nodos.find((n) => n.tipo === "for-loop");
  e = ED.abrirMenu(e, D.menuDe(f), f.id, 0, 0);
  const fh = D.menuContextual(INV, e.menu, ED.marcados(e));
  assert.match(fh, /data-id="context\.for-loop\.configure-iteration-parallelism"/);
  assert.ok(!fh.includes("stop-if-true"));
  assert.equal((fh.match(/separador-menu/g) ?? []).length, 5);
  e = ED.orden(e, "context.for-loop.add-shift-register", CTX);
  assert.ok(e.g.nodos.some((n) => n.tipo === "shift-register-left"), "el For también");
  assert.equal(cajaDe(e, e.g.nodos.find((n) => n.tipo === "shift-register-left").id).y, nodoDe(e, f.id).y + 100 - 6, "sin punto de clic, en medio del bucle");
});

test("el menú de cada nodo del borde de un bucle enseña sus filas", () => {
  let d = colocarBucle(ED.inicial(), "for-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const f = d.g.nodos.find((n) => n.tipo === "for-loop").id;
  d = ED.orden(ED.abrirMenu(d, "context.for-loop", f, 0, 0), "context.for-loop.add-shift-register", CTX);
  d = poner(d, "increment", { x: 200, y: 150 });
  const [inc] = d.seleccion;
  d = poner(d, "const", { x: 20, y: 200 });
  d = cablear(d, terminal(d, d.g.nodos.at(-1).id, "result"), terminal(d, inc, "x"));
  d = poner(d, "increment", { x: 480, y: 200 });
  d = cablear(d, terminal(d, inc, "result"), terminal(d, d.seleccion[0], "x"));
  const esperado = {
    "tunnel-in": ["enable-indexing", "replace-with-shift-register", "numeric-palette", "create", "remove-and-rewire", "properties"],
    "tunnel-out": ["tunnel-mode", "replace-with-shift-register", "numeric-palette", "create", "remove-and-rewire", "properties"],
    "loop-iteration": ["create-constant", "create-control", "create-indicator", "create-channel-writer", "numeric-palette", "properties"],
    "loop-count": ["create-constant", "create-control", "create-indicator", "numeric-palette", "remove-and-rewire", "properties"],
    "shift-register-left": ["help", "add-element", "remove-element", "remove-all", "replace-with-tunnels", "replace-with-feedback-node", "numeric-palette", "create", "remove-and-rewire", "properties"],
    "shift-register-right": ["help", "add-element", "remove-element", "remove-all", "replace-with-tunnels", "replace-with-feedback-node", "numeric-palette", "create", "remove-and-rewire", "properties"],
  };
  for (const [tipo, filas] of Object.entries(esperado)) {
    const n = d.g.nodos.find((k) => k.tipo === tipo);
    assert.ok(n, tipo);
    const raiz = D.menuDe(n);
    const abierto = ED.abrirMenu(d, raiz, n.id, 0, 0);
    assert.deepEqual(idsPintados(D.menuContextual(INV, abierto.menu, ED.marcados(abierto))).map((id) => id.slice(raiz.length + 1)), filas, tipo);
  }
  assert.equal(D.menuDe(d.g.nodos.find((n) => n.tipo === "shift-register-left")), "context.shift-register");
});

// menu-tunel-salida.png y menu-tunel-modo.png: Tunnel Mode, con Last Value marcado.
test("el menú de un túnel de salida marca last value", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const w = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  d = poner(d, "increment", { x: 200, y: 150 });
  const [inc] = d.seleccion;
  d = poner(d, "increment", { x: 480, y: 200 });
  d = cablear(d, terminal(d, inc, "result"), terminal(d, d.seleccion[0], "x"));
  const t = d.g.nodos.find((n) => n.tipo === "tunnel-out");
  assert.equal(t.dentro, w);
  d = ED.abrirMenu(d, D.menuDe(t), t.id, 0, 0);
  assert.ok(ED.marcados(d).has("context.loop-tunnel-output.tunnel-mode.last-value"));
  const html = D.menuContextual(INV, ED.sobreMenu(d, "context.loop-tunnel-output.tunnel-mode", true).menu, ED.marcados(d));
  assert.match(html, /class="item-menu marcado" data-id="context\.loop-tunnel-output\.tunnel-mode\.last-value"/);
  assert.match(html, /class="item-menu" data-id="context\.loop-tunnel-output\.tunnel-mode\.indexing"/);
  assert.match(html, /class="item-menu hueco" data-id="context\.loop-tunnel-output\.tunnel-mode\.concatenating"/);
  assert.match(html, /class="item-menu hueco" data-id="context\.loop-tunnel-output\.tunnel-mode\.conditional"/);
  // Last Value es lo único que hace el compilador; elegirlo no cambia nada.
  const antes = d.g;
  assert.equal(ED.orden(d, "context.loop-tunnel-output.tunnel-mode.last-value", CTX).g, antes);
});

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";

// Lo hecho con el ratón es el mismo grafo que compila y ejecuta el núcleo: un
// For de 5 vueltas con un shift register que parte de 7 suma 0 + 1 + 2 + 3 + 4.
test("un bucle hecho con el ratón se compila y se ejecuta", async () => {
  let d = colocarBucle(ED.inicial(), "for-loop", { x: 200, y: 100 }, { x: 500, y: 300 });
  const f = d.g.nodos.find((n) => n.tipo === "for-loop").id;
  d = ED.orden(ED.abrirMenu(d, "context.for-loop", f, 0, 0, null, { x: 200, y: 200 }), "context.for-loop.add-shift-register", CTX);
  const [izq, der] = [d.g.nodos.find((n) => n.tipo === "shift-register-left").id, d.g.nodos.find((n) => n.tipo === "shift-register-right").id];
  const nuevo = (bloque, p) => {
    d = poner(d, bloque, p);
    return d.seleccion[0];
  };
  const cinco = nuevo("const", { x: 40, y: 100 });
  d = { ...d, g: Gr.fijarValor(d.g, cinco, 5) };
  const siete = nuevo("const", { x: 40, y: 200 });
  d = { ...d, g: Gr.fijarValor(d.g, siete, 7) };
  const suma = nuevo("add", { x: 300, y: 160 });
  const acum = nuevo("indicator", { x: 600, y: 200 });
  assert.equal(nodoDe(d, suma).dentro, f);
  d = cablear(d, terminal(d, cinco, "result"), terminal(d, hijo(d, f, "loop-count").id, "count"));
  d = cablear(d, terminal(d, siete, "result"), terminal(d, izq, "init"));
  d = cablear(d, terminal(d, izq, "value"), terminal(d, suma, "a"));
  d = cablear(d, terminal(d, hijo(d, f, "loop-iteration").id, "i"), terminal(d, suma, "b"));
  d = cablear(d, terminal(d, suma, "result"), terminal(d, der, "value"));
  d = cablear(d, terminal(d, der, "result"), terminal(d, acum, "value"));
  assert.equal(d.aviso, null);
  assert.ok(!d.g.nodos.some((n) => n.tipo.startsWith("tunnel")), "todos los cables cruzan por shift register o por los terminales: sin túneles");
  const c = compilar(d.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const escritos = await ejecutar(c, {});
  assert.equal(escritos[acum], 7 + 0 + 1 + 2 + 3 + 4);
});

// ——— Case Structure (M4): lo que hace LabVIEW 2026 Q3 en labview-captures/structures/case-*.png ———

import { etiquetaMarco, medidasSelector, oculto } from "../../editor/src/block-diagram/diagram-view.mjs";

/** Un Case de 300 × 250 en (800, 400), el de case-1.png. */
const case1 = () => colocarBucle(ED.inicial(), "case-structure", { x: 800, y: 400 }, { x: 1100, y: 650 });
const casoDe = (d) => d.g.nodos.find((n) => n.tipo === "case-structure");
const etiquetas = (d) => marcosDeCase(d).map(etiquetaMarco);
const marcosDeCase = (d) => casoDe(d).config.marcos;
const menuCase = (d, id, x = 0, y = 0) => ED.abrirMenu(d, "context.case-structure", id ?? casoDe(d).id, x, y);

test("un case se coloca con dos clics o arrastrando y sólo se ve su marco activo", () => {
  let d = case1();
  const c = casoDe(d);
  assert.deepEqual([c.x, c.y, c.tam.ancho, c.tam.alto], [800, 400, 300, 250]);
  assert.deepEqual(etiquetas(d), ["False", "True"], "de fábrica, False y True, y se ve True");
  assert.equal(c.config.activo, 1);
  const sel = hijo(d, c.id, "case-selector");
  assert.deepEqual([cajaDe(d, sel.id).x, cajaDe(d, sel.id).y, cajaDe(d, sel.id).ancho, cajaDe(d, sel.id).alto], [800, 513, 8, 12], "el selector, en la mitad del lado izquierdo (case-1.png)");

  // Un nodo soltado dentro cae en el marco que se ve; al ver otro marco ya no se pinta ni se pulsa.
  d = poner(d, "increment", { x: 900, y: 500 });
  const [verdadero] = d.seleccion;
  assert.equal(nodoDe(d, verdadero).dentro, c.id);
  assert.equal(nodoDe(d, verdadero).marco, 1);
  assert.ok(D_contenido(d).includes(`data-nodo="${verdadero}"`));
  d = { ...d, seleccion: [verdadero] };
  d = ED.mostrarMarco(d, c.id, 0);
  assert.ok(!D_contenido(d).includes(`data-nodo="${verdadero}"`), "lo del otro marco no se pinta");
  assert.deepEqual(d.seleccion, [], "ni queda seleccionado");
  assert.ok(oculto(d.g, nodoDe(d, verdadero)));
  d = poner(d, "decrement", { x: 900, y: 500 });
  const [falso] = d.seleccion;
  assert.equal(nodoDe(d, falso).marco, 0, "y lo nuevo cae en el que se ve");
  // Seleccionar arrastrando un rectángulo sólo toca lo que se ve.
  const rodeados = D.dentroDe(d.g, CTX, { x0: 850, y0: 450, x1: 1000, y1: 560 });
  assert.deepEqual(rodeados, [falso]);

  // Arrastrando un rectángulo mínimo: 48 × 48 sobre su centro (case-minimo2.png).
  let e = ED.moverA(ED.coger(ED.inicial(), "case-structure"), CTX, { x: 1480, y: 600 });
  e = ED.pulsar(e, CTX, FONDO, { x: 1480, y: 600 });
  e = ED.moverA(e, CTX, { x: 1490, y: 610 });
  e = ED.soltar(e, CTX, FONDO, { x: 1490, y: 610 });
  const mini = casoDe(e);
  assert.deepEqual([mini.x, mini.y, mini.tam.ancho, mini.tam.alto], [1461, 581, 48, 48]);

  // Seleccionado enseña sólo las asas, sin tinte ni contorno (case-seleccion.png).
  const html = D_contenido({ ...d, seleccion: [c.id] });
  assert.equal((html.match(/class="asa asa-estructura"/g) ?? []).length, 8);
  assert.ok(!html.includes("tinte-estructura"));
});

test("las flechas y la lista del selector cambian de marco", () => {
  let d = case1();
  const c = casoDe(d);
  const zona = (zona) => ({ tipo: "marco", nodo: c.id, zona });
  // Las flechas dan la vuelta: de True, la siguiente va a False (case-3.png).
  d = ED.pulsar(d, CTX, zona("siguiente"), { x: 1376, y: 409 });
  assert.equal(casoDe(d).config.activo, 0);
  d = ED.pulsar(d, CTX, zona("anterior"), { x: 925, y: 409 });
  assert.equal(casoDe(d).config.activo, 1, "la anterior de False es True");
  assert.equal(etiquetaMarco(marcosDeCase(d)[1]), "True");

  // El triángulo abre la lista en el punto del clic, con la marca en el marco que se ve (case-lista.png).
  d = ED.pulsar(d, CTX, zona("lista"), { x: 978, y: 409 });
  assert.deepEqual(d.lista, { nodo: c.id, x: 978, y: 409 });
  const html = D_contenido(d);
  assert.match(html, /<div class="menu-contextual lista-marcos" style="left:978px;top:409px/);
  assert.equal((html.match(/class="item-menu item-marco/g) ?? []).length, 2);
  assert.match(html, /class="item-menu item-marco marcado" data-nodo="[^"]+" data-marco="1"/);
  // Una fila muestra ese marco y cierra la lista; pulsar fuera, sólo la cierra.
  const otra = ED.pulsar(d, CTX, { tipo: "fila-marco", nodo: c.id, k: 0 }, { x: 990, y: 420 });
  assert.equal(casoDe(otra).config.activo, 0);
  assert.equal(otra.lista, null);
  assert.equal(casoDe(ED.pulsar(d, CTX, FONDO, { x: 0, y: 0 })).config.activo, 1);
  assert.equal(ED.escape(d).lista, null);
  // Un clic en el texto no hace nada.
  assert.equal(ED.pulsar(case1(), CTX, zona("texto"), { x: 940, y: 409 }).g.nodos.length, case1().g.nodos.length);
});

// case-3.png y case-lista.png: con un entero cableado al selector, los marcos
// pasan de False y True a «0, Default» y «1», y se sigue viendo el mismo.
test("al cablear un número al selector los marcos pasan a 0 Default y 1", () => {
  let d = case1();
  const c = casoDe(d);
  d = poner(d, "num-const", { x: 700, y: 520 });
  const [k] = d.seleccion;
  d = cablear(d, terminal(d, k, "result"), terminal(d, hijo(d, c.id, "case-selector").id, "selector"));
  assert.equal(d.aviso, null);
  assert.deepEqual(etiquetas(d), ["0, Default", "1"]);
  assert.equal(casoDe(d).config.activo, 1, "se sigue viendo el mismo marco");
  // Un DBL también: la cuña de coerción roja en el selector y el terminal, azul (case-dbl1.png).
  let e = case1();
  e = poner(e, "const", { x: 700, y: 520 });
  e = cablear(e, terminal(e, e.seleccion[0], "result"), terminal(e, hijo(e, casoDe(e).id, "case-selector").id, "selector"));
  assert.deepEqual(etiquetas(e), ["0, Default", "1"]);
  const html = D_contenido(e);
  assert.match(html, /class="coercion"/);
  assert.match(html, /<svg class="terminal-selector"[^>]*><rect[^>]*stroke="#0000ff"/, "el selector, azul como un entero");
  // Sin nada cableado es booleano y verde.
  assert.match(D_contenido(case1()), /<svg class="terminal-selector"[^>]*><rect[^>]*stroke="#007f00"/);
});

// case-edit1..5.png: se escribe en el texto del selector; «2..4», «7, 9» y «Default».
test("escribir en el selector de marcos cambia los valores del marco", () => {
  let d = case1();
  d = poner(d, "num-const", { x: 700, y: 520 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, hijo(d, casoDe(d).id, "case-selector").id, "selector"));
  const c = casoDe(d).id;
  d = ED.editarMarco(d, c);
  assert.deepEqual(d.edicion, { nodo: c, marco: true, texto: "1", todo: true });
  for (const t of "2..4") d = ED.teclear(d, t);
  d = ED.confirmar(d, CTX);
  assert.deepEqual(etiquetas(d), ["0, Default", "2..4"]);
  assert.deepEqual(marcosDeCase(d)[1].valores, [{ min: 2, max: 4 }]);

  d = ED.editarMarco(d, c);
  for (const t of "7, 9") d = ED.teclear(d, t);
  d = ED.confirmar(d, CTX);
  assert.deepEqual(marcosDeCase(d)[1].valores, [7, 9]);
  // «Default» escrito en otro marco se lo quita al que lo tenía (case-edit5.png).
  d = ED.editarMarco(d, c);
  for (const t of "7, 9, Default") d = ED.teclear(d, t);
  d = ED.confirmar(d, CTX);
  assert.deepEqual(etiquetas(d), ["0", "7, 9, Default"]);
  // Lo que no se entiende deja el marco como estaba; Esc también.
  d = ED.editarMarco(d, c);
  for (const t of "hola") d = ED.teclear(d, t);
  assert.deepEqual(etiquetas(ED.confirmar(d, CTX)), ["0", "7, 9, Default"]);
  assert.deepEqual(etiquetas({ ...ED.escape(d), g: d.g }), ["0", "7, 9, Default"]);
  // Los rangos abiertos y la tabla de lo que se entiende.
  assert.deepEqual(ED.leerMarco("..4, 7.."), { valores: [{ max: 4 }, { min: 7 }] });
  assert.deepEqual(ED.leerMarco(" -3 , 5..9 ,default"), { valores: [-3, { min: 5, max: 9 }], default: true });
  assert.deepEqual(ED.leerMarco(""), { valores: [] });
  assert.equal(ED.leerMarco("1.5"), null);
  // El texto que se escribe se pinta con su selección, o con su cursor, en el selector.
  const escribiendo = ED.editarMarco(d, c);
  assert.match(D_contenido(escribiendo), /<rect x="11" y="3"[^>]*fill="#000"\/><text[^>]*texto-blanco/);
  assert.match(D_contenido(ED.teclear(escribiendo, "5")), /class="caret-selector"/);
  // Un Case booleano no acepta números en su selector.
  let b = case1();
  b = ED.editarMarco(b, casoDe(b).id);
  b = ED.confirmar(ED.teclear(b, "3"), CTX);
  assert.deepEqual(etiquetas(b), ["False", "True"]);
  b = ED.editarMarco(b, casoDe(b).id);
  for (const t of "True, 1") b = ED.teclear(b, t);
  assert.deepEqual(etiquetas(ED.confirmar(b, CTX)), ["False", "True"]);
});

// case-menu-borde*.png, case-lista2.png, case-9.png, case-10.png y case-11.png.
test("los menús de un case añaden quitan y marcan el default", () => {
  let d = case1();
  const c = casoDe(d).id;
  const hacer = (d, fila) => ED.orden(menuCase(d), `context.case-structure.${fila}`, CTX);
  const variante = (d) => ED.variantes(menuCase(d));

  // Booleano: Add Case After añade un marco sin valores tras el que se ve y lo muestra (case-lista-boolean).
  let b = hacer(ED.mostrarMarco(d, c, 0), "add-case-after");
  assert.deepEqual(etiquetas(b), ["False", "", "True"]);
  assert.equal(casoDe(b).config.activo, 1);
  // Las filas del menú booleano: Show Case True / Make This Case True, y no las numéricas (case-menu-borde.png).
  const v = variante(ED.mostrarMarco(d, c, 0));
  assert.equal(v.rotulos.get("context.case-structure.show-case-other"), "Show Case True");
  assert.equal(variante(d).rotulos.get("context.case-structure.make-this-case-other"), "Make This Case False");
  assert.ok(v.ocultos.has("context.case-structure.show-case") && v.ocultos.has("context.case-structure.radix"));
  const html = D.menuContextual(INV, menuCase(ED.mostrarMarco(d, c, 0)).menu, new Set(), undefined, v);
  assert.match(html, /Show Case True/);
  assert.ok(!html.includes("Swap Diagram With Case"));
  assert.ok(!html.includes("Rearrange Cases"));
  // Show Case True muestra el otro marco.
  assert.equal(casoDe(hacer(ED.mostrarMarco(d, c, 0), "show-case-other")).config.activo, 1);

  // Numérico: un entero al selector, y los marcos del ejemplo de LabVIEW: 0 Default, 1; tras el 0, el 2.
  d = poner(d, "num-const", { x: 700, y: 520 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, hijo(d, c, "case-selector").id, "selector"));
  d = hacer(ED.mostrarMarco(d, c, 0), "add-case-after");
  assert.deepEqual(etiquetas(d), ["0, Default", "2", "1"], "el marco nuevo lleva el primer entero libre, y va tras el que se veía");
  assert.equal(casoDe(d).config.activo, 1);
  // Add Case Before: tras el 2..4 de otro, el 5 (case-9.png).
  d = { ...d, g: Gr.fijarMarcos(d.g, CAT, c, [{ de: 0, valores: [0], default: true }, { de: 1, valores: [{ min: 2, max: 4 }] }, { de: 2, valores: [7, 9] }]) };
  d = hacer(ED.mostrarMarco(d, c, 2), "add-case-before");
  assert.deepEqual(etiquetas(d), ["0, Default", "2..4", "5", "7, 9"]);
  assert.equal(casoDe(d).config.activo, 2);
  // Las filas numéricas (case-menu-borde-num.png): Remove Default sólo en el Default, y Make This The Default en los demás.
  const num = (d) => D.menuContextual(INV, menuCase(d).menu, new Set(), undefined, variante(d));
  assert.match(num(d), /Make This The Default Case/);
  assert.ok(!num(d).includes("Remove Default"));
  assert.match(num(ED.mostrarMarco(d, c, 0)), /Remove Default/);
  assert.match(num(d), /Swap Diagram With Case/);
  assert.ok(!num(d).includes("Show Case True"));

  // Make This The Default Case: «5, Default», y los demás dejan de serlo (case-10.png).
  d = hacer(d, "make-this-the-default-case");
  assert.deepEqual(etiquetas(d), ["0", "2..4", "5, Default", "7, 9"]);
  // Remove Default lo quita.
  d = hacer(d, "remove-default");
  assert.deepEqual(etiquetas(d), ["0", "2..4", "5", "7, 9"]);
  // Delete This Case quita el marco que se ve y todo lo suyo, y se ve el que ocupa su sitio (case-11.png).
  d = poner(d, "increment", { x: 900, y: 500 });
  const [dentro] = d.seleccion;
  assert.equal(nodoDe(d, dentro).marco, 2);
  d = hacer(d, "delete-this-case");
  assert.deepEqual(etiquetas(d), ["0", "2..4", "7, 9"]);
  assert.equal(casoDe(d).config.activo, 2);
  assert.equal(nodoDe(d, dentro), undefined, "lo de dentro se va con él");
  // Un Case con un solo marco no puede quedarse sin él.
  let uno = { ...d, g: Gr.fijarMarcos(d.g, CAT, c, [{ de: 0, valores: [0], default: true }]) };
  assert.deepEqual(etiquetas(hacer(uno, "delete-this-case")), ["0, Default"]);
  // Las filas hechas del inventario y las que no.
  for (const fila of ["add-case-after", "add-case-before", "delete-this-case", "make-this-the-default-case", "remove-default", "show-case-other"]) assert.equal(INV.resolver(`context.case-structure.${fila}`).estado, "built", fila);
  for (const fila of ["duplicate-case", "remove-empty-cases", "swap-diagram-with-case", "rearrange-cases", "radix", "auto-grow"]) assert.equal(INV.resolver(`context.case-structure.${fila}`).estado, "todo", fila);
  assert.ok(ED.marcados(menuCase(d)).has("context.case-structure.auto-grow"), "Auto Grow sale marcado");
});

// case-menu-terminal-selector.png, case-menu-tunel-entrada.png y case-menu-tunel-salida.png.
test("el menú de cada nodo del borde de un case enseña sus filas", () => {
  let d = case1();
  const c = casoDe(d).id;
  d = poner(d, "increment", { x: 900, y: 500 });
  const [inc] = d.seleccion;
  d = poner(d, "const", { x: 700, y: 560 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, inc, "x"));
  d = poner(d, "increment", { x: 1200, y: 500 });
  d = cablear(d, terminal(d, inc, "result"), terminal(d, d.seleccion[0], "x"));
  const esperado = {
    "case-selector": ["create-constant", "create-control", "create-indicator", "boolean-palette", "remove-and-rewire", "properties"],
    "tunnel-in": ["replace-with-case-selector", "numeric-palette", "create", "remove-and-rewire", "properties"],
    "case-tunnel-out": ["use-default-if-unwired", "linked-input-tunnel", "numeric-palette", "create", "remove-and-rewire", "properties"],
  };
  for (const [tipo, filas] of Object.entries(esperado)) {
    const n = d.g.nodos.find((k) => k.tipo === tipo);
    assert.ok(n, tipo);
    const raiz = D.menuDe(n, null, d.g);
    const abierto = ED.abrirMenu(d, raiz, n.id, 0, 0);
    assert.deepEqual(idsPintados(D.menuContextual(INV, abierto.menu, ED.marcados(abierto), undefined, ED.variantes(abierto))).map((id) => id.slice(raiz.length + 1)), filas, tipo);
  }
  // Con un número cableado, el selector dice Numeric Palette.
  d = poner(d, "num-const", { x: 700, y: 620 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, hijo(d, c, "case-selector").id, "selector"));
  const sel = ED.abrirMenu(d, "context.case-selector", hijo(d, c, "case-selector").id, 0, 0);
  assert.ok(idsPintados(D.menuContextual(INV, sel.menu, new Set(), undefined, ED.variantes(sel))).includes("context.case-selector.numeric-palette"));
  // Y un túnel de entrada de un bucle sigue con su menú.
  assert.equal(D.menuDe({ tipo: "tunnel-in", dentro: "no-es-un-case" }, null, d.g), "context.loop-tunnel-input");
});

// case-5.png y case-7.png: el túnel de salida sale hueco si algún marco no lo
// cablea, y con Use Default If Unwired, relleno con un punto.
test("use default if unwired cambia el túnel de salida del case", () => {
  let d = case1();
  const c = casoDe(d).id;
  d = poner(d, "const", { x: 900, y: 500 });
  const [k] = d.seleccion;
  d = poner(d, "indicator", { x: 1250, y: 500 });
  d = cablear(d, terminal(d, k, "result"), terminal(d, d.seleccion[0], "value"));
  const t = d.g.nodos.find((n) => n.tipo === "case-tunnel-out");
  assert.ok(t, "el cable que sale del marco pasa por un túnel de salida del Case");
  assert.equal(t.dentro, c);
  assert.equal(cajaDe(d, t.id).x, 800 + 300 - 9, "pegado al lado derecho");
  assert.ok(d.g.cables.some((e) => e.a.nodo === t.id && e.a.puerto === "x-1"), "por la entrada del marco que se ve");
  const tunel = (d) => D_contenido(d).match(/<svg class="tunel"[^>]*>.*?<\/svg>/g).at(-1);
  assert.match(tunel(d), /<rect x="2" y="2" width="5" height="5" fill="#fff"\/>/, "hueco: el otro marco no lo cablea");
  d = ED.orden(ED.abrirMenu(d, "context.case-tunnel-output", t.id, 0, 0), "context.case-tunnel-output.use-default-if-unwired", CTX);
  assert.equal(nodoDe(d, t.id).config["use-default"], true);
  assert.match(tunel(d), /<rect x="3" y="3" width="3" height="3" fill="#fff"\/><rect x="4" y="4" width="1" height="1"/, "con punto");
  assert.ok(ED.marcados(ED.abrirMenu(d, "context.case-tunnel-output", t.id, 0, 0)).has("context.case-tunnel-output.use-default-if-unwired"));
  // Cableado en los dos marcos, sale relleno.
  d = ED.orden(ED.abrirMenu(d, "context.case-tunnel-output", t.id, 0, 0), "context.case-tunnel-output.use-default-if-unwired", CTX);
  d = ED.mostrarMarco(d, c, 0);
  d = poner(d, "const", { x: 900, y: 500 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, t.id, "x-0"));
  assert.ok(d.g.cables.some((e) => e.a.nodo === t.id && e.a.puerto === "x-0"));
  assert.ok(!/<rect x="2" y="2" width="5" height="5" fill="#fff"\/>|<rect x="3" y="3"/.test(tunel(d)), "relleno");
  // Un cable no une dos marcos.
  const otra = poner(ED.mostrarMarco(d, c, 1), "increment", { x: 960, y: 560 });
  assert.ok(otra.g.nodos.length > d.g.nodos.length);
});

// Un Case hecho con el ratón es el mismo grafo que compila y ejecuta el núcleo:
// un entero al selector elige el marco (el Default recoge lo demás) y el túnel
// de salida da el valor de la constante de ese marco.
test("un case hecho con el ratón se compila y se ejecuta", async () => {
  let d = colocarBucle(ED.inicial(), "case-structure", { x: 200, y: 100 }, { x: 500, y: 350 });
  const c = casoDe(d).id;
  d = poner(d, "num-const", { x: 40, y: 200 });
  const sel = d.seleccion[0];
  d = cablear(d, terminal(d, sel, "result"), terminal(d, hijo(d, c, "case-selector").id, "selector"));
  d = ED.orden(menuCase(ED.mostrarMarco(d, c, 1), c), "context.case-structure.add-case-after", CTX);
  assert.deepEqual(etiquetas(d), ["0, Default", "1", "2"]);
  d = poner(d, "indicator", { x: 600, y: 200 });
  const ind = d.seleccion[0];
  let tunel;
  for (const k of [0, 1, 2]) {
    d = ED.mostrarMarco(d, c, k);
    d = poner(d, "const", { x: 300, y: 200 });
    const cte = d.seleccion[0];
    d = { ...d, g: Gr.fijarValor(d.g, cte, 100 + k) };
    if (k === 0) d = cablear(d, terminal(d, cte, "result"), terminal(d, ind, "value"));
    else d = cablear(d, terminal(d, cte, "result"), terminal(d, tunel, `x-${k}`));
    tunel = d.g.nodos.find((n) => n.tipo === "case-tunnel-out").id;
  }
  assert.equal(d.aviso, null);
  assert.equal(d.g.cables.filter((e) => e.a.nodo === tunel).length, 3, "una entrada cableada por marco");
  for (const [valor, esperado] of [[2, 102], [1, 101], [0, 100], [9, 100]]) {
    const g = Gr.fijarValor(d.g, sel, valor);
    const comp = compilar(g, CAT);
    assert.ok(!comp.errores, JSON.stringify(comp.errores));
    assert.equal((await ejecutar(comp, {}))[ind], esperado, `selector ${valor}`);
  }
});

// ——— Flat y Stacked Sequence (M4): lo que hace LabVIEW 2026 Q3 en labview-captures/structures/secuencia-*.png ———

/** Una Flat de 250 × 200 en (850, 450), la de secuencia-2.png: un marco de 240. */
const flat1 = () => colocarBucle(ED.inicial(), "flat-sequence", { x: 850, y: 450 }, { x: 1100, y: 650 });
const secuenciaDe = (d) => d.g.nodos.find((n) => n.tipo === "flat-sequence" || n.tipo === "stacked-sequence");
const anchos = (d) => D.anchosMarcos(secuenciaDe(d));
/** Una orden del menú de la secuencia, con el clic derecho en la x dada del borde de abajo. */
const ordenSec = (d, fila, x = 1000) => {
  const s = secuenciaDe(d);
  return ED.orden(ED.abrirMenu(d, `context.${s.tipo}`, s.id, 0, 0, null, { x, y: s.y + s.tam.alto - 5 }), `context.${s.tipo}.${fila}`, CTX);
};

test("una flat sequence se coloca se estira y reparte sus marcos", () => {
  let d = flat1();
  let s = secuenciaDe(d);
  assert.equal(s.tipo, "flat-sequence");
  assert.deepEqual([s.x, s.y, s.tam.ancho, s.tam.alto], [850, 450, 250, 200]);
  assert.deepEqual(anchos(d), [240], "un marco: 250 menos 5 de borde a cada lado");
  assert.ok(!("activo" in s.config), "una Flat enseña todos sus marcos");

  // Un clic sin mover deja 48 × 48 —un marco de 38, el mínimo de LabVIEW— (secuencia-16.png).
  let e = ED.moverA(ED.coger(ED.inicial(), "flat-sequence"), CTX, { x: 855, y: 765 });
  e = ED.pulsar(e, CTX, FONDO, { x: 855, y: 765 });
  e = ED.moverA(e, CTX, { x: 857, y: 767 });
  e = ED.pulsar(e, CTX, FONDO, { x: 857, y: 767 });
  assert.deepEqual([secuenciaDe(e).tam.ancho, secuenciaDe(e).tam.alto, anchos(e)[0]], [48, 48, 38]);

  // Add Frame After: un marco de 38 detrás, y la estructura crece 43 (secuencia-3.png: 293 de ancho).
  d = ordenSec(d, "add-frame-after");
  assert.deepEqual(anchos(d), [240, 38]);
  assert.equal(secuenciaDe(d).tam.ancho, 293);
  assert.deepEqual(D.izquierdasMarcos(secuenciaDe(d)), [5, 250], "el segundo empieza 5 px (el separador) tras el primero");

  // Estirarla por la asa de la derecha estira el último marco (secuencia-4.png: de 38 a 336).
  const asa = (lado, p) => ({ tipo: "asa", nodo: secuenciaDe(d).id, lado, p });
  d = ED.pulsar(d, CTX, asa("e"), { x: 1143, y: 550 });
  d = ED.moverA(d, CTX, { x: 1441, y: 550 });
  d = ED.soltar(d, CTX, FONDO, { x: 1441, y: 550 });
  assert.deepEqual(anchos(d), [240, 336]);
  assert.equal(secuenciaDe(d).tam.ancho, 591);
  // Y por la de la izquierda, el primero; el último no se mueve.
  d = ED.pulsar(d, CTX, asa("w"), { x: 850, y: 550 });
  d = ED.moverA(d, CTX, { x: 800, y: 550 });
  d = ED.soltar(d, CTX, FONDO, { x: 800, y: 550 });
  assert.deepEqual(anchos(d), [290, 336]);
  assert.deepEqual([secuenciaDe(d).x, secuenciaDe(d).tam.ancho], [800, 641]);
  // Ningún marco baja de 38.
  d = ED.pulsar(d, CTX, asa("e"), { x: 1441, y: 550 });
  d = ED.moverA(d, CTX, { x: 900, y: 550 });
  d = ED.soltar(d, CTX, FONDO, { x: 900, y: 550 });
  assert.equal(anchos(d)[1], 38);
  assert.equal(secuenciaDe(d).tam.alto, 200);
  d = ED.pulsar(d, CTX, asa("s"), { x: 1000, y: 650 });
  d = ED.moverA(d, CTX, { x: 1000, y: 400 });
  d = ED.soltar(d, CTX, FONDO, { x: 1000, y: 400 });
  assert.equal(secuenciaDe(d).tam.alto, 48, "y la estructura, 48 de alto");
});

test("un nodo cae en el marco que tiene debajo y un cable no va a uno anterior", () => {
  let d = ordenSec(flat1(), "add-frame-after", 1000);
  d = ordenSec(d, "add-frame-after", 1000);
  assert.deepEqual(anchos(d), [240, 38, 38]);
  const s = secuenciaDe(d);
  // Soltar un nodo sobre cada marco: el 0 va de 855 a 1095; el 1, de 1100 a 1138; el 2, de 1143 a 1181.
  d = poner(d, "const", { x: 900, y: 520 });
  const [a] = d.seleccion;
  d = poner(d, "increment", { x: 1104, y: 520 });
  const [b] = d.seleccion;
  assert.deepEqual([nodoDe(d, a).dentro, nodoDe(d, a).marco, nodoDe(d, b).marco], [s.id, 0, 1]);
  // Un cable del marco 0 al 1 se puede; al revés, no (secuencia-15.png).
  d = cablear(d, terminal(d, a, "result"), terminal(d, b, "x"));
  assert.equal(d.aviso, null);
  assert.equal(d.g.cables.length, 1);
  d = poner(d, "increment", { x: 1000, y: 580 });
  const [z] = d.seleccion;
  assert.equal(nodoDe(d, z).marco, 0);
  d = cablear(d, terminal(d, b, "result"), terminal(d, z, "x"));
  assert.match(d.aviso.texto, /después/, "de un marco a uno anterior, no");
  d = { ...d, aviso: null, g: Gr.borrar(d.g, [z]) };
  // Arrastrar la constante del marco 0 al marco 2 la cambia de marco, y el cable, que iría hacia atrás, se rompe.
  d = arrastrar(d, a, { x: 905, y: 525 }, { x: 1148, y: 525 });
  assert.equal(nodoDe(d, a).marco, 2);
  assert.equal(d.g.cables.length, 0);
  // Lo que cae en el separador entre dos marcos va al más cercano: el separador se reparte a medias.
  assert.deepEqual([1094, 1097, 1098, 1130, 1141, 1190].map((x) => D.marcoEnX(s, x)), [0, 0, 1, 1, 2, 2]);
});

test("los menús de una secuencia añaden y quitan marcos y la cambian de forma", () => {
  // Add Frame Before en el marco 1 de una Flat: el nuevo queda en medio y lo de la derecha se corre 43.
  let d = ordenSec(flat1(), "add-frame-after");
  d = poner(d, "increment", { x: 1104, y: 520 });
  const [n1] = d.seleccion;
  assert.equal(nodoDe(d, n1).marco, 1);
  const x0 = nodoDe(d, n1).x;
  d = ordenSec(d, "add-frame-before", 1110);
  assert.deepEqual(anchos(d), [240, 38, 38]);
  assert.equal(nodoDe(d, n1).marco, 2, "el nodo sigue a su marco");
  assert.equal(nodoDe(d, n1).x, x0 + 43, "y se corre con él");
  // Delete This Frame: el marco del clic se va con lo suyo y los de la derecha vuelven.
  d = ordenSec(d, "delete-this-frame", 1110);
  assert.deepEqual(anchos(d), [240, 38]);
  assert.equal(nodoDe(d, n1).x, x0);
  d = ordenSec(d, "delete-this-frame", 1110);
  assert.deepEqual(anchos(d), [240]);
  assert.ok(!nodoDe(d, n1), "lo que había en el marco borrado, también");
  assert.equal(secuenciaDe(ordenSec(d, "delete-this-frame")).config.marcos.length, 1, "el último marco no se borra");

  // Replace with Stacked Sequence: una sola caja del ancho del marco más ancho, con su selector; y de vuelta.
  d = ordenSec(d, "add-frame-after");
  d = poner(d, "const", { x: 900, y: 520 });
  const [c0] = d.seleccion;
  d = poner(d, "increment", { x: 1104, y: 520 });
  const [c1] = d.seleccion;
  const dx1 = nodoDe(d, c1).x - nodoDe(d, c0).x;
  d = ordenSec(d, "replace-with-stacked-sequence");
  let s = secuenciaDe(d);
  assert.equal(s.tipo, "stacked-sequence");
  assert.deepEqual([s.tam.ancho, s.config.activo, s.config.marcos.length], [250, 0, 2], "10 de bordes y el marco más ancho");
  assert.ok(s.config.marcos.every((m) => !("ancho" in m)));
  assert.deepEqual(D.textosMarcos(s), ["0 [0..1]", "1 [0..1]"]);
  assert.equal(nodoDe(d, c1).x - nodoDe(d, c0).x, dx1 - 245, "lo del segundo marco se coloca sobre el del primero");
  d = ordenSec(d, "add-frame-after");
  assert.equal(secuenciaDe(d).config.activo, 1, "Add Frame After en una Stacked pasa a ver el nuevo");
  d = ordenSec(d, "delete-this-frame");
  assert.deepEqual([secuenciaDe(d).config.marcos.length, secuenciaDe(d).config.activo], [2, 1]);
  d = ordenSec(d, "replace.replace-with-flat-sequence");
  s = secuenciaDe(d);
  assert.equal(s.tipo, "flat-sequence");
  assert.deepEqual(anchos(d), [240, 240]);
  assert.equal(s.tam.ancho, 495);
  assert.equal(nodoDe(d, c1).x - nodoDe(d, c0).x, dx1, "y cada uno vuelve a su marco");

  // Lo hecho y lo no hecho de los dos menús, en el inventario.
  for (const fila of ["replace-with-stacked-sequence", "add-frame-after", "add-frame-before", "delete-this-frame"]) assert.equal(INV.resolver(`context.flat-sequence.${fila}`).estado, "built", fila);
  for (const fila of ["replace", "replace.replace-with-flat-sequence", "add-frame-after", "add-frame-before", "delete-this-frame"]) assert.equal(INV.resolver(`context.stacked-sequence.${fila}`).estado, "built", fila);
  for (const fila of ["replace-with-timed-sequence", "remove-sequence", "auto-grow"]) assert.equal(INV.resolver(`context.flat-sequence.${fila}`).estado, "todo", fila);
  for (const fila of ["add-sequence-local", "duplicate-frame", "show-frame", "make-this-frame", "replace.replace-with-case-structure"]) assert.equal(INV.resolver(`context.stacked-sequence.${fila}`).estado, "todo", fila);
  assert.ok(ED.marcados(ED.abrirMenu(d, "context.flat-sequence", s.id, 0, 0)).has("context.flat-sequence.auto-grow"));
});

test("una stacked sequence enseña un marco con su selector", () => {
  let d = ordenSec(flat1(), "add-frame-after");
  d = poner(d, "const", { x: 900, y: 520 });
  const [a] = d.seleccion;
  d = poner(d, "increment", { x: 1104, y: 520 });
  const [b] = d.seleccion;
  d = cablear(d, terminal(d, a, "result"), terminal(d, b, "x"));
  assert.equal(d.g.cables.length, 1, "un cable de un marco al siguiente");
  d = ordenSec(d, "replace-with-stacked-sequence");
  const s = secuenciaDe(d);
  assert.equal(d.g.cables.length, 1, "al cambiarla de forma el cable se conserva: en una Stacked se ve como variable local");
  assert.match(D_contenido(d), /variable-local-secuencia/);
  assert.ok(!D.oculto(d.g, nodoDe(d, a)) && D.oculto(d.g, nodoDe(d, b)), "sólo se ve lo del marco activo");
  const zona = (zona) => ({ tipo: "marco", nodo: s.id, zona });
  d = ED.pulsar(d, CTX, zona("siguiente"), { x: 1000, y: 459 });
  assert.equal(secuenciaDe(d).config.activo, 1);
  assert.ok(D.oculto(d.g, nodoDe(d, a)) && !D.oculto(d.g, nodoDe(d, b)));
  d = ED.pulsar(d, CTX, zona("siguiente"), { x: 1000, y: 459 });
  assert.equal(secuenciaDe(d).config.activo, 0, "las flechas dan la vuelta");
  d = ED.pulsar(d, CTX, zona("lista"), { x: 1000, y: 459 });
  assert.match(D.contenido(d, CTX, tipos(d.g, CAT)), /class="item-menu item-marco marcado"[^>]*data-marco="0"[^>]*><span class="texto-menu" style="[^"]*">0 \[0\.\.1\]</);
  // El texto del selector no se escribe: sus valores son los números de marco.
  assert.equal(ED.editarMarco(d, s.id), d);
  // Show Frame y Make This Frame dicen el número del otro con dos marcos (secuencia-menu-stacked.png).
  const v = ED.variantes(ED.abrirMenu(d, "context.stacked-sequence", s.id, 0, 0));
  assert.equal(v.rotulos.get("context.stacked-sequence.show-frame"), "Show Frame 1");
  assert.equal(v.rotulos.get("context.stacked-sequence.make-this-frame"), "Make This Frame 1");
});

// Una Flat hecha con el ratón se compila y se ejecuta: la constante del marco 0 pasa al 1.
test("una secuencia hecha con el ratón se compila y se ejecuta", async () => {
  let d = ordenSec(flat1(), "add-frame-after");
  d = poner(d, "const", { x: 900, y: 520 });
  const c = d.seleccion[0];
  d = { ...d, g: Gr.fijarValor(d.g, c, 6) };
  d = poner(d, "increment", { x: 1104, y: 520 });
  const inc = d.seleccion[0];
  d = poner(d, "indicator", { x: 1300, y: 520 });
  const ind = d.seleccion[0];
  d = cablear(d, terminal(d, c, "result"), terminal(d, inc, "x"));
  d = cablear(d, terminal(d, inc, "result"), terminal(d, ind, "value"));
  assert.equal(d.aviso, null);
  assert.ok(d.g.nodos.some((n) => n.tipo === "tunnel-out" && n.dentro === secuenciaDe(d).id), "el cable sale de la secuencia por un túnel");
  const compilado = compilar(d.g, CAT);
  assert.ok(!compilado.errores, JSON.stringify(compilado.errores));
  const escritos = await ejecutar(compilado, {});
  assert.deepEqual(Object.values(escritos), [7]);
});

// ——— String (M3): labview-captures/string/bd-string-constant*.png ———

const nodoPorTipo = (d, tipo) => d.g.nodos.find((n) => n.tipo === tipo);

// Una constante de cadena mide, a 1:1, 15 × 19 px vacía y 22 × 34 con «ab» y «cd» en dos
// líneas; recién soltada queda lista para escribir, Intro baja de línea (no confirma) y se
// confirma con Enter Text o con un clic fuera.
test("una constante de cadena se escribe con varias líneas y mide lo que en LabVIEW", () => {
  let d = poner(ED.inicial(), "str-const", { x: 100, y: 100 });
  const c = nodoPorTipo(d, "str-const");
  assert.deepEqual(d.edicion, { nodo: c.id, texto: "", todo: false, cadena: true, nuevo: true }, "recién soltada queda lista para escribir");
  const medida = () => {
    const k = caja(nodoPorTipo(d, "str-const"), CTX, d.edicion);
    return [k.ancho, k.alto];
  };
  assert.deepEqual(medida(), [15, 19], "vacía: 15 × 19");
  for (const t of ["a", "b", "Enter", "c", "d"]) d = ED.teclear(d, t);
  assert.equal(d.edicion.texto, "ab\ncd", "Intro es un salto de línea");
  assert.deepEqual(medida().map(Math.round), [22, 34], "con dos líneas: 15 de alto por línea más 4");
  const html = contenido(d, CTX, tipos(d.g, CAT));
  assert.match(html, /class="constante cadena editando"/);
  assert.match(html, /border-color:#ff00ff/, "the border is pink");
  d = ED.confirmar(d, CTX);
  assert.equal(nodoPorTipo(d, "str-const").config.value, "ab\ncd");
  assert.equal(d.edicion, null);
  // Un doble clic vuelve a escribir, con todo seleccionado, y Esc la deja como estaba.
  d = ED.editar(d, CTX, c.id);
  assert.deepEqual([d.edicion.todo, d.edicion.cadena], [true, true]);
  d = ED.escape(ED.teclear(d, "x"));
  assert.equal(nodoPorTipo(d, "str-const").config.value, "ab\ncd");
  // Las constantes fijas (Empty String, Space…) no se editan y llevan su signo.
  const f = poner(ED.inicial(), "tab-constant", { x: 0, y: 0 });
  assert.equal(ED.editar(f, CTX, nodoPorTipo(f, "tab-constant").id), f, "una constante fija no se edita");
  assert.match(contenido(f, CTX, tipos(f.g, CAT)), /<span>⇥<\/span>/);
});

test("concatenate strings se estira por sus asas como compound arithmetic y mide 31 × 17 con dos entradas", () => {
  let d = poner(ED.inicial(), "concatenate-strings", { x: 80, y: 0 });
  const [cs] = ids(d);
  const k = caja(d.g.nodos[0], CTX);
  assert.deepEqual([k.ancho, k.alto], [31, 17]);
  const celda = D.medidasCompuesto(d.g.nodos[0], CTX).celda;
  assert.equal(celda, 8.5);
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: cs, lado: "abajo" }, { x: 90, y: 17 });
  d = ED.moverA(d, CTX, { x: 90, y: 17 + 2 * celda });
  d = ED.soltar(d, CTX, FONDO, { x: 90, y: 17 + 2 * celda });
  assert.equal(CAT.puertos(d.g.nodos[0]).in.length, 4, "dos celdas más");
  assert.equal(caja(d.g.nodos[0], CTX).alto, 34);
  assert.match(contenido(d, CTX, tipos(d.g, CAT)), /<text[^>]*>abc<\/text>/, "el símbolo del nodo es «abc»");
});

// Un VI de cadenas hecho con el ratón es el mismo grafo que compila y ejecuta el núcleo:
// «Hola, » y «mundo» concatenados, en mayúsculas y con su longitud.
test("un vi de cadenas hecho con el ratón se compila y se ejecuta", async () => {
  let d = ED.inicial();
  const nuevo = (bloque, p) => {
    d = poner(d, bloque, p);
    return d.seleccion[0];
  };
  const escribir = (id, texto) => {
    d = { ...d, g: Gr.fijarValor(d.g, id, texto), edicion: null };
  };
  const a = nuevo("str-const", { x: 40, y: 100 });
  escribir(a, "Hola, ");
  const b = nuevo("str-const", { x: 40, y: 200 });
  escribir(b, "mundo");
  const cat = nuevo("concatenate-strings", { x: 200, y: 140 });
  const mayus = nuevo("to-upper-case", { x: 300, y: 140 });
  const largo = nuevo("string-length", { x: 300, y: 220 });
  const ind = nuevo("str-indicator", { x: 450, y: 140 });
  const n = nuevo("indicator", { x: 450, y: 220 });
  d = cablear(d, terminal(d, a, "result"), terminal(d, cat, "string-0"));
  d = cablear(d, terminal(d, b, "result"), terminal(d, cat, "string-1"));
  d = cablear(d, terminal(d, cat, "concatenated-string"), terminal(d, mayus, "string"));
  d = cablear(d, terminal(d, cat, "concatenated-string"), terminal(d, largo, "string"));
  d = cablear(d, terminal(d, mayus, "all-upper-case-string"), terminal(d, ind, "value"));
  d = cablear(d, terminal(d, largo, "length"), terminal(d, n, "value"));
  assert.equal(d.aviso, null);
  const t = tipos(d.g, CAT);
  assert.equal(t.cables.size, 6);
  assert.ok([...t.cables.values()].every((k) => !k.roto));
  assert.ok([...t.cables.values()].filter((k) => k.tipo === "string").every((k) => !k.coercion), "las cadenas no necesitan coerción; la longitud (I32) a un indicador DBL, sí");
  const c = compilar(d.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const escritos = await ejecutar(c, {});
  assert.equal(escritos[ind], "HOLA, MUNDO");
  assert.equal(escritos[n], 11);
  // Un número no se puede cablear a una cadena.
  const num = nuevo("const", { x: 40, y: 300 });
  const roto = cablear(d, terminal(d, num, "result"), terminal(d, mayus, "string"));
  assert.ok([...tipos(roto.g, CAT).cables.values()].some((k) => k.roto), "un número en una entrada de cadena rompe el cable");
});

// array/tunel-for-indexado.png, tunel-salida-menu-modo.png: el túnel de un bucle indexado se pinta con un
// corchete del color del tipo, y su menú lo enciende y lo apaga (Tunnel Mode ▸ Indexing o Last Value en la
// salida; Enable o Disable Indexing en la entrada, que sólo vale si lo que llega es un array).
test("el menú de un túnel de un bucle cambia el indexado", () => {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = r.g;
  const f = r.id;
  r = Gr.crearNodo(g, CAT, "arr-const", 0, 0);
  g = Gr.fijarConfig(r.g, r.id, { type: { array: "number" }, value: [1, 2] });
  const a = r.id;
  r = Gr.crearNodo(g, CAT, "square", 0, 0);
  g = Gr.meter(r.g, CAT, [r.id], f);
  const q = r.id;
  g = Gr.conectarCruzando(g, CAT, { nodo: a, puerto: "result", dir: "out" }, { nodo: q, puerto: "x", dir: "in" }).g;
  r = Gr.crearNodo(g, CAT, "indicator", 0, 0);
  g = Gr.conectarCruzando(r.g, CAT, { nodo: q, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
  const ti = g.nodos.find((n) => n.tipo === "tunnel-in");
  const to = g.nodos.find((n) => n.tipo === "tunnel-out");
  assert.ok(ti.config.indexado && to.config.indexado, "en un For nacen indexados");
  const html = (n) => contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.match(html(), /class="glifo-borde"[^>]*>.*?#ffffcc/s, "el túnel indexado, con su fondo amarillo y su corchete");
  let d = { ...ED.inicial(), g };
  // Entrada: Disable Indexing, y vuelve Enable Indexing.
  d = ED.abrirMenu(d, D.menuDe(ti), ti.id, 0, 0);
  assert.equal(ED.variantes(d).rotulos.get("context.loop-tunnel-input.enable-indexing"), "Disable Indexing");
  d = ED.orden(d, "context.loop-tunnel-input.enable-indexing", CTX);
  assert.ok(!d.g.nodos.find((n) => n.id === ti.id).config.indexado);
  d = ED.orden(ED.abrirMenu(d, D.menuDe(ti), ti.id, 0, 0), "context.loop-tunnel-input.enable-indexing", CTX);
  assert.ok(d.g.nodos.find((n) => n.id === ti.id).config.indexado, "con un array cableado se puede volver a encender");
  // Salida: Indexing está marcado y Last Value lo apaga.
  d = ED.abrirMenu(d, D.menuDe(to), to.id, 0, 0);
  assert.ok(ED.marcados(d).has("context.loop-tunnel-output.tunnel-mode.indexing"));
  d = ED.orden(d, "context.loop-tunnel-output.tunnel-mode.last-value", CTX);
  assert.ok(!d.g.nodos.find((n) => n.id === to.id).config.indexado);
  assert.ok(ED.marcados(ED.abrirMenu(d, D.menuDe(to), to.id, 0, 0)).has("context.loop-tunnel-output.tunnel-mode.last-value"));
  // Un escalar no se indexa a la entrada.
  let h = Gr.nuevo();
  r = Gr.crearEstructura(h, CAT, "while-loop", 0, 0, 200, 150);
  h = r.g;
  const w = r.id;
  r = Gr.crearNodo(h, CAT, "const", 0, 0);
  const c = r.id;
  r = Gr.crearNodo(r.g, CAT, "square", 0, 0);
  h = Gr.meter(r.g, CAT, [r.id], w);
  h = Gr.conectarCruzando(h, CAT, { nodo: c, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "x", dir: "in" }).g;
  const ts = h.nodos.find((n) => n.tipo === "tunnel-in");
  const e = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: h }, D.menuDe(ts), ts.id, 0, 0), "context.loop-tunnel-input.enable-indexing", CTX);
  assert.ok(!e.g.nodos.find((n) => n.id === ts.id).config?.indexado, "con un escalar no se enciende");
});

// array/constante-array.png: la constante de array, de 25 px de alto, con su índice y la caja de sus
// elementos; se escribe en cada elemento y se estira para enseñar más.
test("la constante de array se escribe y se estira", () => {
  let d = ED.inicial();
  d = poner(d, "arr-const", { x: 100, y: 100 });
  const id = d.seleccion[0];
  let n = nodoDe(d, id);
  const k = caja(n, CTX);
  assert.equal(k.alto, 25);
  assert.equal(k.ancho, 32 + 15 + 4, "el índice, 33 menos el solape, y una caja de 15 + 4");
  // Doble clic en el primer elemento: se escribe, y un elemento nuevo rellena con ceros lo que falta.
  d = ED.editar(d, CTX, id, 0);
  for (const t of ["Backspace", "4", ",", "5"]) d = ED.teclear(d, t);
  d = ED.confirmar(d, CTX);
  assert.deepEqual(nodoDe(d, id).config.value, [4.5]);
  d = ED.editar(d, CTX, id, 3);
  d = ED.confirmar(ED.teclear(d, "7"), CTX);
  assert.deepEqual(nodoDe(d, id).config.value, [4.5, 0, 0, 7]);
  // Estirar por su asa de la derecha: un elemento más por cada ancho de caja.
  n = nodoDe(d, id);
  const w = D.anchoElementoArray(n, CTX);
  d = ED.pulsar({ ...d, seleccion: [id] }, CTX, { tipo: "asa", nodo: id, lado: "derecha" }, { x: 200, y: 110 });
  d = ED.moverA(d, CTX, { x: 200 + 2 * w, y: 110 });
  d = ED.soltar(d, CTX, FONDO, { x: 200 + 2 * w, y: 110 });
  assert.equal(nodoDe(d, id).config.visibles, 3);
  const html = contenido(d, CTX, tipos(d.g, CAT));
  assert.equal((html.match(/class="celda-array/g) ?? []).length, 3);
  assert.match(html, />4,5</);
  // Un booleano se alterna con el doble clic.
  let b = ED.inicial();
  b = poner(b, "arr-const", { x: 10, y: 10 });
  const bid = b.seleccion[0];
  b = { ...b, g: Gr.fijarConfig(b.g, bid, { type: { array: "boolean" }, value: [] }) };
  b = ED.editar(b, CTX, bid, 0);
  assert.deepEqual(nodoDe(b, bid).config.value, [true]);
});

// array-2d/constant-2d-menu-index.png, constant-2d-menu-shell.png and constant-1d-menu-index.png: the menu of an array
// constant is the same on the index and on the shell, and has Add Dimension and Remove Dimension after Advanced.
test("Add Dimension and Remove Dimension change an array between one and two dimensions", () => {
  let d = poner(ED.inicial(), "arr-const", { x: 100, y: 100 });
  const id = d.seleccion[0];
  d = { ...d, g: Gr.fijarConfig(d.g, id, { type: { array: "i32" }, value: [1, 2, 3], visibles: 3 }) };
  assert.equal(D.menuDe(nodoDe(d, id), "result", d.g), "context.array-constant");

  // The rows, in the order of the capture, and Remove Dimension greyed on a 1D array.
  const filas = INV.hijos("context.array-constant").map((e) => e.etiqueta);
  assert.deepEqual(filas.slice(0, 4), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Element"]);
  assert.deepEqual(filas.slice(-7), ["Advanced", "Add Dimension", "Remove Dimension", "Add Element Gap", "Size to Widest Element", "Export", "Properties"]);
  let menu = ED.abrirMenu(d, "context.array-constant", id, 0, 0);
  let html = D.menuContextual(INV, menu.menu, ED.marcados(menu), undefined, ED.variantes(menu));
  assert.match(html, /class="item-menu desactivado" data-id="context.array-constant.remove-dimension"/);
  assert.match(html, /class="item-menu" data-id="context.array-constant.add-dimension"/);
  assert.equal(ED.orden(menu, "context.array-constant.remove-dimension", CTX), menu, "a greyed row does nothing and keeps the menu open");

  // Add Dimension: [1, 2, 3] becomes the single row of a 2D array, keeping the three columns it showed: 32 + 3 × 13 + 6 wide and 38 tall.
  d = ED.orden(menu, "context.array-constant.add-dimension", CTX);
  assert.equal(d.menu, null);
  assert.deepEqual(nodoDe(d, id).config.type, { array: "i32", dims: 2 });
  assert.deepEqual(nodoDe(d, id).config.value, [[1, 2, 3]]);
  const grande = caja(nodoDe(d, id), CTX);
  assert.deepEqual([grande.ancho, grande.alto], [32 + 3 * 13 + 6, 38]);

  // On a 2D array Add Dimension is greyed and explains the limit; Remove Dimension is available.
  menu = ED.abrirMenu(d, "context.array-constant", id, 0, 0);
  html = D.menuContextual(INV, menu.menu, ED.marcados(menu), undefined, ED.variantes(menu));
  assert.match(html, /class="item-menu hueco" data-id="context.array-dimensions-limit"/);
  assert.ok(!/desactivado" data-id="context.array-constant.remove-dimension/.test(html));
  assert.match(INV.explicacion(INV.resolver("context.array-dimensions-limit")).solder, /tres dimensiones/);
  assert.equal(ED.orden(menu, "context.array-constant.add-dimension", CTX), menu, "the row does nothing in 2D");

  // Remove Dimension keeps the first row.
  d = { ...d, g: Gr.fijarConfig(d.g, id, { value: [[1, 2, 3], [4, 5, 6]] }) };
  d = ED.orden(ED.abrirMenu(d, "context.array-constant", id, 0, 0), "context.array-constant.remove-dimension", CTX);
  assert.deepEqual([nodoDe(d, id).config.type, nodoDe(d, id).config.value], [{ array: "i32" }, [1, 2, 3]]);
});

// array-2d/constant-2d-empty.png, constant-2d-2x3-values.png and constant-2d-stretched-4x9-empty.png.
test("the constant with two dimensions is drawn as an index block and a grid of tiles", () => {
  let d = poner(ED.inicial(), "arr-const", { x: 100, y: 100 });
  const id = d.seleccion[0];
  d = { ...d, g: Gr.fijarConfig(d.g, id, { type: { array: "number", dims: 2 }, value: [[1, 2, 3], [4, 5, 6]], visibles: [4, 9] }) };
  const vacia = { ...nodoDe(d, id), config: { type: { array: "number", dims: 2 }, value: [] } };
  assert.deepEqual([caja(vacia, CTX).ancho, caja(vacia, CTX).alto], [51, 38], "the empty constant (constant-2d-empty.png)");
  const k = caja(nodoDe(d, id), CTX);
  assert.deepEqual([k.ancho, k.alto], [32 + 13 * 9 + 6, 19 * 4 + 6], "155 × 82, as measured");
  const html = contenido(d, CTX, tipos(d.g, CAT));
  assert.equal((html.match(/class="celda-grid/g) ?? []).length, 36);
  assert.equal((html.match(/class="celda-grid definida/g) ?? []).length, 6, "the tiles the value defines are solid, the rest pale");
  assert.match(html, /data-campo="1,2"[^>]*><div class="contenido-celda"><span>6<\/span>/, "the element in row 1, column 2");
  assert.match(html, /data-campo="3,8"[^>]*><div class="contenido-celda"><span>0<\/span>/, "outside the value: the default");
  assert.equal((html.match(/class="fila-indice"/g) ?? []).length, 2, "two index fields");
  assert.match(html, /class="caja-array-2d" style="left:32px;width:123px;height:82px"/);

  // The index shows the first position of each dimension, and the tiles start there.
  d = { ...d, g: Gr.fijarConfig(d.g, id, { indice: [1, 2], visibles: [1, 2] }) };
  const desplazado = contenido(d, CTX, tipos(d.g, CAT));
  assert.match(desplazado, /campo-indice">1<\/span>.*campo-indice">2<\/span>/s);
  assert.match(desplazado, /data-campo="1,2"/);
  assert.ok(!desplazado.includes('data-campo="0,0"'));
});

test("a cell of the constant with two dimensions is typed into and the value grows without gaps", () => {
  let d = poner(ED.inicial(), "arr-const", { x: 100, y: 100 });
  const id = d.seleccion[0];
  d = { ...d, g: Gr.fijarConfig(d.g, id, { type: { array: "i32", dims: 2 }, value: [[1, 2, 3], [4, 5, 6]], visibles: [3, 4] }) };
  d = ED.editar(d, CTX, id, "2,3");
  assert.equal(d.edicion.elem, "2,3");
  d = ED.confirmar(ED.teclear(d, "9"), CTX);
  assert.deepEqual(nodoDe(d, id).config.value, [[1, 2, 3, 0], [4, 5, 6, 0], [0, 0, 0, 9]]);
  d = ED.editar(d, CTX, id, "0,0");
  assert.match(contenido(d, CTX, tipos(d.g, CAT)), /celda-grid definida editando" data-campo="0,0"/);
  d = ED.confirmar(ED.teclear(ED.teclear(d, "Backspace"), "7"), CTX);
  assert.equal(nodoDe(d, id).config.value[0][0], 7);
  // A boolean toggles with the double click.
  d = { ...d, g: Gr.fijarConfig(d.g, id, { type: { array: "boolean", dims: 2 }, value: [] }) };
  d = ED.editar(d, CTX, id, "1,1");
  assert.deepEqual(nodoDe(d, id).config.value, [[false, false], [false, true]]);
});

test("the constant with two dimensions is stretched by the right, the bottom and the corner", () => {
  let d = poner(ED.inicial(), "arr-const", { x: 100, y: 100 });
  const id = d.seleccion[0];
  d = { ...d, g: Gr.fijarConfig(d.g, id, { type: { array: "number", dims: 2 }, value: [] }), seleccion: [id] };
  const asas = contenido(d, CTX, tipos(d.g, CAT)).match(/data-asa="(\w+)"/g);
  assert.deepEqual(asas, ['data-asa="derecha"', 'data-asa="abajo"', 'data-asa="esquina"']);
  const estirar = (lado, dx, dy) => {
    let e = ED.pulsar({ ...d, seleccion: [id] }, CTX, { tipo: "asa", nodo: id, lado }, { x: 200, y: 200 });
    e = ED.moverA(e, CTX, { x: 200 + dx, y: 200 + dy });
    return nodoDe(ED.soltar(e, CTX, FONDO, { x: 200 + dx, y: 200 + dy }), id).config.visibles;
  };
  assert.deepEqual(estirar("derecha", 3 * 13, 100), [1, 4], "only columns, 13 px each");
  assert.deepEqual(estirar("abajo", 100, 3 * 19), [4, 1], "only rows, 19 px each");
  assert.deepEqual(estirar("esquina", 8 * 13, 3 * 19), [4, 9], "both, as in constant-2d-stretched-4x9-empty.png");
});

// array-2d/wire-2d-dbl.png and wire-2d-vs-1d-diagram.png: 3 px, the type color, white and the type color.
test("a wire of a 2D array is 3 px with a white line in the middle, between the 1 px scalar and the 2 px 1D", () => {
  const cable = (tipo) => {
    let d = poner(ED.inicial(), "arr-const", { x: 40, y: 40 });
    const a = d.seleccion[0];
    d = poner(d, "arr-indicator", { x: 300, y: 40 });
    const b = d.seleccion[0];
    d = { ...d, g: Gr.fijarConfig(Gr.fijarConfig(d.g, a, { type: tipo, value: [] }), b, { type: tipo, value: [] }) };
    d = cablear(d, terminal(d, a, "result"), terminal(d, b, "value"));
    return contenido(d, CTX, tipos(d.g, CAT));
  };
  assert.match(cable({ array: "number", dims: 2 }), /stroke="#ff7f00" stroke-width="3"\/><polyline[^>]*stroke="#fff" stroke-width="1"/);
  assert.match(cable({ array: "number" }), /stroke="#ff7f00" stroke-width="2"/);
});

// array-2d/indexarray-2d-node-icon.png, indexarray-2d-wired-array-only.png: with a 2D array wired, Index Array is
// 32 × 35 and shows two indices 8 px apart; what comes out depends on the indices wired.
test("Index Array with a 2D array wired is 32 × 35 and has two indices", () => {
  let d = poner(ED.inicial(), "arr-const", { x: 40, y: 40 });
  const tabla = d.seleccion[0];
  d = { ...d, g: Gr.fijarConfig(d.g, tabla, { type: { array: "number", dims: 2 }, value: [[1, 2], [3, 4]] }) };
  d = poner(d, "index-array", { x: 300, y: 40 });
  const indice = d.seleccion[0];
  let k = caja(nodoDe(d, indice), CTX);
  assert.deepEqual([k.ancho, k.alto], [32, 27], "1D until a 2D array arrives");
  d = cablear(d, terminal(d, tabla, "result"), terminal(d, indice, "array"));
  assert.equal(nodoDe(d, indice).config.dims, 2);
  k = caja(nodoDe(d, indice), CTX);
  assert.deepEqual([k.ancho, k.alto], [32, 35]);
  const entradas = terminales(nodoDe(d, indice), CTX).filter((t) => t.dir === "in");
  assert.deepEqual(entradas.map((t) => t.puerto), ["array", "index", "index-1"]);
  assert.deepEqual(entradas.map((t) => t.y - k.y), [9.5, 22.5, 30.5], "the indices are 8 px apart");
  const salida = (cableados) => {
    let e = d;
    for (const puerto of cableados) {
      e = poner(e, "const", { x: 200, y: 100 });
      const c = e.seleccion[0];
      e = cablear(e, terminal(e, c, "result"), terminal(e, indice, puerto));
    }
    return contenido(e, CTX, tipos(e.g, CAT)).match(/<svg[^>]*viewBox="0 0 48 52.5"[\s\S]*?<\/svg>/)[0];
  };
  const [ninguno, uno, ambos] = [salida([]), salida(["index"]), salida(["index", "index-1"])];
  assert.notEqual(ninguno, uno);
  assert.notEqual(uno, ambos);
  assert.equal((ninguno.match(/<rect[^>]*fill="#2b2b22"/g) ?? []).length, 4, "no index wired: a 2D grid of four cells");
  assert.equal((ambos.match(/<rect[^>]*fill="#2b2b22"/g) ?? []).length, 3, "both wired: the two filled index icons and one square");
});

// array-2d/initializearray-contexthelp.png: Initialize Array is stretched downwards for each dimension size.
test("Initialize Array is stretched to add a dimension size and shrinks back removing its wire", () => {
  let d = poner(ED.inicial(), "initialize-array", { x: 300, y: 100 });
  const ini = d.seleccion[0];
  assert.deepEqual(terminales(nodoDe(d, ini), CTX).filter((t) => t.dir === "in").map((t) => t.puerto), ["element", "size"]);
  const estirar = (d0, dy) => {
    let e = ED.pulsar({ ...d0, seleccion: [ini] }, CTX, { tipo: "asa", nodo: ini, lado: "abajo" }, { x: 316, y: 130 });
    e = ED.moverA(e, CTX, { x: 316, y: 130 + dy });
    return ED.soltar(e, CTX, FONDO, { x: 316, y: 130 + dy });
  };
  assert.match(contenido({ ...d, seleccion: [ini] }, CTX, tipos(d.g, CAT)), /data-asa="abajo"/);
  d = estirar(d, 8);
  assert.equal(nodoDe(d, ini).config.dims, 2);
  assert.deepEqual(terminales(nodoDe(d, ini), CTX).filter((t) => t.dir === "in").map((t) => t.puerto), ["element", "size", "size-1"]);
  assert.equal(caja(nodoDe(d, ini), CTX).alto, 35);
  assert.equal(nodoDe(estirar(d, 80), ini).config.dims, 2, "no more than two dimensions");
  d = poner(d, "const", { x: 100, y: 100 });
  d = cablear(d, terminal(d, d.seleccion[0], "result"), terminal(d, ini, "size-1"));
  assert.equal(d.g.cables.length, 1);
  d = estirar(d, -8);
  assert.equal(nodoDe(d, ini).config.dims, 1);
  assert.equal(d.g.cables.length, 0, "the wire of the size that went away goes too");
});

// editor-checks/REPORT.md §2: in LabVIEW a node inside a loop is deleted by clicking it or by a rubber band, then Delete.
test("a node inside a loop is deleted by clicking it or with a rubber band, and the loop stays", () => {
  let d = ED.moverA(ED.coger(ED.inicial(), "while-loop"), CTX, { x: 100, y: 100 });
  d = ED.soltar(ED.pulsar(d, CTX, FONDO, { x: 100, y: 100 }), CTX, FONDO, { x: 100, y: 100 });
  d = ED.pulsar(ED.moverA(d, CTX, { x: 500, y: 350 }), CTX, FONDO, { x: 500, y: 350 });
  d = poner(d, "wait-ms", { x: 250, y: 200 });
  d = poner(d, "tick-count-ms", { x: 400, y: 200 });
  const [wait, tick] = d.g.nodos.filter((n) => n.tipo === "wait-ms" || n.tipo === "tick-count-ms").map((n) => n.id);
  assert.ok(d.g.nodos.filter((n) => n.id === wait || n.id === tick).every((n) => n.dentro), "both are inside the loop");
  const loops = () => d.g.nodos.filter((n) => n.tipo === "while-loop").length;

  // Click on the node, then Delete.
  const tickBox = caja(nodoDe(d, tick), CTX);
  const onTick = { x: tickBox.x + 4, y: tickBox.y + 4 };
  let clicked = ED.pulsar({ ...d, seleccion: [] }, CTX, { tipo: "nodo", id: tick }, onTick);
  clicked = ED.soltar(clicked, CTX, { tipo: "nodo", id: tick }, onTick);
  clicked = ED.borrarSeleccion(clicked, CTX);
  assert.deepEqual(ids(clicked).includes(tick), false, "the clicked node is gone");
  assert.ok(ids(clicked).includes(wait), "the other one stays");
  assert.equal(clicked.g.nodos.filter((n) => n.tipo === "while-loop").length, loops(), "and so does the loop");

  // A rubber band started on an empty point of the loop interior selects what it surrounds and does not move the loop.
  const waitBox = caja(nodoDe(d, wait), CTX);
  const [from, to] = [{ x: waitBox.x - 10, y: waitBox.y - 10 }, { x: waitBox.x + waitBox.ancho + 10, y: waitBox.y + waitBox.alto + 10 }];
  const loopBefore = d.g.nodos.find((n) => n.tipo === "while-loop");
  let banded = ED.pulsar({ ...d, seleccion: [] }, CTX, FONDO, from);
  banded = ED.moverA(banded, CTX, to);
  banded = ED.soltar(banded, CTX, FONDO, to);
  assert.deepEqual(banded.seleccion, [wait]);
  banded = ED.borrarSeleccion(banded, CTX);
  assert.deepEqual(ids(banded).includes(wait), false);
  assert.ok(ids(banded).includes(tick));
  const loopAfter = banded.g.nodos.find((n) => n.tipo === "while-loop");
  assert.deepEqual([loopAfter.x, loopAfter.y], [loopBefore.x, loopBefore.y], "the loop did not move");
});

test("a wire dropped on either half of a Case output tunnel takes the face that fits it", () => {
  // real-programs-0.3.md B2: the two faces are the tunnel's two halves, 9 px in all, and the half hit decided.
  const structure = Gr.crearEstructura(Gr.nuevo(), CAT, "case-structure", 100, 100, 300, 200);
  const tunnel = Gr.crearTunel(ED.fijarBordes(structure.g, CAT), CAT, structure.id, "out", 180);
  let d = { ...ED.inicial(), g: ED.fijarBordes(tunnel.g, CAT) };
  d = poner(d, "const", { x: 200, y: 170 });
  d = poner(d, "indicator", { x: 520, y: 170 });
  const [constant, indicator] = ids(d).slice(-2);
  assert.equal(d.g.nodos.find((n) => n.id === constant).dentro, structure.id);
  const visibleFrameInput = `x-${D.activoDe(d.g.nodos.find((n) => n.id === structure.id))}`;
  // From the constant inside, dropped on the tunnel's outer face: it ends on the visible frame's input.
  d = cablear(d, terminal(d, constant, "result"), terminal(d, tunnel.id, "y"));
  assert.ok(d.g.cables.some((c) => c.de.nodo === constant && c.a.nodo === tunnel.id && c.a.puerto === visibleFrameInput), JSON.stringify(d.g.cables));
  // From the indicator outside, dropped on the tunnel's inner face: it leaves by the tunnel's output.
  d = cablear(d, terminal(d, indicator, "value"), terminal(d, tunnel.id, visibleFrameInput));
  assert.ok(d.g.cables.some((c) => c.de.nodo === tunnel.id && c.de.puerto === "y" && c.a.nodo === indicator), JSON.stringify(d.g.cables));
  assert.equal(d.g.nodos.filter((n) => n.tipo === "case-tunnel-out").length, 1, "no second tunnel");
});

test("a terminal lying under a wire takes the mouse before the wire", () => {
  // real-programs-0.3.md B4: a wire dropped there became a branch of the wire on top and dangled.
  const wire = { tipo: "tramo", cable: "c1", k: 0 };
  const input = { tipo: "terminal", nodo: "n2", puerto: "value", dir: "in" };
  assert.deepEqual(ED.preferTerminalUnderWire([wire, { tipo: "nodo", id: "n2" }, input, { tipo: "fondo" }]), input);
  assert.deepEqual(ED.preferTerminalUnderWire([wire, { tipo: "fondo" }]), wire, "a wire over nothing is still the wire");
  assert.deepEqual(ED.preferTerminalUnderWire([{ tipo: "nodo", id: "n2" }, input]), { tipo: "nodo", id: "n2" }, "only a wire gives way");
  assert.equal(ED.preferTerminalUnderWire([]), null);
});

test("a tunnel made by a wire does not land on top of a shift register", () => {
  // real-programs-0.3.md B5: the tunnel hid the shift register's terminal and did not move when its source did.
  const loop = Gr.crearEstructura(Gr.nuevo(), CAT, "while-loop", 100, 100, 300, 240);
  const register = Gr.crearRegistro(ED.fijarBordes(loop.g, CAT), CAT, loop.id, 200);
  let d = { ...ED.inicial(), g: ED.fijarBordes(register.g, CAT) };
  const right = d.g.nodos.find((n) => n.id === register.derecho);
  d = poner(d, "const", { x: 200, y: right.y });
  d = poner(d, "indicator", { x: 520, y: right.y });
  const [constant, indicator] = ids(d).slice(-2);
  d = cablear(d, terminal(d, constant, "result"), terminal(d, indicator, "value"));
  const tunnel = d.g.nodos.find((n) => n.tipo === "tunnel-out");
  assert.ok(tunnel, "the wire leaves through a tunnel");
  const [, tunnelHeight] = D.TAM_BORDE["tunnel-out"];
  const [, registerHeight] = D.TAM_BORDE["shift-register-right"];
  assert.ok(tunnel.y >= right.y + registerHeight || tunnel.y + tunnelHeight <= right.y, `tunnel at ${tunnel.y}, shift register at ${right.y}`);
});

test("a short constant is wired by its right edge and moved by the rest of it", () => {
  // real-programs-0.3.md B11: the output took half the constant, all of a short one like `5`.
  const d = poner(ED.inicial(), "const", { x: 100, y: 100 });
  const constant = d.g.nodos[0];
  const box = caja(constant, CTX);
  const [output] = terminales(constant, CTX);
  assert.ok(output.zona.ancho <= 6, `the output's zone is ${output.zona.ancho} px wide`);
  assert.ok(box.ancho - output.zona.ancho >= box.ancho / 2, "most of the constant is body");
});

test("hovering the border of an unselected structure shows its eight handles, and the interior shows none", () => {
  // reports/2026-10-15-editor-gestures.md §2.
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const id = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  const visibleHandles = (state) => (contenido(state, CTX, tipos(state.g, CAT)).match(/class="asa asa-estructura"/g) ?? []).length;
  const hiddenHandles = (state) => (contenido(state, CTX, tipos(state.g, CAT)).match(/class="asa asa-estructura oculta"/g) ?? []).length;
  assert.equal(visibleHandles(d), 0);
  assert.equal(hiddenHandles(d), 8, "they are there, unseen, to be dragged");
  d = ED.sobrevolar(d, { tipo: "nodo", id });
  assert.equal(visibleHandles(d), 8, "hovering the border");
  d = ED.sobrevolar(d, null);
  assert.equal(visibleHandles(d), 0, "the interior does not take the mouse, so nothing is hovered");
  d = ED.sobrevolar(d, { tipo: "asa", nodo: id, lado: "se" });
  assert.equal(visibleHandles(d), 8, "on a handle");
});

test("dragging a handle of an unselected structure resizes it without selecting it", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 100, y: 100 }, { x: 400, y: 300 });
  const id = d.g.nodos.find((n) => n.tipo === "while-loop").id;
  d = { ...d, seleccion: [] };
  d = ED.pulsar(d, CTX, { tipo: "asa", nodo: id, lado: "se" }, { x: 398, y: 298 });
  d = ED.moverA(d, CTX, { x: 448, y: 328 });
  assert.equal(contenido(d, CTX, tipos(d.g, CAT)).match(/class="asa asa-estructura"/g)?.length, 8, "the handles stay while one is dragged");
  d = ED.soltar(d, CTX, FONDO, { x: 448, y: 328 });
  assert.deepEqual([nodoDe(d, id).tam.ancho, nodoDe(d, id).tam.alto], [350, 230]);
  assert.deepEqual(d.seleccion, [], "stretching does not select");
});

test("a wire released on a structure's border makes a tunnel at the release height", () => {
  // reports/2026-10-15-editor-gestures.md §3; real-programs-0.3.md C2. While and Case.
  for (const kind of ["while-loop", "case-structure"]) {
    let d = colocarBucle(ED.inicial(), kind, { x: 300, y: 100 }, { x: 600, y: 300 });
    const structure = d.g.nodos.find((n) => n.tipo === kind);
    // From inside to the right border: an output tunnel wired from the source.
    d = poner(d, "const", { x: 400, y: 200 });
    const inside = d.seleccion[0];
    const [source, from] = terminal(d, inside, "result");
    d = ED.pulsar(d, CTX, source, from);
    d = ED.moverA(d, CTX, { x: 598, y: 220 });
    d = ED.soltar(d, CTX, { tipo: "nodo", id: structure.id }, { x: 598, y: 220 });
    const out = d.g.nodos.find((n) => n.tipo === (kind === "case-structure" ? "case-tunnel-out" : "tunnel-out"));
    assert.ok(out, `${kind}: an output tunnel`);
    assert.equal(out.dentro, structure.id);
    assert.ok(Math.abs(out.y + 4.5 - 220) <= 2, `${kind}: at the release height, got ${out.y}`);
    assert.equal(d.g.cables.filter((c) => c.de.nodo === inside && c.a.nodo === out.id).length, 1, "wired from the source");
    // From outside onto the left border: an input tunnel.
    d = poner(d, "const", { x: 150, y: 150 });
    const outside = d.seleccion[0];
    const [source2, from2] = terminal(d, outside, "result");
    d = ED.pulsar(d, CTX, source2, from2);
    d = ED.moverA(d, CTX, { x: 302, y: 150 });
    d = ED.soltar(d, CTX, { tipo: "nodo", id: structure.id }, { x: 302, y: 150 });
    const into = d.g.nodos.find((n) => n.tipo === "tunnel-in");
    assert.ok(into, `${kind}: an input tunnel`);
    assert.equal(d.g.cables.filter((c) => c.de.nodo === outside && c.a.nodo === into.id).length, 1);
  }
});

test("a wire from a Case's input tunnel dropped on its border goes into the frame in view", () => {
  // editor-fixes-check S1: it went into frame 0 whatever frame was shown.
  let d = colocarBucle(ED.inicial(), "case-structure", { x: 300, y: 100 }, { x: 600, y: 300 });
  const structure = d.g.nodos.find((n) => n.tipo === "case-structure");
  d = poner(d, "const", { x: 150, y: 150 });
  const outside = d.seleccion[0];
  const [source, from] = terminal(d, outside, "result");
  d = ED.pulsar(d, CTX, source, from);
  d = ED.moverA(d, CTX, { x: 302, y: 150 });
  d = ED.soltar(d, CTX, { tipo: "nodo", id: structure.id }, { x: 302, y: 150 });
  const into = d.g.nodos.find((n) => n.tipo === "tunnel-in");
  const [inner, at] = terminal(d, into.id, "y");
  d = ED.pulsar(d, CTX, inner, at);
  d = ED.moverA(d, CTX, { x: 598, y: 220 });
  d = ED.soltar(d, CTX, { tipo: "nodo", id: structure.id }, { x: 598, y: 220 });
  const out = d.g.nodos.find((n) => n.tipo === "case-tunnel-out");
  const shown = D.activoDe(d.g.nodos.find((n) => n.id === structure.id));
  assert.ok(d.g.cables.some((c) => c.de.nodo === into.id && c.a.nodo === out.id && c.a.puerto === `x-${shown}`), JSON.stringify(d.g.cables));
});

test("a wire dropped on a structure's border does not cover a tunnel already there", () => {
  let d = colocarBucle(ED.inicial(), "while-loop", { x: 300, y: 100 }, { x: 600, y: 300 });
  const structure = d.g.nodos.find((n) => n.tipo === "while-loop");
  d = poner(d, "const", { x: 400, y: 200 });
  const inside = d.seleccion[0];
  for (let attempt = 0; attempt < 2; attempt++) {
    const [source, from] = terminal(d, inside, "result");
    d = ED.pulsar(d, CTX, source, from);
    d = ED.moverA(d, CTX, { x: 598, y: 220 });
    d = ED.soltar(d, CTX, { tipo: "nodo", id: structure.id }, { x: 598, y: 220 });
  }
  const [first, second] = d.g.nodos.filter((n) => n.tipo === "tunnel-out").sort((a, b) => a.y - b.y);
  assert.ok(second, "two tunnels");
  assert.ok(second.y >= first.y + D.TAM_BORDE["tunnel-out"][1], "they do not overlap");
});
