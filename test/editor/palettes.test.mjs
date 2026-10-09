// El modelo del diagrama: terminales del catálogo, cables, tipos y ciclos
// (spec/03-static-semantics.md; spec/05-editor.md reglas 28, 31 y 32). Sin
// navegador.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CONSTANTES, caja, contexto, glifosPorBloque, terminales } from "../../editor/src/block-diagram/diagram-view.mjs";
import { CONSTANTES_MATEMATICAS } from "../../core/model/math-constants.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { borrar, conectar, crearNodo, ejecutable, fijarConfig, nuevo, orden, tipos } from "../../core/model/graph.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

const NUMERIC = "palette.functions.programming.numeric";
const CTX = contexto(CAT, glifosPorBloque(INV));

/** Pone varios bloques y devuelve el diagrama y sus ids, en orden. */
function con(...bloques) {
  let g = nuevo();
  const ids = [];
  for (const b of bloques) {
    const r = crearNodo(g, CAT, b, 10 * ids.length, 0);
    g = r.g;
    ids.push(r.id);
  }
  return { g, ids };
}
const sal = (nodo, puerto = "result") => ({ nodo, puerto, dir: "out" });
const ent = (nodo, puerto) => ({ nodo, puerto, dir: "in" });

// Regla 56: lo que la paleta da por hecho tiene su bloque en el catálogo, su
// glifo, su caja y un terminal por cada puerto del catálogo.
test("cada función de numeric se pone en el diagrama con sus terminales", () => {
  const hechas = INV.hijos(NUMERIC).filter((e) => !esHueco(e) && e.bloque);
  assert.equal(hechas.length, 32);
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const nodo = g.nodos.find((n) => n.id === ids[0]);
    const ts = terminales(nodo, CTX);
    const { in: ins, out: outs } = CAT.puertos(nodo);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    assert.ok(outs.length > 0, `${e.id}: una función de Numeric da algo`);
    tipos(g, CAT); // se resuelve sin cables
  }
});

test("un puerto que no existe es un error", () => {
  const { g, ids } = con("add", "add");
  assert.throws(() => conectar(g, CAT, sal(ids[0], "out"), ent(ids[1], "a")), /no tiene el puerto de salida «out»/);
});

// Add con un I32 y un DBL: la suma es DBL y el I32 entra con punto de coerción.
test("una función toma el tipo común y marca la coerción", () => {
  let { g, ids } = con("num-const", "const", "add");
  const [i32, dbl, add] = ids;
  g = conectar(g, CAT, sal(i32), ent(add, "a")).g;
  g = conectar(g, CAT, sal(dbl), ent(add, "b")).g;
  const t = tipos(g, CAT);
  assert.equal(t.salidas.get(`${add}.result`), "number");
  const [ca, cb] = g.cables.map((c) => t.cables.get(c.id));
  assert.deepEqual([ca.tipo, ca.coercion, ca.roto], ["i32", true, null]);
  assert.deepEqual([cb.tipo, cb.coercion, cb.roto], ["number", false, null]);
});

test("dos enteros suman entero y dividen en DBL", () => {
  let { g, ids } = con("num-const", "num-const", "add", "div");
  const [a, b, add, div] = ids;
  for (const destino of [add, div]) {
    g = conectar(g, CAT, sal(a), ent(destino, "a")).g;
    g = conectar(g, CAT, sal(b), ent(destino, "b")).g;
  }
  const t = tipos(g, CAT);
  assert.equal(t.salidas.get(`${add}.result`), "i32");
  assert.equal(t.salidas.get(`${div}.result`), "number");
  assert.ok([...t.cables.values()].every((c) => !c.coercion), "ninguna entrada convierte");
});

test("sin nada cableado una función numérica enseña DBL", () => {
  const { g, ids } = con("add");
  assert.equal(tipos(g, CAT).salidas.get(`${ids[0]}.result`), "number");
});

// spec/06-visual.md §5.1: el cable entre tipos que no convierten se dibuja, roto, y dice por qué.
test("un cable entre tipos incompatibles queda roto y explica por qué", () => {
  let { g, ids } = con("const", "add-array-elements");
  g = conectar(g, CAT, sal(ids[0]), ent(ids[1], "numeric-array")).g;
  const c = tipos(g, CAT).cables.get(g.cables[0].id);
  assert.match(c.roto, /espera array de DBL y el cable lleva DBL/);
});

