// Arrays de una dimensión (DT-042): un bloque [n][relleno][elementos] en
// memoria lineal, en la celda de cada nodo. Los elementos de un array de
// cadenas o de clusters van por referencia y se copian enteros.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT } from "../helpers.mjs";

function vi(nodos, cables) {
  let g = Gr.nuevo();
  const id = {};
  for (const [nombre, bloque, config, dentro] of nodos) {
    const r = bloque === "for-loop" ? Gr.crearEstructura(g, CAT, bloque, 0, 0, 200, 150) : Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    if (dentro) g = Gr.meter(g, CAT, [r.id], id[dentro]);
    id[nombre] = r.id;
    for (const n of g.nodos.filter((k) => k.dentro === r.id)) id[`${nombre}:${{ "loop-count": "N", "loop-iteration": "i" }[n.tipo]}`] = n.id;
  }
  const v = { g, id };
  v.con = (de, a) => {
    const [n1, p1] = [de.slice(0, de.lastIndexOf(".")), de.slice(de.lastIndexOf(".") + 1)];
    const [n2, p2] = [a.slice(0, a.lastIndexOf(".")), a.slice(a.lastIndexOf(".") + 1)];
    const r = Gr.conectar(v.g, CAT, { nodo: v.id[n1], puerto: p1, dir: "out" }, { nodo: v.id[n2], puerto: p2, dir: "in" });
    assert.ok(!r.motivo, `${de} → ${a}: ${r.motivo}`);
    v.g = r.g;
  };
  for (const [de, a] of cables) v.con(de, a);
  return v;
}

async function correr(v, valores = {}) {
  const c = compilar(v.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  try { new WebAssembly.Module(c.bytes); } catch (er) { assert.fail("módulo inválido: " + er.message); }
  const nombre = Object.fromEntries(Object.entries(v.id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, Object.fromEntries(Object.entries(valores).map(([k, x]) => [v.id[k], x])));
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k], x]));
}

const A = (e) => ({ array: e });
const constante = (nombre, e, valores) => [nombre, "arr-const", { type: A(e), value: valores }];
const indicador = (nombre, e) => [nombre, "arr-indicator", { type: A(e) }];

test("array size, e index array con el valor por defecto fuera de rango", async () => {
  const v = vi(
    [constante("a", "number", [1.5, 2.5, 3.5]), ["s", "array-size"], ["n", "indicator", { type: "i32" }],
     ["i1", "const", { value: 1 }], ["x1", "index-array"], ["r1", "indicator"], ["i9", "const", { value: 9 }], ["x9", "index-array"], ["r9", "indicator"]],
    [["a.result", "s.array"], ["s.size", "n.value"], ["a.result", "x1.array"], ["i1.result", "x1.index"], ["x1.element", "r1.value"],
     ["a.result", "x9.array"], ["i9.result", "x9.index"], ["x9.element", "r9.value"]],
  );
  assert.deepEqual(await correr(v), { n: 3, r1: 2.5, r9: 0 });
});

test("build array: los elementos se añaden y un array, mezclado, se concatena", async () => {
  const v = vi([["a", "const", { value: 1 }], ["b", "const", { value: 2 }], ["c", "build-array", { inputs: 2 }], indicador("r", "number")], [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [1, 2] });
  const m = vi([constante("a", "number", [1, 2]), ["b", "const", { value: 3 }], ["c", "build-array", { inputs: 2 }], indicador("r", "number")], [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(m), { r: [1, 2, 3] });
  const cat = vi([constante("a", "number", [1]), constante("b", "number", [2, 3]), ["c", "build-array", { inputs: 2, concatenate: true }], indicador("r", "number")], [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(cat), { r: [1, 2, 3] });
  const dosD = vi([constante("a", "number", [1]), constante("b", "number", [2]), ["c", "build-array", { inputs: 2 }], ["r", "arr-indicator", { type: { array: "number", dims: 2 } }]], [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(dosD), { r: [[1], [2]] }, "two arrays without Concatenate Inputs give a 2D array (DT-044)");
});

test("initialize array, array subset recortado, y reverse", async () => {
  const v = vi(
    [["k", "const", { value: 7 }], ["n", "const", { value: 3 }], ["ini", "initialize-array"], indicador("ri", "number"),
     constante("a", "i32", [10, 20, 30, 40, 50]), ["i", "const", { value: 1 }], ["l", "const", { value: 2 }], ["sub", "array-subset"], indicador("rs", "i32"),
     ["i2", "const", { value: 3 }], ["sub2", "array-subset"], indicador("rr", "i32"), ["rev", "reverse-1d-array"], indicador("rv", "i32")],
    [["k.result", "ini.element"], ["n.result", "ini.size"], ["ini.result", "ri.value"],
     ["a.result", "sub.array"], ["i.result", "sub.index"], ["l.result", "sub.length"], ["sub.result", "rs.value"],
     ["a.result", "sub2.array"], ["i2.result", "sub2.index"], ["sub2.result", "rr.value"], ["a.result", "rev.array"], ["rev.result", "rv.value"]],
  );
  assert.deepEqual(await correr(v), { ri: [7, 7, 7], rs: [20, 30], rr: [40, 50], rv: [50, 40, 30, 20, 10] });
});

test("array max and min, search 1d array y la suma y el producto de los elementos", async () => {
  const v = vi(
    [constante("a", "number", [3, 9, 1, 9, 1]), ["mm", "array-max-min"], ["mx", "indicator"], ["mi", "indicator", { type: "i32" }], ["mn", "indicator"], ["ni", "indicator", { type: "i32" }],
     ["e", "const", { value: 9 }], ["s", "search-1d-array"], ["si", "indicator", { type: "i32" }], ["sum", "add-array-elements"], ["rs", "indicator"],
     constante("u", "u8", [200, 100]), ["su", "add-array-elements"], ["ru", "indicator", { type: "u8" }], ["mul", "multiply-array-elements"], ["rm", "indicator"]],
    [["a.result", "mm.array"], ["mm.max", "mx.value"], ["mm.max-index", "mi.value"], ["mm.min", "mn.value"], ["mm.min-index", "ni.value"],
     ["a.result", "s.array"], ["e.result", "s.element"], ["s.index", "si.value"], ["a.result", "sum.numeric-array"], ["sum.sum", "rs.value"],
     ["u.result", "su.numeric-array"], ["su.sum", "ru.value"], ["a.result", "mul.numeric-array"], [`mul.${CAT.puertos({ tipo: "multiply-array-elements" }).out[0].name}`, "rm.value"]],
  );
  assert.deepEqual(await correr(v), { mx: 9, mi: 1, mn: 1, ni: 2, si: 1, rs: 23, ru: 44, rm: 243 }, "U8: 200 + 100 da la vuelta a 44");
});

test("array max and min de un array vacío: 0 y los índices a -1 (medido en LabVIEW)", async () => {
  const v = vi(
    [constante("a", "i32", []), ["mm", "array-max-min"], ["mx", "indicator", { type: "i32" }], ["mi", "indicator", { type: "i32" }], ["mn", "indicator", { type: "i32" }], ["ni", "indicator", { type: "i32" }]],
    [["a.result", "mm.array"], ["mm.max", "mx.value"], ["mm.max-index", "mi.value"], ["mm.min", "mn.value"], ["mm.min-index", "ni.value"]],
  );
  assert.deepEqual(await correr(v), { mx: 0, mi: -1, mn: 0, ni: -1 });
});

test("and y or array elements", async () => {
  const v = vi(
    [constante("a", "boolean", [true, false, true]), ["y", "and-array-elements"], ["o", "or-array-elements"], ["ry", "bool-indicator"], ["ro", "bool-indicator"],
     constante("v", "boolean", []), ["yv", "and-array-elements"], ["ryv", "bool-indicator"]],
    [["a.result", "y.boolean-array"], ["a.result", "o.boolean-array"], ["y.result", "ry.value"], ["o.result", "ro.value"], ["v.result", "yv.boolean-array"], ["yv.result", "ryv.value"]],
  );
  assert.deepEqual(await correr(v), { ry: false, ro: true, ryv: true });
});

test("arrays de cadenas, de enteros de 64 bits, de bytes y de clusters van y vuelven del panel", async () => {
  const P = { cluster: [{ name: "x", type: "number" }, { name: "s", type: "string" }] };
  const v = vi(
    [["cs", "arr-control", { type: A("string") }], indicador("rs", "string"), ["c64", "arr-control", { type: A("i64") }], indicador("r64", "i64"),
     ["c8", "arr-control", { type: A("u8") }], indicador("r8", "u8"), ["cc", "arr-control", { type: A(P) }], indicador("rc", P)],
    [["cs.result", "rs.value"], ["c64.result", "r64.value"], ["c8.result", "r8.value"], ["cc.result", "rc.value"]],
  );
  const valores = { cs: ["año", "", "x"], c64: [1, -2, 123456789012], c8: [0, 255, 7], cc: [{ x: 1.5, s: "a" }, { x: -2, s: "bé" }] };
  assert.deepEqual(await correr(v, valores), { rs: valores.cs, r64: valores.c64, r8: valores.c8, rc: valores.cc });
});

test("un shift register va construyendo un array de cadenas, con su copia", async () => {
  const v = vi(
    [["f", "for-loop"], ["n", "const", { value: 4 }], constante("vacio", "string", []), ["x", "str-const", { value: "ab" }, "f"], ["b", "build-array", { inputs: 2 }, "f"], indicador("r", "string")],
    [["n.result", "f:N.count"]],
  );
  const sr = Gr.crearRegistro(v.g, CAT, v.id.f, 0);
  v.g = sr.g;
  Object.assign(v.id, { izq: sr.izquierdo, der: sr.derecho });
  for (const [de, a] of [["vacio.result", "izq.init"], ["izq.value", "b.element-0"], ["x.result", "b.element-1"], ["b.result", "der.value"], ["der.result", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: ["ab", "ab", "ab", "ab"] });
});

test("un array dentro de un cluster: bundle lo copia y unbundle lo da", async () => {
  const T = { cluster: [{ name: "datos", type: A("number") }, { name: "n", type: "i32" }] };
  const v = vi(
    [constante("a", "number", [1, 2, 3]), ["k", "const", { value: 3 }], ["b", "bundle", { type: T }], ["u", "unbundle", { type: T }], ["s", "array-size"], ["rs", "indicator", { type: "i32" }], indicador("ra", "number")],
    [["a.result", "b.campo-0"], ["k.result", "b.campo-1"], ["b.result", "u.value"], ["u.campo-0", "s.array"], ["s.size", "rs.value"], ["u.campo-0", "ra.value"]],
  );
  assert.deepEqual(await correr(v), { rs: 3, ra: [1, 2, 3] });
});

// ——— Autoindexado ———

/** Un For con un túnel de entrada y uno de salida, indexados o no, y lo de dentro. */
function bucleIndexado(entradas, cuerpo, conN) {
  const v = vi([["f", "for-loop"], ...entradas.map(([nombre, e, valores]) => constante(nombre, e, valores)), ...(conN !== undefined ? [["n", "const", { value: conN }]] : []), ...cuerpo], []);
  if (conN !== undefined) v.con("n.result", "f:N.count");
  return v;
}
function tunel(v, nombre, dir, indexado = true) {
  const r = Gr.crearTunel(v.g, CAT, v.id.f, dir, 0);
  v.g = Gr.fijarConfig(r.g, r.id, { indexado });
  v.id[nombre] = r.id;
}

test("un for sin N recorre un array indexado y otro indexado a la salida lo construye", async () => {
  const v = bucleIndexado([["a", "number", [1, 2, 3]]], [["sq", "square", null, "f"], indicador("r", "number")]);
  tunel(v, "ti", "in");
  tunel(v, "to", "out");
  for (const [de, a] of [["a.result", "ti.x"], ["ti.y", "sq.x"], ["sq.result", "to.x"], ["to.y", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: [1, 4, 9] });
});

test("el for da tantas vueltas como el mas corto: el N cableado o cada array indexado", async () => {
  const hacer = (n, a, b) => {
    const v = bucleIndexado([["a", "i32", a], ["b", "i32", b]], [["s", "add", null, "f"], indicador("r", "i32")], n);
    tunel(v, "ta", "in");
    tunel(v, "tb", "in");
    tunel(v, "to", "out");
    for (const [de, x] of [["a.result", "ta.x"], ["b.result", "tb.x"], ["ta.y", "s.a"], ["tb.y", "s.b"], ["s.result", "to.x"], ["to.y", "r.value"]]) v.con(de, x);
    return v;
  };
  assert.deepEqual(await correr(hacer(undefined, [1, 2, 3], [10, 20])), { r: [11, 22] }, "el array más corto manda");
  assert.deepEqual(await correr(hacer(1, [1, 2, 3], [10, 20])), { r: [11] }, "y el N, si es menor");
  assert.deepEqual(await correr(hacer(0, [1, 2, 3], [10, 20])), { r: [] }, "con N = 0, un array vacío");
});

test("autoindexado de cadenas", async () => {
  const v = bucleIndexado([["a", "string", ["a", "bé", ""]]], [["x", "str-const", { value: "!" }, "f"], ["c", "concatenate-strings", null, "f"], indicador("r", "string")]);
  tunel(v, "ti", "in");
  tunel(v, "to", "out");
  const p = CAT.puertos(v.g.nodos.find((n) => n.id === v.id.c));
  for (const [de, a] of [["a.result", "ti.x"], ["ti.y", `c.${p.in[0].name}`], ["x.result", `c.${p.in[1].name}`], [`c.${p.out[0].name}`, "to.x"], ["to.y", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: ["a!", "bé!", "!"] });
});

test("al cablear un array a traves del borde, el for indexa y el while no", () => {
  const hacer = (bucle) => {
    let g = Gr.nuevo();
    let r = Gr.crearEstructura(g, CAT, bucle, 0, 0, 200, 150);
    g = r.g;
    const s = r.id;
    r = Gr.crearNodo(g, CAT, "arr-const", 0, 0);
    g = Gr.fijarConfig(r.g, r.id, { type: A("number"), value: [1] });
    const a = r.id;
    r = Gr.crearNodo(g, CAT, "square", 0, 0);
    g = Gr.meter(r.g, CAT, [r.id], s);
    const q = r.id;
    g = Gr.conectarCruzando(g, CAT, { nodo: a, puerto: "result", dir: "out" }, { nodo: q, puerto: "x", dir: "in" }).g;
    return g.nodos.find((n) => n.tipo === "tunnel-in");
  };
  assert.equal(hacer("for-loop").config?.indexado, true);
  assert.ok(!hacer("while-loop").config?.indexado);
});

test("replace, insert y delete: cambian el array, con el trozo o el elemento que se dé", async () => {
  const a = constante("a", "number", [10, 20, 30, 40]);
  const v = vi(
    [a, ["i", "const", { value: 1 }], ["x", "const", { value: 99 }], ["rep", "replace-array-subset"], indicador("r1", "number"),
     ["ins", "insert-into-array"], indicador("r2", "number"), ["fuera", "const", { value: 9 }], ["rep2", "replace-array-subset"], indicador("r3", "number"),
     ["ins2", "insert-into-array"], indicador("r4", "number"), constante("trozo", "number", [7, 8]), ["ins3", "insert-into-array"], indicador("r5", "number"),
     ["len", "const", { value: 2 }], ["del", "delete-from-array"], indicador("r6", "number"), indicador("r7", "number"), ["del1", "delete-from-array"], indicador("r8", "number"), indicador("r9", "number")],
    [["a.result", "rep.array"], ["i.result", "rep.index"], ["x.result", "rep.new"], ["rep.result", "r1.value"],
     ["a.result", "ins.array"], ["i.result", "ins.index"], ["x.result", "ins.new"], ["ins.result", "r2.value"],
     ["a.result", "rep2.array"], ["fuera.result", "rep2.index"], ["x.result", "rep2.new"], ["rep2.result", "r3.value"],
     ["a.result", "ins2.array"], ["x.result", "ins2.new"], ["ins2.result", "r4.value"],
     ["a.result", "ins3.array"], ["i.result", "ins3.index"], ["trozo.result", "ins3.new"], ["ins3.result", "r5.value"],
     ["a.result", "del.array"], ["len.result", "del.length"], ["i.result", "del.index"], ["del.result", "r6.value"], ["del.deleted", "r7.value"],
     ["a.result", "del1.array"], ["del1.result", "r8.value"], ["del1.deleted", "r9.value"]],
  );
  assert.deepEqual(await correr(v), {
    r1: [10, 99, 30, 40], r2: [10, 99, 20, 30, 40], r3: [10, 20, 30, 40], r4: [10, 20, 30, 40, 99], r5: [10, 7, 8, 20, 30, 40],
    r6: [10, 40], r7: [20, 30], r8: [10, 20, 30], r9: [40],
  });
});

// Medido en LabVIEW 2026 Q3 con [0, 1, 2] (labview-captures/array/res-*.png): fuera de rango, el array sale igual.
test("replace, insert y delete con el índice fuera de rango, como en LabVIEW", async () => {
  const caso = (bloque, i, extra = []) => {
    const v = vi([constante("a", "i32", [0, 1, 2]), ["i", "const", { value: i, type: "i32" }], ["x", "const", { value: 99, type: "i32" }], ["f", bloque], indicador("r", "i32")],
      [["a.result", "f.array"], ["i.result", "f.index"], ...extra, ["f.result", "r.value"]]);
    return correr(v).then((r) => r.r);
  };
  const nuevo = [["x.result", "f.new"]];
  for (const [i, r] of [[0, [99, 0, 1, 2]], [3, [0, 1, 2, 99]], [7, [0, 1, 2]], [-1, [0, 1, 2]]]) assert.deepEqual(await caso("insert-into-array", i, nuevo), r, `insert en ${i}`);
  for (const [i, r] of [[1, [0, 99, 2]], [3, [0, 1, 2]], [7, [0, 1, 2]], [-1, [0, 1, 2]]]) assert.deepEqual(await caso("replace-array-subset", i, nuevo), r, `replace en ${i}`);
  for (const [i, r] of [[1, [0, 2]], [3, [0, 1, 2]], [7, [0, 1, 2]], [-1, [0, 1, 2]]]) assert.deepEqual(await caso("delete-from-array", i), r, `delete en ${i}`);
});

// Medido en LabVIEW 2026 Q3 (labview-captures/array/res2-*.png).
test("los demás casos límite, como en LabVIEW", async () => {
  const una = async (a, e, bloque, entradas, salidas) => {
    const nodos = [constante("a", e, a), ["f", bloque]];
    const cables = [["a.result", "f.array"]];
    for (const [p, x] of Object.entries(entradas)) { nodos.push([`k${p}`, "const", { value: x, type: Number.isInteger(x) ? "i32" : "number" }]); cables.push([`k${p}.result`, `f.${p}`]); }
    for (const [p, t] of Object.entries(salidas)) { nodos.push(t.array ? indicador(`r${p}`, t.array) : [`r${p}`, "indicator", { type: t }]); cables.push([`f.${p}`, `r${p}.value`]); }
    const r = await correr(vi(nodos, cables));
    return Object.fromEntries(Object.keys(salidas).map((p) => [p, r[`r${p}`]]));
  };
  const B = [0, 1, 2];
  assert.deepEqual(await una(B, "i32", "index-array", { index: -1 }, { element: "i32" }), { element: 0 }, "index array con -1");
  assert.deepEqual(await una(B, "i32", "index-array", { index: 3 }, { element: "i32" }), { element: 0 }, "index array con 3");
  const mm = { max: "number", "max-index": "i32", min: "number", "min-index": "i32" };
  assert.deepEqual(await una([1, NaN, 3], "number", "array-max-min", {}, mm), { max: 3, "max-index": 2, min: 1, "min-index": 0 }, "el NaN se ignora");
  assert.deepEqual(await una([NaN, 1, 3], "number", "array-max-min", {}, mm), { max: 3, "max-index": 2, min: 1, "min-index": 1 }, "también el primero");
  assert.deepEqual(await una([], "number", "array-max-min", {}, mm), { max: 0, "max-index": -1, min: 0, "min-index": -1 }, "vacío de DBL: 0, no NaN");
  for (const [start, r] of [[-1, 1], [2, 3], [5, -1]]) assert.deepEqual(await una([0, 1, 2, 1], "i32", "search-1d-array", { element: 1, start }, { index: "i32" }), { index: r }, `search desde ${start}`);
  for (const [n, r] of [[-1, [1, 2, 0]], [4, [2, 0, 1]]]) assert.deepEqual(await una(B, "i32", "rotate-1d-array", { n }, { result: A("i32") }), { result: r }, `rotate ${n}`);
  for (const [index, f, s2] of [[-1, [], B], [7, B, []]]) assert.deepEqual(await una(B, "i32", "split-1d-array", { index }, { first: A("i32"), second: A("i32") }), { first: f, second: s2 }, `split en ${index}`);
  assert.deepEqual(await una(B, "i32", "delete-from-array", { index: 1, length: 7 }, { result: A("i32"), deleted: A("i32") }), { result: [0], deleted: [1, 2] });
  assert.deepEqual(await una(B, "i32", "delete-from-array", { index: 1, length: -1 }, { result: A("i32"), deleted: A("i32") }), { result: B, deleted: [] });
  assert.deepEqual(await una(B, "i32", "delete-from-array", { length: 2 }, { result: A("i32"), deleted: A("i32") }), { result: [0], deleted: [1, 2] });
  assert.deepEqual(await una(B, "i32", "array-subset", { index: 1, length: -1 }, { result: A("i32") }), { result: [] }, "subset con length -1");
  assert.deepEqual(await una(B, "i32", "array-subset", { index: 1 }, { result: A("i32") }), { result: [1, 2] }, "subset sin length");
});

test("sort, rotate, split e incrementar un elemento", async () => {
  const v = vi(
    [constante("a", "number", [3.5, -1, 2, 2]), ["s", "sort-1d-array"], indicador("rs", "number"), constante("b", "u8", [1, 2, 3, 4, 5]), ["n", "const", { value: 2 }], ["rot", "rotate-1d-array"], indicador("rr", "u8"),
     ["rot1", "rotate-1d-array"], indicador("r1", "u8"), ["k", "const", { value: 3 }], ["sp", "split-1d-array"], indicador("sa", "u8"), indicador("sb", "u8"),
     ["inc", "increment-array-element"], indicador("ri", "u8"), ["m", "const", { value: 4 }], ["dec", "decrement-array-element"], indicador("rd", "u8"),
     constante("z", "boolean", [true, false, true]), ["sb2", "sort-1d-array"], indicador("rb", "boolean")],
    [["a.result", "s.array"], ["s.result", "rs.value"], ["b.result", "rot.array"], ["n.result", "rot.n"], ["rot.result", "rr.value"], ["b.result", "rot1.array"], ["rot1.result", "r1.value"],
     ["b.result", "sp.array"], ["k.result", "sp.index"], ["sp.first", "sa.value"], ["sp.second", "sb.value"],
     ["b.result", "inc.array"], ["k.result", "inc.index"], ["inc.result", "ri.value"], ["b.result", "dec.array"], ["m.result", "dec.index"], ["dec.result", "rd.value"],
     ["z.result", "sb2.array"], ["sb2.result", "rb.value"]],
  );
  assert.deepEqual(await correr(v), { rs: [-1, 2, 2, 3.5], rr: [4, 5, 1, 2, 3], r1: [5, 1, 2, 3, 4], sa: [1, 2, 3], sb: [4, 5], ri: [1, 2, 3, 5, 5], rd: [1, 2, 3, 4, 4], rb: [false, true, true] });
});

// Un array que llega a un terminal de otro tipo de elemento se convierte entero,
// en un búfer nuevo: el punto de coerción de LabVIEW.
test("un array de i32 que entra donde se espera un dbl se convierte elemento a elemento", async () => {
  const v = vi([constante("a", "i32", [1, -2, 3]), constante("b", "number", [0.5]), ["c", "build-array", { inputs: 2, concatenate: true }], indicador("r", "number")],
    [["b.result", "c.element-0"], ["a.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [0.5, 1, -2, 3] });
  const w = vi([constante("a", "number", [1.5, 2.5, -0.5]), indicador("r", "i32")], [["a.result", "r.value"]]);
  assert.deepEqual(await correr(w), { r: [2, 2, 0] }, "a entero, al par");
});

// ——— Two dimensions (DT-044): one block [rows][columns][elements in row order] ———

const A2 = (e) => ({ array: e, dims: 2 });

test("a 2D constant reaches a 2D indicator with its rows and columns", async () => {
  const v = vi([["a", "arr-const", { type: A2("number"), value: [[1, 2, 3], [4, 5, 6]] }], ["r", "arr-indicator", { type: A2("number") }]], [["a.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [[1, 2, 3], [4, 5, 6]] });
});

test("a 2D control is read from the panel and an empty one stays empty", async () => {
  const v = vi([["c", "arr-control", { type: A2("i32") }], ["r", "arr-indicator", { type: A2("i32") }]], [["c.result", "r.value"]]);
  assert.deepEqual(await correr(v, { c: [[7, 8], [9]] }), { r: [[7, 8], [9, 0]] }, "a ragged value is padded, as the panel shows it");
  assert.deepEqual(await correr(v, { c: [] }), { r: [] });
});

test("a 2D array of strings is copied element by element", async () => {
  const v = vi([["a", "arr-const", { type: A2("string"), value: [["a", "bc"], ["", "def"]] }], ["r", "arr-indicator", { type: A2("string") }]], [["a.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [["a", "bc"], ["", "def"]] });
});

// Measured in LabVIEW 2026 Q3 with [[1,2,3],[4,5,6]] (labview-captures/array-2d/arraysize-2d-2x3.png, indexarray-2d-*.png).
const tabla = (nombre) => [nombre, "arr-const", { type: A2("number"), value: [[1, 2, 3], [4, 5, 6]] }];

test("Array Size of a 2D array gives its rows and columns", async () => {
  const v = vi([tabla("a"), ["s", "array-size"], ["r", "arr-indicator", { type: A("i32") }]], [["a.result", "s.array"], ["s.size", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [2, 3] });
});

async function indexar(fila, columna) {
  const nodos = [tabla("a"), ["x", "index-array"]];
  const cables = [["a.result", "x.array"]];
  if (fila !== undefined) nodos.push(["f", "const", { value: fila, type: "i32" }]), cables.push(["f.result", "x.index"]);
  if (columna !== undefined) nodos.push(["c", "const", { value: columna, type: "i32" }]), cables.push(["c.result", "x.index-1"]);
  const tipo = fila !== undefined && columna !== undefined ? "number" : fila === undefined && columna === undefined ? A2("number") : A("number");
  nodos.push(esTipoArray(tipo) ? ["r", "arr-indicator", { type: tipo }] : ["r", "indicator"]);
  cables.push(["x.element", "r.value"]);
  return (await correr(vi(nodos, cables))).r;
}
const esTipoArray = (t) => typeof t === "object";

test("Index Array on a 2D array: element, row, column or the whole array", async () => {
  assert.equal(await indexar(1, 2), 6);
  assert.equal(await indexar(-1, 2), 0, "out of range, the default value");
  assert.equal(await indexar(1, 10), 0);
  assert.deepEqual(await indexar(1, undefined), [4, 5, 6], "only the row: that row");
  assert.deepEqual(await indexar(10, undefined), [], "a row out of range: an empty array");
  assert.deepEqual(await indexar(undefined, 1), [2, 5], "only the column: that column");
  assert.deepEqual(await indexar(undefined, -1), []);
  assert.deepEqual(await indexar(undefined, undefined), [[1, 2, 3], [4, 5, 6]]);
});

test("Index Array grows one index per dimension when a 2D array is wired", () => {
  const v = vi([tabla("a"), ["x", "index-array"]], [["a.result", "x.array"]]);
  const x = v.g.nodos.find((n) => n.id === v.id.x);
  assert.equal(x.config.dims, 2);
  assert.deepEqual(CAT.puertos(x).in.map((p) => p.name), ["array", "index", "index-1"]);
});

// Measured in LabVIEW 2026 Q3 (labview-captures/array-2d/buildarray-*.png).
test("Build Array of 1D arrays stacks them as rows, padded with the default value", async () => {
  const v = vi([constante("a", "number", [1, 2, 3]), constante("b", "number", [4, 5]), ["c", "build-array", { inputs: 2 }], ["r", "arr-indicator", { type: A2("number") }]],
    [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [[1, 2, 3], [4, 5, 0]] });
});

test("Build Array of a 2D and a 1D appends a row, with or without Concatenate Inputs", async () => {
  for (const concatenate of [false, true]) {
    const v = vi([tabla("a"), constante("b", "number", [4, 5]), ["c", "build-array", { inputs: 2, concatenate }], ["r", "arr-indicator", { type: A2("number") }]],
      [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
    assert.deepEqual(await correr(v), { r: [[1, 2, 3], [4, 5, 6], [4, 5, 0]] }, `concatenate ${concatenate}`);
  }
});

test("Build Array of two 2D arrays with Concatenate Inputs appends the rows; without it, it would be 3D", async () => {
  const v = vi([tabla("a"), tabla("b"), ["c", "build-array", { inputs: 2, concatenate: true }], ["r", "arr-indicator", { type: A2("number") }]],
    [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [[1, 2, 3], [4, 5, 6], [1, 2, 3], [4, 5, 6]] });
  const sinConcatenar = vi([tabla("a"), tabla("b"), ["c", "build-array", { inputs: 2 }]], [["a.result", "c.element-0"], ["b.result", "c.element-1"]]);
  assert.deepEqual(Gr.tipos(sinConcatenar.g, CAT).salidas.get(`${sinConcatenar.id.c}.result`), { array: "number", dims: 3 });
});

test("Build Array of strings pads short rows with empty strings", async () => {
  const v = vi([constante("a", "string", ["x", "yy"]), constante("b", "string", ["z"]), ["c", "build-array", { inputs: 2 }], ["r", "arr-indicator", { type: A2("string") }]],
    [["a.result", "c.element-0"], ["b.result", "c.element-1"], ["c.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [["x", "yy"], ["z", ""]] });
});

test("Build Array breaks the wire of an input with two dimensions less, as LabVIEW", () => {
  const v = vi([tabla("a"), ["x", "const", { value: 1 }], ["c", "build-array", { inputs: 2 }]], [["a.result", "c.element-0"]]);
  v.con("x.result", "c.element-1");
  const rotos = [...Gr.tipos(v.g, CAT).cables.values()].filter((c) => c.roto);
  assert.equal(rotos.length, 1);
});

test("Initialize Array with two sizes, and 0 rows keep their columns, as LabVIEW", async () => {
  const v = vi([["k", "const", { value: 7, type: "i32" }], ["f", "const", { value: 2, type: "i32" }], ["c", "const", { value: 3, type: "i32" }], ["ini", "initialize-array", { dims: 2 }], ["r", "arr-indicator", { type: A2("i32") }]],
    [["k.result", "ini.element"], ["f.result", "ini.size"], ["c.result", "ini.size-1"], ["ini.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [[7, 7, 7], [7, 7, 7]] });
  // labview-captures/array-2d/arraysize-init-0x3.png: Array Size gives [0, 3].
  const vacio = vi([["k", "const", { value: 7, type: "i32" }], ["f", "const", { value: 0, type: "i32" }], ["c", "const", { value: 3, type: "i32" }], ["ini", "initialize-array", { dims: 2 }], ["s", "array-size"], ["r", "arr-indicator", { type: A("i32") }]],
    [["k.result", "ini.element"], ["f.result", "ini.size"], ["c.result", "ini.size-1"], ["ini.result", "s.array"], ["s.size", "r.value"]]);
  assert.deepEqual(await correr(vacio), { r: [0, 3] });
});

// labview-captures/array-2d/for-indexed-input-tunnel-2d.png: a 2D array enters a For as rows.
test("a 2D array entering a For through an indexed tunnel gives one row per iteration", async () => {
  const v = vi([["f", "for-loop"], tabla("a"), ["suma", "add-array-elements", null, "f"], indicador("r", "number")], []);
  tunel(v, "ti", "in");
  tunel(v, "to", "out");
  for (const [de, a] of [["a.result", "ti.x"], ["ti.y", "suma.numeric-array"], ["suma.sum", "to.x"], ["to.y", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: [6, 15] });
});

test("rows passing through a For come out as the same 2D array", async () => {
  const v = vi([["f", "for-loop"], ["a", "arr-const", { type: A2("string"), value: [["a", "bc"], ["d", ""]] }], ["r", "arr-indicator", { type: A2("string") }]], []);
  tunel(v, "ti", "in");
  tunel(v, "to", "out");
  for (const [de, a] of [["a.result", "ti.x"], ["ti.y", "to.x"], ["to.y", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: [["a", "bc"], ["d", ""]] });
});

// labview-captures/array-2d/nested-for-2d-result.png: outer N = 2, inner N = 3, i + j → [[0,1,2],[1,2,3]].
test("two nested Fors build a 2D array through their indexed output tunnels", async () => {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 400, 300);
  const exterior = r.id;
  r = Gr.crearEstructura(r.g, CAT, "for-loop", 50, 50, 200, 150);
  const interior = r.id;
  g = Gr.meter(r.g, CAT, [interior], exterior);
  const nodo = (tipo, config, dentro) => {
    const k = Gr.crearNodo(g, CAT, tipo, 0, 0);
    g = config ? Gr.fijarConfig(k.g, k.id, config) : k.g;
    if (dentro) g = Gr.meter(g, CAT, [k.id], dentro);
    return k.id;
  };
  const [dos, tres, suma, indicadorId] = [nodo("const", { value: 2, type: "i32" }), nodo("const", { value: 3, type: "i32" }), nodo("add", null, interior), nodo("arr-indicator", { type: A2("i32") })];
  const de = (estructura, tipo) => g.nodos.find((n) => n.dentro === estructura && n.tipo === tipo).id;
  const unir = (a, pa, b, pb) => {
    const x = Gr.conectarCruzando(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" });
    assert.ok(!x.motivo, x.motivo);
    g = x.g;
  };
  unir(dos, "result", de(exterior, "loop-count"), "count");
  unir(tres, "result", de(interior, "loop-count"), "count");
  unir(de(exterior, "loop-iteration"), "i", suma, "a");
  unir(de(interior, "loop-iteration"), "i", suma, "b");
  unir(suma, "result", indicadorId, "value");
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.deepEqual(Object.values(await ejecutar(c, {})), [[[0, 1, 2], [1, 2, 3]]]);
});

test("a 2D I32 array is converted element by element where a 2D DBL is expected", async () => {
  const v = vi([["a", "arr-const", { type: A2("i32"), value: [[1, 2], [3, 4]] }], ["r", "arr-indicator", { type: A2("number") }]], [["a.result", "r.value"]]);
  assert.deepEqual(await correr(v), { r: [[1, 2], [3, 4]] });
});