// spec/05 regla 31: lo que no puede ser un cable no se crea, y se dice por qué.
test("dos salidas o dos entradas no se unen y se explica", () => {
  const { g, ids } = con("const", "const", "add");
  assert.match(conectar(g, CAT, sal(ids[0]), sal(ids[1])).motivo, /dos terminales son salidas/);
  assert.match(conectar(g, CAT, ent(ids[2], "a"), ent(ids[2], "b")).motivo, /dos terminales son entradas/);
});

// spec/05 regla 32: la entrada ocupada se queda con el cable nuevo.
test("un cable a una entrada ocupada sustituye al anterior", () => {
  let { g, ids } = con("const", "num-const", "add");
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "a")).g;
  g = conectar(g, CAT, ent(ids[2], "a"), sal(ids[1])).g; // también empezando por la entrada
  assert.equal(g.cables.length, 1);
  assert.equal(g.cables[0].de.nodo, ids[1]);
});

// Regla 9: el ciclo es un dato, con sus nodos; sus cables quedan rotos.
test("un ciclo se devuelve con sus nodos y rompe sus cables", () => {
  let { g, ids } = con("const", "add", "increment");
  const [c, add, inc] = ids;
  g = conectar(g, CAT, sal(c), ent(add, "a")).g;
  g = conectar(g, CAT, sal(add), ent(inc, "x")).g;
  g = conectar(g, CAT, sal(inc), ent(add, "b")).g;
  assert.deepEqual(orden(g).ciclo.sort(), [add, inc].sort());
  const t = tipos(g, CAT);
  const rotos = g.cables.filter((k) => t.cables.get(k.id).roto);
  assert.equal(rotos.length, 2);
  assert.match(t.cables.get(rotos[0].id).roto, /ciclo/);
});

// spec/05 regla 28: no quedan cables colgando.
test("borrar un nodo borra sus cables", () => {
  let { g, ids } = con("const", "add", "increment");
  g = conectar(g, CAT, sal(ids[0]), ent(ids[1], "a")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "x")).g;
  g = borrar(g, [ids[1]]);
  assert.deepEqual(g.nodos.map((n) => n.id), [ids[0], ids[2]]);
  assert.equal(g.cables.length, 0);
});

test("cada nodo tiene un nombre único", () => {
  const { g } = con("add", "add", "const");
  assert.deepEqual(g.nodos.map((n) => n.name), ["add_1", "add_2", "const_1"]);
});

// spec/03 regla 10: lo que pone la flecha de Run rota.
test("un vi con entradas sin cablear no se puede ejecutar", () => {
  let { g, ids } = con("const", "const", "add");
  assert.equal(ejecutable(g, CAT, tipos(g, CAT)), false);
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "a")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "b")).g;
  assert.equal(ejecutable(g, CAT, tipos(g, CAT)), true);
});

// Lo mismo para Boolean, capturada en LabVIEW 2026 Q3: los terminales, con los
// nombres de la ayuda contextual (x, y; Boolean array; number).
test("cada función de boolean se pone en el diagrama con sus terminales", () => {
  const BOOLEAN = "palette.functions.programming.boolean";
  const hechas = INV.hijos(BOOLEAN).filter((e) => !esHueco(e));
  assert.equal(hechas.length, 16);
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const ts = terminales(g.nodos.find((n) => n.id === ids[0]), CTX);
    const { in: ins, out: outs } = CAT.puertos(g.nodos[0]);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT);
  }
  const and = CAT.puertos({ tipo: "and-op" });
  assert.deepEqual([...and.in, ...and.out].map((p) => p.label), ["x", "y", "x .and. y?"]);
});

// Lo mismo para Comparison, capturada en LabVIEW 2026 Q3 (paletas/functions-comparison.png
// y sus cinco hojas de ayuda contextual): los terminales con los nombres de la ayuda.
test("cada función de comparison se pone en el diagrama con sus terminales", () => {
  const COMPARISON = "palette.functions.programming.comparison";
  const hechas = INV.hijos(COMPARISON).filter((e) => !esHueco(e) && e.bloque);
  assert.equal(hechas.length, 21, "las 16 de números y booleanos, Empty String/Path? y las cuatro de carácter");
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const ts = terminales(g.nodos.find((n) => n.id === ids[0]), CTX);
    const { in: ins, out: outs } = CAT.puertos(g.nodos[0]);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT);
  }
  // Cada hueco de la subpaleta tiene su glifo en gris, en su sitio.
  for (const e of INV.hijos(COMPARISON).filter((x) => esHueco(x) && !x.id.endsWith(".thumbtack"))) assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo`);
  const etiquetas = (b) => {
    const p = CAT.puertos({ tipo: b });
    return [...p.in, ...p.out].map((q) => q.label);
  };
  assert.deepEqual(etiquetas("equal"), ["x", "y", "x = y?"]);
  assert.deepEqual(etiquetas("not-equal"), ["x", "y", "x != y?"]);
  assert.deepEqual(etiquetas("less-or-equal-to-0"), ["x", "x <= 0?"]);
  assert.deepEqual(etiquetas("select"), ["t", "s", "f", "s? t:f"]);
  assert.deepEqual(etiquetas("max-and-min"), ["x", "y", "max(x,y)", "min(x,y)"]);
  assert.deepEqual(etiquetas("in-range-and-coerce"), ["upper limit", "x", "lower limit", "coerced(x)", "In Range?"]);
  assert.deepEqual(etiquetas("not-a-number-path-refnum"), ["number/path/refnum", "NaN/Path/Refnum?"]);
  // Las medidas del diagrama, a 1:1: un triángulo de 19 × 20 px; Max & Min, 30 × 30; In Range, 30 × 22.
  const [c, mm, ir] = ["equal", "max-and-min", "in-range-and-coerce"].map((b) => G.CAJAS[b]);
  assert.deepEqual([(c[2] - c[0]) / 1.5, (c[3] - c[1]) / 1.5], [19, 20]);
  assert.deepEqual([(mm[2] - mm[0]) / 1.5, (mm[3] - mm[1]) / 1.5], [30, 30]);
  assert.deepEqual([(ir[2] - ir[0]) / 1.5, (ir[3] - ir[1]) / 1.5], [30, 22]);
});

// Timing, capturada en LabVIEW 2026 Q3 (run/timing-nombres.png): los terminales
// con los nombres de la ayuda contextual, y el nodo de 32 × 32 px (run/s15.png).
test("cada función de timing se pone en el diagrama con sus terminales", () => {
  const TIMING = "palette.functions.programming.timing";
  const hechas = INV.hijos(TIMING).filter((e) => !esHueco(e) && e.bloque);
  assert.deepEqual(hechas.map((e) => e.bloque), ["tick-count-ms", "wait-ms", "wait-until-next-ms-multiple"]);
  for (const e of hechas) {
    const { g, ids } = con(e.bloque);
    const ts = terminales(g.nodos.find((n) => n.id === ids[0]), CTX);
    const { in: ins, out: outs } = CAT.puertos(g.nodos[0]);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
  }
  for (const e of INV.hijos(TIMING).filter((x) => !x.id.endsWith(".thumbtack"))) assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo`);
  const etiquetas = (b) => {
    const p = CAT.puertos({ tipo: b });
    return [...p.in, ...p.out].map((q) => q.label);
  };
  assert.deepEqual(etiquetas("tick-count-ms"), ["millisecond timer value"]);
  assert.deepEqual(etiquetas("wait-ms"), ["milliseconds to wait", "millisecond timer value"]);
  assert.deepEqual(etiquetas("wait-until-next-ms-multiple"), ["millisecond multiple", "millisecond timer value"]);
  const k = G.CAJAS["wait-ms"];
  assert.deepEqual([(k[2] - k[0]) / 1.5, (k[3] - k[1]) / 1.5], [32, 32]);
});

// Comparison sin cablear es DBL (terminales naranja); con un número, el tipo común
// y la coerción; con booleanos, booleanos; booleano y número no se mezclan. Select
// toma el tipo común de t y f (medido: U8 e I8 dan U8).
test("las comparaciones toman el tipo común, comparan booleanos y no mezclan", () => {
  const solo = con("equal");
  assert.equal(tipos(solo.g, CAT).entradas.get(`${solo.ids[0]}.x`), "number");
  assert.equal(tipos(solo.g, CAT).salidas.get(`${solo.ids[0]}.result`), "boolean");

  let { g, ids } = con("num-const", "const", "greater");
  g = fijarConfig(g, ids[0], { type: "i32", value: 3 });
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "x")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "y")).g;
  let r = tipos(g, CAT);
  assert.equal(r.entradas.get(`${ids[2]}.x`), "number");
  assert.equal([...r.cables.values()][0].coercion, true, "el I32 entra a la comparación con punto de coerción");
  assert.equal(r.salidas.get(`${ids[2]}.result`), "boolean");

  ({ g, ids } = con("bool-const", "bool-const", "less"));
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "x")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "y")).g;
  r = tipos(g, CAT);
  assert.equal(r.entradas.get(`${ids[2]}.y`), "boolean");
  assert.ok([...r.cables.values()].every((c) => !c.roto && !c.coercion));

  ({ g, ids } = con("bool-const", "const", "equal"));
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "x")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "y")).g;
  assert.match([...tipos(g, CAT).cables.values()][1].roto, /incompatibles/);

  ({ g, ids } = con("num-const", "num-const", "bool-const", "select"));
  g = fijarConfig(g, ids[0], { type: "u8", value: 200 });
  g = fijarConfig(g, ids[1], { type: "i8", value: -1 });
  g = conectar(g, CAT, sal(ids[0]), ent(ids[3], "t")).g;
  g = conectar(g, CAT, sal(ids[2]), ent(ids[3], "s")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[3], "f")).g;
  r = tipos(g, CAT);
  assert.equal(r.salidas.get(`${ids[3]}.result`), "u8");
  assert.equal([...r.cables.values()][2].coercion, true, "f entra a Select con punto de coerción, como se vio en LabVIEW");
});

// Comprobado en LabVIEW: sin cablear, And es booleano; con un DBL, la entrada
// lleva punto de coerción y la salida es entera; booleano y número no se mezclan.
test("las funciones lógicas operan con booleanos o bit a bit con enteros", () => {
  const verde = con("and-op");
  assert.equal(tipos(verde.g, CAT).salidas.get(`${verde.ids[0]}.result`), "boolean");

  let { g, ids } = con("const", "and-op");
  g = conectar(g, CAT, sal(ids[0]), ent(ids[1], "x")).g;
  let r = tipos(g, CAT);
  assert.equal(r.salidas.get(`${ids[1]}.result`), "i64");
  assert.equal([...r.cables.values()][0].coercion, true);

  ({ g, ids } = con("bool-const", "const", "or-op"));
  g = conectar(g, CAT, sal(ids[0]), ent(ids[2], "x")).g;
  g = conectar(g, CAT, sal(ids[1]), ent(ids[2], "y")).g;
  r = tipos(g, CAT);
  assert.equal(r.salidas.get(`${ids[2]}.result`), "boolean");
  assert.match([...r.cables.values()][1].roto, /incompatibles/);

  // Compound Arithmetic en AND con booleanos opera sobre booleanos.
  ({ g, ids } = con("bool-const", "compound-arithmetic"));
  g = conectar(g, CAT, sal(ids[0]), ent(ids[1], "value-0")).g;
  g = { ...g, nodos: g.nodos.map((n) => (n.id === ids[1] ? { ...n, config: { ...n.config, mode: "and" } } : n)) };
  assert.equal(tipos(g, CAT).salidas.get(`${ids[1]}.result`), "boolean");
});

// La subpaleta Conversion, capturada en LabVIEW 2026 Q3 (paletas/functions-numeric-
// conversion.png): una entrada `number` y una salida con el nombre de su tipo.
test("cada función de conversion se pone en el diagrama con sus terminales", () => {
  const CONVERSION = "palette.functions.programming.numeric.conversion";
  const hechas = INV.hijos(CONVERSION).filter((e) => !esHueco(e));
  assert.equal(hechas.length, 13);
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const ts = terminales(g.nodos.find((n) => n.id === ids[0]), CTX);
    const { in: ins, out: outs } = CAT.puertos(g.nodos[0]);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT);
  }
  // Una entrada sin cablear es DBL; la salida es la del nombre de la función.
  const tipoSalida = (bloque) => {
    const { g, ids } = con(bloque);
    return tipos(g, CAT).salidas.get(`${ids[0]}.result`);
  };
  assert.deepEqual(
    ["to-double-precision-float", "to-single-precision-float", "to-quad-integer", "to-long-integer", "to-word-integer", "to-byte-integer", "to-unsigned-quad-integer", "to-unsigned-long-integer", "to-unsigned-word-integer", "to-unsigned-byte-integer"].map(tipoSalida),
    ["number", "sgl", "i64", "i32", "i16", "i8", "u64", "u32", "u16", "u8"],
  );
  assert.equal(CAT.puertos({ tipo: "to-long-integer" }).out[0].label, "32bit integer");
});

// La subpaleta Data Manipulation, capturada en LabVIEW 2026 Q3 (paletas/functions-
// numeric-data-manipulation.png). Los tipos: Split Number da dos enteros sin
// signo de la mitad de bits (U32 → U16 sin cablear, observado), Join Numbers
// el doble, y el resto devuelve el tipo de lo que se le cablea.
test("cada función de data manipulation se pone en el diagrama con sus terminales", () => {
  const DATOS = "palette.functions.programming.numeric.data-manipulation";
  const hechas = INV.hijos(DATOS).filter((e) => !esHueco(e));
  assert.equal(hechas.length, 9);
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const ts = terminales(g.nodos.find((n) => n.id === ids[0]), CTX);
    const { in: ins, out: outs } = CAT.puertos(g.nodos[0]);
    assert.deepEqual(ts.map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT);
  }
  const sin = (bloque) => {
    const { g, ids } = con(bloque);
    const t = tipos(g, CAT);
    return Object.fromEntries(CAT.puertos(g.nodos[0]).out.map((p) => [p.name, t.salidas.get(`${ids[0]}.${p.name}`)]));
  };
  assert.deepEqual(sin("split-number"), { hi: "u16", lo: "u16" });
  assert.deepEqual(sin("join-numbers"), { result: "u32" });
  assert.deepEqual(sin("swap-bytes"), { result: "u32" });
  assert.deepEqual(sin("rotate"), { result: "i32" });
  assert.deepEqual(sin("rotate-left-with-carry"), { "carry-out": "boolean", "value-out": "i32" });
  assert.deepEqual(sin("mantissa-and-exponent"), { mantissa: "number", exponent: "number" });

  // Con algo cableado: el tipo sigue al cable, con el ancho que admite cada función.
  const con1 = (bloque, tipo, puerto) => {
    let { g, ids } = con("num-const", bloque);
    g = fijarConfig(g, ids[0], { type: tipo });
    g = conectar(g, CAT, sal(ids[0]), ent(ids[1], puerto)).g;
    const t = tipos(g, CAT);
    return CAT.puertos(g.nodos[1]).out.map((p) => t.salidas.get(`${ids[1]}.${p.name}`));
  };
  assert.deepEqual(con1("split-number", "i64", "x"), ["u32", "u32"]);
  assert.deepEqual(con1("split-number", "u8", "x"), ["u8", "u8"], "un byte sube a 16 bits antes de partirse");
  assert.deepEqual(con1("split-number", "number", "x"), ["u32", "u32"], "un DBL pasa al entero de 64 bits");
  assert.deepEqual(con1("join-numbers", "u8", "hi"), ["u16"]);
  assert.deepEqual(con1("join-numbers", "i64", "hi"), ["u64"], "como mucho 32 bits por mitad");
  assert.deepEqual(con1("rotate", "u8", "x"), ["u8"]);
});

// Math & Scientific Constants, capturada en LabVIEW 2026 Q3 (paletas/functions-
// numeric-math-constants.png): 17 constantes DBL, con los valores de su ayuda.
test("cada constante de math and scientific constants se pone en el diagrama y vale lo que en LabVIEW", () => {
  const RAIZ = "palette.functions.programming.numeric.math-and-scientific-constants";
  const hechas = INV.hijos(RAIZ).filter((e) => !esHueco(e));
  assert.equal(hechas.length, 17);
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    assert.equal(tipos(g, CAT).salidas.get(`${ids[0]}.result`), "number", "todas son DBL");
    assert.ok(CONSTANTES[e.bloque], `${e.id}: no se pinta como constante`);
    assert.ok(CONSTANTES_MATEMATICAS[e.bloque].valor > 0);
  }
  // Los valores que enseña la ayuda contextual.
  const v = (n) => CONSTANTES_MATEMATICAS[n].valor;
  assert.equal(v("pi"), 3.141592653589793);
  assert.equal(v("natural-logarithm-base"), 2.718281828459045);
  assert.equal(v("speed-of-light-in-vacuum"), 299792458);
  assert.equal(v("plancks-constant"), 6.62607015e-34);
  assert.equal(v("rydberg-constant"), 10973731.56816);
  assert.equal(v("molar-gas-constant"), 8.314462618);
  assert.equal(v("natural-logarithm-of-10"), 2.302585092994046);
});

// String, capturada en LabVIEW 2026 Q3 (string/string-subpaleta.png, las tres carpetas
// y las hojas de ayuda contextual): los terminales con los nombres de la ayuda y las
// cajas con las medidas del diagrama a 1:1 (string/bd-funciones-1.png).
test("cada función de string se pone en el diagrama con sus terminales", () => {
  const STRING = "palette.functions.programming.string";
  const todas = [
    ...INV.hijos(STRING),
    ...INV.hijos(`${STRING}.number-string-conversion`),
    ...INV.hijos(`${STRING}.additional-string-functions`),
  ].filter((e) => !e.id.endsWith(".thumbtack") && !INV.tieneContenido(e.id) && !e.etiqueta.includes("Conversion"));
  const hechas = todas.filter((e) => !esHueco(e) && e.bloque);
  assert.equal(hechas.length, 17 + 10 + 2, "String (with Scan From String and Format Into String), Number/String Conversion y Additional String Functions");
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    const { g, ids } = con(e.bloque);
    const nodo = g.nodos.find((n) => n.id === ids[0]);
    const { in: ins, out: outs } = CAT.puertos(nodo);
    assert.deepEqual(terminales(nodo, CTX).map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT); // se resuelve sin cables
  }
  // Cada hueco, con su glifo en gris.
  for (const e of todas.filter((x) => esHueco(x))) assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo`);
  const etiquetas = (b) => {
    const p = CAT.puertos({ tipo: b });
    return [...p.in, ...p.out].map((q) => q.label);
  };
  assert.deepEqual(etiquetas("string-length"), ["string", "length"]);
  assert.deepEqual(etiquetas("concatenate-strings"), ["string", "string", "concatenated string"]);
  assert.deepEqual(etiquetas("string-subset"), ["string", "offset", "length", "substring"]);
  assert.deepEqual(etiquetas("trim-whitespace"), ["location", "string", "trimmed string"]);
  assert.deepEqual(etiquetas("replace-substring"), ["string", 'substring ("")', "offset (0)", "length (len. of substring)", "result string", "replaced substring"]);
  assert.deepEqual(etiquetas("search-and-replace-string"), ["multiline? (F)", "ignore case? (F)", "replace all? (F)", "input string", "search string", 'replace string ("")', "offset (0)", "error in (no error)", "result string", "number of replacements", "offset past replacement", "error out"]);
  assert.deepEqual(etiquetas("number-to-fractional-string"), ["use system decimal point (T)", "number", "width (-)", "precision (6)", "F-format string"]);
  assert.deepEqual(etiquetas("decimal-string-to-number"), ["string", "offset", "default (0 I32)", "offset past number", "number"]);
  assert.deepEqual(etiquetas("fract-exp-string-to-number"), ["use system decimal point (T)", "string", "offset", "default (0 DBL)", "offset past number", "number"]);
  // Las medidas del diagrama, a 1:1, en píxeles: String Length, 32 × 17; String Subset, 44 × 32; To Upper Case, 37 × 11.
  const medida = (b) => {
    const [x0, y0, x1, y1] = G.CAJAS[b];
    return [(x1 - x0) / 1.5, (y1 - y0) / 1.5];
  };
  assert.deepEqual(medida("string-length"), [32, 17]);
  assert.deepEqual(medida("string-subset"), [44, 32]);
  assert.deepEqual(medida("to-upper-case"), [37, 11]);
  assert.deepEqual(medida("number-to-fractional-string"), [44, 38]);
  assert.deepEqual(G.TAMANOS["string-subset"], [44, 32], "el glifo trae su tamaño: es más ancho que la rejilla de la paleta");
  // Una caja que el diagrama mide como el glifo.
  const { g, ids } = con("string-subset");
  const k = caja(g.nodos.find((n) => n.id === ids[0]), CTX);
  assert.deepEqual([k.ancho, k.alto], [44, 32]);
});

test("las comparaciones y Select toman cadenas y no las mezclan con números", () => {
  let { g, ids } = con("const", "equal", "str-const");
  g = conectar(g, CAT, sal(ids[2]), ent(ids[1], "x")).g;
  assert.equal(tipos(g, CAT).entradas.get(`${ids[1]}.y`), "string", "con una cadena en x, y es una cadena");
  g = conectar(g, CAT, sal(ids[0]), ent(ids[1], "y")).g;
  assert.match(tipos(g, CAT).cables.get(g.cables.at(-1).id).roto, /Tipos incompatibles/, "un número en una entrada de cadena rompe el cable");
  // Select con cadenas da una cadena.
  let s = con("str-const", "str-const", "select");
  let h = conectar(s.g, CAT, sal(s.ids[0]), ent(s.ids[2], "t")).g;
  h = conectar(h, CAT, sal(s.ids[1]), ent(s.ids[2], "f")).g;
  assert.equal(tipos(h, CAT).salidas.get(`${s.ids[2]}.result`), "string");
  // Las funciones de carácter aceptan una cadena o un número; sin cablear, una cadena.
  const d = con("decimal-digit", "const");
  assert.equal(tipos(d.g, CAT).entradas.get(`${d.ids[0]}.char`), "string");
  const c = conectar(d.g, CAT, sal(d.ids[1]), ent(d.ids[0], "char")).g;
  assert.equal(tipos(c, CAT).entradas.get(`${d.ids[0]}.char`), "number");
});

// Array, capturada en LabVIEW 2026 Q3 (array/subpaleta-array-5-columnas.png y las hojas de ayuda
// contextual array/ayuda-NN.png): 34 elementos, de los que están hechos los de una dimensión; los
// terminales son los de la ayuda y las cajas, las medidas del diagrama a 1:1 (array/60-funciones.png).
test("cada función de array se pone en el diagrama con sus terminales", () => {
  const ARRAY = "palette.functions.programming.array";
  const todas = INV.hijos(ARRAY).filter((e) => !e.id.endsWith(".thumbtack") && !INV.tieneContenido(e.id));
  const hechas = todas.filter((e) => !esHueco(e) && e.bloque);
  assert.equal(todas.length, 34);
  assert.equal(hechas.length, 17, "las de una dimensión");
  for (const e of hechas) {
    assert.ok(CAT.tiene(e.bloque), `${e.id}: su bloque ${e.bloque} no está en el catálogo`);
    assert.ok(G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)], `${e.id}: sin glifo o sin caja`);
    if (e.bloque === "arr-const") continue;
    const { g, ids } = con(e.bloque);
    const nodo = g.nodos.find((n) => n.id === ids[0]);
    const { in: ins, out: outs } = CAT.puertos(nodo);
    assert.deepEqual(terminales(nodo, CTX).map((t) => t.puerto), [...ins, ...outs].map((p) => p.name), e.id);
    tipos(g, CAT);
  }
  for (const e of todas.filter((x) => esHueco(x))) assert.ok(G.SUBPALETAS[ultimo(e.id)] || (G.FUNCIONES[ultimo(e.id)] && G.CAJAS[ultimo(e.id)]), `${e.id}: sin glifo`);
  const etiquetas = (b) => {
    const p = CAT.puertos({ tipo: b });
    return [[...p.in].map((q) => q.label), p.out.map((q) => q.label)];
  };
  assert.deepEqual(etiquetas("replace-array-subset"), [["n-dimension array", "index 0", "new element/subarray"], ["output array"]]);
  assert.deepEqual(etiquetas("delete-from-array"), [["n-dim array", "length (1)", "index 0 (last elem)"], ["array w/ subset deleted", "deleted portion"]]);
  assert.deepEqual(etiquetas("rotate-1d-array"), [["n", "array"], ["array (last n elements first)"]]);
  assert.deepEqual(etiquetas("split-1d-array"), [["array", "index"], ["first subarray", "second subarray"]]);
  assert.deepEqual(etiquetas("increment-array-element"), [["array in", "index"], ["array out"]]);
  const medida = (b) => {
    const [x0, y0, x1, y1] = G.CAJAS[b];
    return [(x1 - x0) / 1.5, (y1 - y0) / 1.5];
  };
  assert.deepEqual(medida("array-size"), [32, 21]);
  assert.deepEqual(medida("array-subset"), [32, 35]);
  assert.deepEqual(medida("reverse-1d-array"), [32, 23]);
  assert.deepEqual(medida("rotate-1d-array"), [32, 18]);
  assert.deepEqual(G.TAMANOS["sort-2d-array"], [44, 32]);
});
