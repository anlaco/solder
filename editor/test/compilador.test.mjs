// Compilar un VI a WebAssembly y ejecutarlo (nucleo/compilador.mjs y
// nucleo/ejecutar.mjs). Cada caso construye un diagrama con las operaciones del
// grafo, lo ejecuta de verdad y mira lo que llega a los indicadores.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar, convertir } from "../../nucleo/compilador.mjs";
import { ejecutar } from "../../nucleo/ejecutar.mjs";
import * as Gr from "../../nucleo/grafo.mjs";
import { leer } from "../../nucleo/qvi.mjs";
import { CAT, leer as leerJson } from "./comun.mjs";

/**
 * Un diagrama pequeño: `nodos` es una lista de [nombre, bloque, config]; `cables`,
 * de ["origen.puerto", "destino.puerto"]. Cada indicador se llama como su nombre.
 */
function vi(nodos, cables) {
  let g = Gr.nuevo();
  const id = {};
  for (const [nombre, bloque, config] of nodos) {
    const r = Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    id[nombre] = r.id;
  }
  for (const [de, a] of cables) {
    const [n1, p1] = de.split(".");
    const [n2, p2] = a.split(".");
    g = Gr.conectar(g, CAT, { nodo: id[n1], puerto: p1, dir: "out" }, { nodo: id[n2], puerto: p2, dir: "in" }).g;
  }
  return { g, id };
}

/** Compila y ejecuta; devuelve lo que llega a cada indicador, por su nombre. */
async function correr({ g, id }, valores = {}) {
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.ok(WebAssembly.validate(c.bytes), "el módulo es WebAssembly válido");
  const porNombre = Object.fromEntries(Object.entries(id).map(([k, v]) => [v, k]));
  const deControles = Object.fromEntries(Object.entries(valores).map(([k, v]) => [id[k], v]));
  const escritos = await ejecutar(c, deControles);
  return Object.fromEntries(Object.entries(escritos).map(([k, v]) => [porNombre[k], v]));
}

// El criterio de R0 (plan provisional §7): el ejemplo suma 5 y 3.
test("suma basica se compila a webassembly y da 8", async () => {
  const g = leer(leerJson("docs/schema/examples/suma-basica.qvi.json"), CAT);
  const c = compilar(g, CAT);
  const valores = Object.fromEntries(c.controles.map((k) => [k.nodo, g.nodos.find((n) => n.id === k.nodo).config.value]));
  assert.deepEqual(Object.values(await ejecutar(c, valores)), [8]);
});

test("un control y un indicador del panel se cablean y run pasa el valor", async () => {
  let g = Gr.nuevo();
  let r = Gr.crearEnPanel(g, CAT, "control", 0, 0, "Numeric");
  g = r.g;
  const k = r.id;
  r = Gr.crearEnPanel(g, CAT, "indicator", 0, 0, "Numeric");
  g = Gr.conectar(r.g, CAT, { nodo: k, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
  assert.deepEqual(await correr({ g, id: { control: k, indicador: r.id } }, { control: 12.5 }), { indicador: 12.5 });
});

test("las funciones de numeric calculan como labview", async () => {
  const dos = (bloque, a, b, tipo = "number") =>
    vi(
      [["a", "num-const", { value: a, type: tipo }], ["b", "num-const", { value: b, type: tipo }], ["f", bloque], ["r", "indicator"]],
      [["a.result", "f.a"], ["b.result", "f.b"], ["f.result", "r.value"]],
    );
  assert.equal((await correr(dos("add", 2.5, 4, "number"))).r, 6.5);
  assert.equal((await correr(dos("sub", 2, 5, "i32"))).r, -3);
  assert.equal((await correr(dos("mul", 6, 7, "i32"))).r, 42);
  // Dividir dos enteros da DBL (DT-038).
  assert.equal((await correr(dos("div", 7, 2, "i32"))).r, 3.5);
  // Los enteros desbordan dando la vuelta: 127 + 1 en I8 es −128.
  assert.equal((await correr(dos("add", 127, 1, "i8"))).r, -128);
  assert.equal((await correr(dos("add", 250, 10, "u8"))).r, 4);

  const uno = async (bloque, v, tipo = "number") =>
    (await correr(vi([["a", "num-const", { value: v, type: tipo }], ["f", bloque], ["r", "indicator"]], [["a.result", "f.x"], ["f.result", "r.value"]]))).r;
  assert.equal(await uno("increment", 41, "i32"), 42);
  assert.equal(await uno("negate", 3, "i32"), -3);
  assert.equal(await uno("absolute-value", -9, "i32"), 9);
  assert.equal(await uno("square", 12), 144);
  assert.equal(await uno("square-root", 16, "i32"), 4);
  assert.equal(await uno("reciprocal", 4), 0.25);
  assert.equal(await uno("round-toward-negative-infinity", -2.5), -3);

  // Quotient & Remainder: floor(x/y) y x − y·floor(x/y).
  const q = vi(
    [["x", "num-const", { value: -7, type: "i32" }], ["y", "num-const", { value: 2, type: "i32" }], ["f", "quotient-remainder"], ["resto", "indicator"], ["cociente", "indicator"]],
    [["x.result", "f.x"], ["y.result", "f.y"], ["f.remainder", "resto.value"], ["f.quotient", "cociente.value"]],
  );
  assert.deepEqual(await correr(q), { resto: 1, cociente: -4 });
});

// De coma flotante a entero, LabVIEW redondea al más cercano (al par en el
// punto medio) y satura.
test("las coerciones redondean y saturan", async () => {
  const ops = (desde, hacia) => convertir(desde, hacia).map((i) => i.op);
  assert.deepEqual(ops("number", "i32"), ["f64.nearest", "i32.trunc_sat_f64_s"]);
  assert.deepEqual(ops("number", "u8"), ["f64.nearest", "f64.const", "f64.max", "f64.const", "f64.min", "i32.trunc_sat_f64_u"]);
  assert.deepEqual(ops("i32", "number"), ["f64.convert_i32_s"]);
  assert.deepEqual(ops("u32", "i64"), ["i64.extend_i32_u"]);
  // Y ejecutado: un DBL de 2,5 cableado a la entrada I32 de Scale By Power Of 2 (n) vale 2.
  const s = vi(
    [["n", "const", { value: 2.5 }], ["x", "num-const", { value: 1, type: "i32" }], ["f", "scale-by-power-of-2"], ["r", "indicator"]],
    [["n.result", "f.n"], ["x.result", "f.x"], ["f.result", "r.value"]],
  );
  assert.equal((await correr(s)).r, 4, "1 · 2^2: el 2,5 se redondea al par, 2");
});

test("la logica opera con booleanos y bit a bit con enteros", async () => {
  const log = async (bloque, x, y, tipo) => {
    const c = tipo === "boolean" ? (v) => ["bool-const", { value: v }] : (v) => ["num-const", { value: v, type: tipo }];
    const nodos = [["x", ...c(x)], ["y", ...c(y)], ["f", bloque], ["r", "indicator"]];
    const cables = [["x.result", "f.x"], ["y.result", "f.y"], ["f.result", "r.value"]];
    // Un indicador numérico no admite booleanos: se pasa por Boolean To (0,1).
    if (tipo === "boolean") {
      nodos.push(["b", "boolean-to-0-1"]);
      cables.splice(2, 1, ["f.result", "b.boolean"], ["b.result", "r.value"]);
    }
    return (await correr(vi(nodos, cables))).r;
  };
  assert.equal(await log("and-op", true, true, "boolean"), 1);
  assert.equal(await log("and-op", true, false, "boolean"), 0);
  assert.equal(await log("nor-op", false, false, "boolean"), 1);
  assert.equal(await log("implies-op", true, false, "boolean"), 0);
  assert.equal(await log("xor-op", 0b1100, 0b1010, "i32"), 0b0110);
  assert.equal(await log("nand-op", 0xff, 0x0f, "u8"), 0xf0);
});

test("compound arithmetic suma todas sus entradas con las invertidas negadas", async () => {
  const g = vi(
    [["a", "num-const", { value: 10, type: "i32" }], ["b", "num-const", { value: 3, type: "i32" }], ["c", "num-const", { value: 2, type: "i32" }], ["f", "compound-arithmetic", { inputs: 3, inverted: ["value-1"] }], ["r", "indicator"]],
    [["a.result", "f.value-0"], ["b.result", "f.value-1"], ["c.result", "f.value-2"], ["f.result", "r.value"]],
  );
  assert.equal((await correr(g)).r, 9, "10 − 3 + 2");
});

test("lo que no se puede compilar se explica", () => {
  const roto = vi([["f", "add"], ["r", "indicator"]], [["f.result", "r.value"]]);
  assert.match(compilar(roto.g, CAT).errores[0].motivo, /le falta un cable en su entrada «x»/);
  const dosD = vi([["a", "arr-const", { type: { array: { array: "number" } } }], ["s", "array-size"], ["r", "indicator"]], [["a.result", "s.array"], ["s.size", "r.value"]]);
  assert.ok(compilar(dosD.g, CAT).errores, "los arrays de 2 dimensiones, todavía no (M6)");
});

test("un control y un indicador con otra representación pasan su valor tal cual", async () => {
  let g = Gr.nuevo();
  const par = (tipoControl, tipoIndicador) => {
    let r = Gr.crearEnPanel(g, CAT, "control", 0, 0, "Numeric");
    const c = r.id;
    r = Gr.crearEnPanel(r.g, CAT, "indicator", 0, 0, "Numeric");
    g = Gr.fijarRepresentacion(Gr.fijarRepresentacion(r.g, c, tipoControl), r.id, tipoIndicador);
    g = Gr.conectar(g, CAT, { nodo: c, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
    return [c, r.id];
  };
  const [c1, i1] = par("u8", "i32");
  const [c2, i2] = par("u32", "u32");
  const [c3, i3] = par("i8", "sgl");
  const compilado = compilar(g, CAT);
  assert.ok(!compilado.errores, JSON.stringify(compilado.errores));
  assert.ok(WebAssembly.validate(compilado.bytes));
  const escritos = await ejecutar(compilado, { [c1]: 200, [c2]: 4000000000, [c3]: -5 });
  assert.deepEqual([escritos[i1], escritos[i2], escritos[i3]], [200, 4000000000, -5]);
});

// «To Long Integer»: «rounds all floating-point … to the nearest integer», que
// es el redondeo al par (LabVIEW 2026 Q3, 2,5 → 2); satura al salir de rango.
test("las conversiones de numeric redondean y cambian de tipo", async () => {
  const caso = async (bloque, valor, tipoControl = "number") => {
    let g = Gr.nuevo();
    let r = Gr.crearEnPanel(g, CAT, "control", 0, 0, "Numeric");
    const c = r.id;
    g = Gr.fijarRepresentacion(r.g, c, tipoControl);
    r = Gr.crearNodo(g, CAT, bloque, 0, 0);
    const f = r.id;
    r = Gr.crearEnPanel(r.g, CAT, "indicator", 0, 0, "Numeric");
    g = Gr.fijarRepresentacion(r.g, r.id, { "to-long-integer": "i32", "to-byte-integer": "i8", "to-unsigned-byte-integer": "u8", "to-single-precision-float": "sgl", "to-double-precision-float": "number" }[bloque]);
    g = Gr.conectar(g, CAT, { nodo: c, puerto: "result", dir: "out" }, { nodo: f, puerto: "number", dir: "in" }).g;
    g = Gr.conectar(g, CAT, { nodo: f, puerto: "result", dir: "out" }, { nodo: r.id, puerto: "value", dir: "in" }).g;
    const compilado = compilar(g, CAT);
    assert.ok(!compilado.errores, JSON.stringify(compilado.errores));
    assert.ok(WebAssembly.validate(compilado.bytes));
    return (await ejecutar(compilado, { [c]: valor }))[r.id];
  };
  assert.equal(await caso("to-long-integer", 3.7), 4);
  assert.equal(await caso("to-long-integer", 2.5), 2, "al par");
  assert.equal(await caso("to-long-integer", -3.5), -4);
  assert.equal(await caso("to-byte-integer", 300.2), 127, "satura");
  assert.equal(await caso("to-unsigned-byte-integer", -5.5), 0);
  assert.equal(await caso("to-single-precision-float", 3.7), Math.fround(3.7));
  assert.equal(await caso("to-double-precision-float", 42, "i32"), 42);
  assert.equal(await caso("to-long-integer", 1e12), 2147483647);
});

// La subpaleta Data Manipulation (nombres y terminales de la ayuda de LabVIEW
// 2026 Q3; el ancho de los resultados, de la ayuda de NI: Split Number da
// enteros sin signo de la mitad de bits). Cada caso se ejecuta de verdad.
const K = (valor, type) => ["num-const", { value: valor, type }];
async function bits(nodos, cables, tipos) {
  const todos = [...nodos, ...Object.keys(tipos).map((n) => [n, "indicator", { type: tipos[n] }])];
  return correr(vi(todos.map(([n, b, c]) => [n, b, c]), cables));
}

test("split number parte un entero en sus dos mitades sin signo", async () => {
  const caso = async (valor, tipo, salida) =>
    bits([["x", "num-const", { value: valor, type: tipo }], ["s", "split-number"]], [["x.result", "s.x"], ["s.hi", "h.value"], ["s.lo", "l.value"]], { h: salida, l: salida });
  assert.deepEqual(await caso(0xabcd1234, "u32", "u16"), { h: 0xabcd, l: 0x1234 });
  assert.deepEqual(await caso(-2, "i16", "u8"), { h: 255, l: 254 });
  assert.deepEqual(await caso(4294967298, "u64", "u32"), { h: 1, l: 2 });
  assert.deepEqual(await caso(-1, "i32", "u16"), { h: 65535, l: 65535 }, "un entero con signo también se parte sin signo");
});

test("join numbers junta dos enteros en uno sin signo del doble de bits", async () => {
  const caso = async (hi, lo, tipo, salida) =>
    bits([["h", ...K(hi, tipo)], ["l", ...K(lo, tipo)], ["j", "join-numbers"]], [["h.result", "j.hi"], ["l.result", "j.lo"], ["j.result", "r.value"]], { r: salida });
  assert.deepEqual(await caso(0xab, 0xcd, "u8", "u16"), { r: 0xabcd });
  assert.deepEqual(await caso(0x1234, 0x5678, "u16", "u32"), { r: 0x12345678 });
  assert.deepEqual(await caso(0xdeadbeef | 0, 0xcafebabe | 0, "i32", "u64"), { r: Number(0xdeadbeefcafebaben) });
});

test("swap bytes y swap words cambian el orden dentro de cada palabra", async () => {
  const caso = async (bloque, valor, tipo) =>
    bits([["x", ...K(valor, tipo)], ["s", bloque]], [["x.result", "s.data"], ["s.result", "r.value"]], { r: tipo });
  assert.deepEqual(await caso("swap-bytes", 0x1234, "u16"), { r: 0x3412 });
  assert.deepEqual(await caso("swap-bytes", 0x12345678, "u32"), { r: 0x34127856 }, "cada palabra de 16 bits por separado");
  assert.deepEqual(await caso("swap-bytes", 0x12, "u8"), { r: 0x12 });
  assert.deepEqual(await caso("swap-bytes", -32767, "i16"), { r: 0x0180 });
  assert.deepEqual(await caso("swap-words", 0x12345678, "u32"), { r: 0x56781234 });
  assert.deepEqual(await caso("swap-words", 0x1234, "u16"), { r: 0x1234 });
});

test("rotate y logical shift mueven los bits del ancho del tipo", async () => {
  const caso = async (bloque, valor, tipo, y) =>
    (await bits([["x", ...K(valor, tipo)], ["y", ...K(y, "i16")], ["s", bloque]], [["x.result", "s.x"], ["y.result", "s.y"], ["s.result", "r.value"]], { r: tipo })).r;
  assert.equal(await caso("rotate", 0b10010001, "u8", 1), 0b00100011);
  assert.equal(await caso("rotate", 0b10010001, "u8", -1), 0b11001000);
  assert.equal(await caso("rotate", 0x8001, "u16", 4), 0x0018);
  assert.equal(await caso("rotate", 1, "i32", 31), -2147483648);
  assert.equal(await caso("rotate", 1, "u64", 3), 8);
  assert.equal(await caso("logical-shift", 0x81, "u8", 1), 0x02, "desborda por la izquierda");
  assert.equal(await caso("logical-shift", 0x81, "u8", -1), 0x40, "con ceros por la izquierda");
  assert.equal(await caso("logical-shift", 0x81, "u8", 8), 0, "un desplazamiento del ancho da cero");
  assert.equal(await caso("logical-shift", 0x81, "u8", -9), 0);
  assert.equal(await caso("logical-shift", -8, "i32", -1), 2147483644, "lógico, no aritmético");
  assert.equal(await caso("logical-shift", -1, "i8", -4), 15);
  assert.equal(await caso("logical-shift", 3, "u64", 40), 3298534883328);
});

test("rotate with carry saca el bit que sale y mete el acarreo", async () => {
  const caso = async (bloque, valor, tipo, acarreo) =>
    bits(
      [["x", ...K(valor, tipo)], ["c", "bool-const", { value: acarreo }], ["s", bloque], ["b", "boolean-to-0-1"]],
      [["x.result", "s.value"], ["c.result", "s.carry"], ["s.carry-out", "b.boolean"], ["b.result", "k.value"], ["s.value-out", "r.value"]],
      { k: "i16", r: tipo },
    );
  assert.deepEqual(await caso("rotate-left-with-carry", 0x81, "u8", true), { k: 1, r: 0x03 });
  assert.deepEqual(await caso("rotate-left-with-carry", 0x41, "u8", false), { k: 0, r: 0x82 });
  assert.deepEqual(await caso("rotate-right-with-carry", 0x81, "u8", true), { k: 1, r: 0xc0 });
  assert.deepEqual(await caso("rotate-right-with-carry", -2, "i16", false), { k: 0, r: 32767 });
  assert.deepEqual(await caso("rotate-left-with-carry", -1, "i32", false), { k: 1, r: -2 });
});

test("mantissa and exponent cumple número = mantisa por dos elevado al exponente", async () => {
  const caso = async (valor) =>
    bits([["x", "const", { value: valor }], ["m", "mantissa-and-exponent"]], [["x.result", "m.number"], ["m.mantissa", "a.value"], ["m.exponent", "b.value"]], { a: "number", b: "number" });
  assert.deepEqual(await caso(10), { a: 1.25, b: 3 });
  assert.deepEqual(await caso(-8), { a: -1, b: 3 });
  assert.deepEqual(await caso(0.1), { a: 1.6, b: -4 });
  assert.deepEqual(await caso(0), { a: 0, b: 0 });
});

test("las constantes matemáticas se emiten con su valor", async () => {
  const nombres = Object.keys((await import("../../nucleo/constantes.mjs")).CONSTANTES_MATEMATICAS);
  const nodos = nombres.map((n) => [n, n]);
  const ind = nombres.map((n) => [`i_${n}`, "indicator"]);
  const r = await correr(vi([...nodos, ...ind], nombres.map((n) => [`${n}.result`, `i_${n}.value`])));
  const { CONSTANTES_MATEMATICAS: K } = await import("../../nucleo/constantes.mjs");
  for (const n of nombres) assert.equal(r[`i_${n}`], K[n].valor, n);
});

// Range Limits For Type, comprobado en LabVIEW 2026 Q3: con un DBL cableado, el
// máximo es +Inf; con un enum, su último valor (ayuda contextual).
test("range limits for type da los límites del tipo cableado", async () => {
  const caso = async (tipo, salida = tipo) =>
    bits([["x", "num-const", { value: 0, type: tipo }], ["r", "range-limits-for-type"]], [["x.result", "r.type"], ["r.maximum", "a.value"], ["r.minimum", "b.value"]], { a: salida, b: salida });
  assert.deepEqual(await caso("i8"), { a: 127, b: -128 });
  assert.deepEqual(await caso("u16"), { a: 65535, b: 0 });
  assert.deepEqual(await caso("i32"), { a: 2147483647, b: -2147483648 });
  assert.deepEqual(await caso("u32"), { a: 4294967295, b: 0 });
  assert.deepEqual(await caso("i64"), { a: 2 ** 63, b: -(2 ** 63) }, "I64 pierde precisión al llegar como número de JavaScript");
  assert.deepEqual(await caso("u64"), { a: 2 ** 64, b: 0 });
  assert.deepEqual(await caso("number"), { a: Infinity, b: -Infinity });
});

test("las constantes enum y ring se emiten con su valor", async () => {
  const r = await bits(
    [["e", "enum-const", { type: { enum: ["a", "b", "c"] }, value: 2 }], ["r", "ring-const", { value: 5, items: ["x", "y"] }]],
    [["e.result", "ie.value"], ["r.result", "ir.value"]],
    { ie: "u16", ir: "u16" },
  );
  assert.deepEqual(r, { ie: 2, ir: 5 });
  // Range Limits con un enum: de 0 a su último valor.
  const l = await bits([["e", "enum-const", { type: { enum: ["a", "b", "c"] }, value: 0 }], ["rl", "range-limits-for-type"]], [["e.result", "rl.type"], ["rl.maximum", "a.value"], ["rl.minimum", "b.value"]], { a: "u16", b: "u16" });
  assert.deepEqual(l, { a: 2, b: 0 });
});

test("un expression node calcula su fórmula", async () => {
  const caso = async (expresion, valor, tipo = "number") =>
    (await bits([["x", "num-const", { value: valor, type: tipo }], ["f", "expression-node", { expression: expresion }]], [["x.result", "f.x"], ["f.result", "r.value"]], { r: tipo })).r;
  // Los resultados, medidos en LabVIEW 2026 Q3 (labview-captures/expresion/).
  assert.equal(await caso("x*2+1", 3), 7);
  assert.equal(await caso("x**3", 2), 8, "la potencia es **");
  assert.equal(await caso("-x**2", 2), -4, "el menos de delante pesa menos que la potencia");
  assert.equal(await caso("x**3**2", 2), 512, "la potencia es asociativa por la derecha");
  assert.equal(await caso("(x+1)*(x-1)", 5), 24);
  assert.equal(await caso("sqrt(x)+pi", 4), 2 + Math.PI);
  assert.equal(await caso("abs(x)", -2.5), 2.5);
  assert.ok(Math.abs((await caso("sin(x)**2+cos(x)**2", 1.234)) - 1) < 1e-12);
  assert.ok(Math.abs((await caso("sin(x)+sign(x)", 2)) - 1.9093) < 1e-4);
  assert.ok(Math.abs((await caso("sinc(x)", -2.5)) - 0.239389) < 1e-6, "sinc(x) = sin(x)/x");
  assert.equal(await caso("ln(exp(x))", 2), 2);
  assert.equal(await caso("log(1000)", 0), 3);
  assert.equal(await caso("max(x,5)", 2), 5);
  assert.equal(await caso("x%2", -2.5), -0.5, "% trunca, como fmod");
  assert.equal(await caso("mod(x,3)", -2.5), -2.5);
  assert.equal(await caso("rem(x,1.5)", -2.5), -1);
  assert.equal(await caso("int(x)", -2.5), -2, "int redondea al par");
  assert.equal(await caso("intrz(x)", -2.5), -2);
  assert.equal(await caso("getexp(x)", -2.5), 1);
  assert.equal(await caso("getman(x)", -2.5), -1.25);
  assert.ok((await caso("rand()+x", 0)) < 1);
  assert.equal(await caso("a*a", 6), 36, "la variable puede llamarse como se quiera");
  // Con un entero se calcula en DBL y se redondea al par al volver al tipo.
  assert.equal(await caso("x/2", 3, "i32"), 2);
  assert.equal(await caso("x/2", 5, "i32"), 2);
  assert.equal(await caso("x*2.7", 5, "i32"), 14);
  assert.equal(await caso("sqrt(x)", 5, "i32"), 2);
  assert.equal(await caso("x%3", 5, "i32"), 2);
  assert.equal(await caso("x^1", 5, "i32"), 4, "^ es el o exclusivo");
  // Con un DBL, ^ no compila: LabVIEW dice «Integer type required».
  const xor = vi([["k", "const", { value: 1 }], ["f", "expression-node", { expression: "x^3" }]], [["k.result", "f.x"]]);
  assert.match(compilar(xor.g, CAT).errores[0].motivo, /Integer type required/);
  // Una expresión que no vale es un error de compilación, con su motivo.
  const malo = vi([["k", "const", { value: 1 }], ["f", "expression-node", { expression: "x+y" }]], [["k.result", "f.x"]]);
  assert.match(compilar(malo.g, CAT).errores[0].motivo, /sólo cabe una variable/);
});

// bool-control lee un booleano del panel y bool-indicator lo escribe, por las
// importaciones del panel como los numéricos: el booleano viaja como i32 0/1.
test("un control booleano se lee del panel y un indicador booleano lo recibe", async () => {
  const { g, id } = vi(
    [["b", "bool-control"], ["no", "not-op"], ["led", "bool-indicator"], ["pasa", "bool-indicator"]],
    [["b.result", "no.x"], ["no.result", "led.value"], ["b.result", "pasa.value"]],
  );
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.deepEqual(c.controles.map((k) => k.tipo), ["boolean"]);
  assert.deepEqual(c.indicadores.map((k) => k.tipo), ["boolean", "boolean"]);
  assert.deepEqual(await correr({ g, id }, { b: true }), { led: false, pasa: true });
  assert.deepEqual(await correr({ g, id }, { b: false }), { led: true, pasa: false });
  // A través de And con otro control: sólo TRUE si los dos lo son.
  const dos = vi(
    [["a", "bool-control"], ["b", "bool-control"], ["y", "and-op"], ["led", "bool-indicator"]],
    [["a.result", "y.x"], ["b.result", "y.y"], ["y.result", "led.value"]],
  );
  assert.equal((await correr(dos, { a: true, b: true })).led, true);
  assert.equal((await correr(dos, { a: true, b: false })).led, false);
  // Un indicador booleano sin cable no se escribe y el VI sigue ejecutable.
  const solo = vi([["led", "bool-indicator"]], []);
  assert.deepEqual(await correr(solo), {});
});

// ——— Functions ▸ Programming ▸ Comparison ———
//
// Todos los valores esperados están medidos en LabVIEW 2026 Q3 (el 2026-10-01):
// se construyó cada VI con constantes y se leyó el indicador (capturas
// block-diagram/comparison-*.png).

/** Una constante de un tipo: «boolean», o un numérico con su representación. */
const cte = (valor, tipo = "number") => (tipo === "boolean" ? ["bool-const", { value: valor }] : ["num-const", { value: valor, type: tipo }]);

/** Una función de Comparison con entradas constantes; devuelve lo que llega a cada salida, por su nombre de puerto. */
async function comparar(bloque, entradas, salidas = ["result"]) {
  const puertos = CAT.puertos({ tipo: bloque, config: undefined });
  const nodos = [["f", bloque]];
  const cables = [];
  entradas.forEach(([valor, tipo], i) => {
    nodos.push([`c${i}`, ...cte(valor, tipo)]);
    cables.push([`c${i}.result`, `f.${puertos.in[i].name}`]);
  });
  // El indicador es booleano si la salida lo es: se lee del tipo resuelto con las entradas puestas.
  const previo = vi(nodos, cables);
  const resueltos = Gr.tipos(previo.g, CAT);
  salidas.forEach((p, j) => {
    nodos.push([`o${j}`, resueltos.salidas.get(`${previo.id.f}.${p}`) === "boolean" ? "bool-indicator" : "indicator"]);
    cables.push([`f.${p}`, `o${j}.value`]);
  });
  const r = await correr(vi(nodos, cables));
  return salidas.map((_, j) => r[`o${j}`]);
}

const un = async (bloque, ...entradas) => (await comparar(bloque, entradas))[0];

test("las seis comparaciones de dos entradas dan lo que da labview", async () => {
  const tabla = {
    equal: [false, true, false], "not-equal": [true, false, true],
    greater: [false, false, true], less: [true, false, false],
    "greater-or-equal": [false, true, true], "less-or-equal": [true, true, false],
  };
  for (const [b, [menor, igual, mayor]] of Object.entries(tabla)) {
    assert.equal(await un(b, [1.5], [2.5]), menor, `${b} 1,5 y 2,5`);
    assert.equal(await un(b, [2.5], [2.5]), igual, `${b} 2,5 y 2,5`);
    assert.equal(await un(b, [3.5], [2.5]), mayor, `${b} 3,5 y 2,5`);
  }
});

test("con un NaN todas las comparaciones son falsas menos not equal, como en labview", async () => {
  // Medido: x = NaN e y = NaN, y también las de comparar con 0 y x = NaN.
  const dos = { equal: false, "not-equal": true, greater: false, less: false, "greater-or-equal": false, "less-or-equal": false };
  for (const [b, esperado] of Object.entries(dos)) {
    assert.equal(await un(b, [NaN], [NaN]), esperado, `${b} NaN y NaN`);
    assert.equal(await un(b, [NaN], [1]), esperado, `${b} NaN y 1`);
    assert.equal(await un(b, [1], [NaN]), esperado, `${b} 1 y NaN`);
  }
  const cero = { "equal-to-0": false, "not-equal-to-0": true, "greater-than-0": false, "less-than-0": false, "greater-or-equal-to-0": false, "less-or-equal-to-0": false };
  for (const [b, esperado] of Object.entries(cero)) assert.equal(await un(b, [NaN]), esperado, `${b} NaN`);
});

test("las comparaciones con cero", async () => {
  const tabla = {
    "equal-to-0": [false, true, false], "not-equal-to-0": [true, false, true],
    "greater-than-0": [false, false, true], "less-than-0": [true, false, false],
    "greater-or-equal-to-0": [false, true, true], "less-or-equal-to-0": [true, true, false],
  };
  for (const [b, [neg, cero, pos]] of Object.entries(tabla)) {
    assert.equal(await un(b, [-2.5]), neg, b);
    assert.equal(await un(b, [0]), cero, b);
    assert.equal(await un(b, [7]), pos, b);
  }
  // Con enteros sin signo nunca hay negativos; con signo, sí.
  assert.equal(await un("less-than-0", [200, "u8"]), false);
  assert.equal(await un("less-than-0", [-5, "i8"]), true);
});

test("comparar un entero con un DBL los lleva al tipo común, como el punto de coerción de labview", async () => {
  // Medido: I64 9007199254740993 = DBL 9007199254740992 da TRUE (el I64 pasa a DBL y pierde el último bit).
  assert.equal(await un("equal", [9007199254740993n, "i64"], [9007199254740992, "number"]), true);
  assert.equal(await un("equal", [9007199254740993n, "i64"], [9007199254740993n, "i64"]), true);
  assert.equal(await un("equal", [9007199254740993n, "i64"], [9007199254740992n, "i64"]), false);
  assert.equal(await un("greater", [3, "i32"], [2.5, "number"]), true);
  // Medido: U8 200 > I8 −1 da FALSE: con los mismos bits gana la representación sin signo y −1 pasa a 255.
  assert.equal(await un("greater", [200, "u8"], [-1, "i8"]), false);
  assert.equal(await un("less", [200, "u8"], [-1, "i8"]), true);
  assert.equal(await un("greater", [200, "u8"], [-1, "i16"]), true, "con más bits gana el I16 y no hay vuelta");
});

test("los booleanos se comparan con FALSE menor que TRUE", async () => {
  // Medido: Greater?(TRUE, FALSE) = TRUE, Greater?(FALSE, TRUE) = FALSE, Greater?(TRUE, TRUE) = FALSE.
  const b = (x, y, f) => un(f, [x, "boolean"], [y, "boolean"]);
  assert.equal(await b(true, false, "greater"), true);
  assert.equal(await b(false, true, "greater"), false);
  assert.equal(await b(true, true, "greater"), false);
  assert.equal(await b(false, true, "less"), true);
  assert.equal(await b(true, true, "equal"), true);
  assert.equal(await b(false, true, "not-equal"), true);
  assert.equal(await b(true, true, "greater-or-equal"), true);
  assert.equal(await b(true, false, "less-or-equal"), false);
});

test("select devuelve t si s es TRUE y f si no, en el tipo común", async () => {
  const sel = (s, t, f) => un("select", t, [s, "boolean"], f);
  assert.equal(await sel(true, [7, "i32"], [2.5, "number"]), 7);
  assert.equal(await sel(false, [7, "i32"], [2.5, "number"]), 2.5);
  // Medido: t = U8 200, f = I8 −1, s = FALSE da 255: f pasó a U8.
  assert.equal(await sel(false, [200, "u8"], [-1, "i8"]), 255);
  assert.equal(await sel(true, [200, "u8"], [-1, "i8"]), 200);
  // También selecciona booleanos.
  assert.equal(await un("select", [true, "boolean"], [false, "boolean"], [false, "boolean"]), false);
});

test("max and min ignoran un NaN si el otro es un número, como labview", async () => {
  const mm = async (x, y, tipo) => comparar("max-and-min", [[x, tipo], [y, tipo]], ["max", "min"]);
  assert.deepEqual(await mm(3, 2, "number"), [3, 2]);
  assert.deepEqual(await mm(2, 3, "number"), [3, 2]);
  // Medido: (NaN, 1) y (1, NaN) dan 1 y 1; (NaN, NaN) da NaN y NaN.
  assert.deepEqual(await mm(NaN, 1, "number"), [1, 1]);
  assert.deepEqual(await mm(1, NaN, "number"), [1, 1]);
  const dos = await mm(NaN, NaN, "number");
  assert.ok(Number.isNaN(dos[0]) && Number.isNaN(dos[1]));
  assert.deepEqual(await mm(-5, 200, "i16"), [200, -5]);
  assert.deepEqual(await mm(250, 10, "u8"), [250, 10]);
  assert.deepEqual(await mm(7, 7, "i32"), [7, 7]);
});

test("in range and coerce: extremos, coerced(x) y NaN medidos en labview", async () => {
  // Terminales: upper limit, x, lower limit. De fábrica se incluye el inferior y no el superior.
  const rango = async (sup, x, inf, config) => {
    const { g, id } = vi(
      [["u", ...cte(sup)], ["x", ...cte(x)], ["l", ...cte(inf)], ["f", "in-range-and-coerce", config], ["c", "indicator"], ["r", "bool-indicator"]],
      [["u.result", "f.upper-limit"], ["x.result", "f.x"], ["l.result", "f.lower-limit"], ["f.coerced", "c.value"], ["f.in-range", "r.value"]],
    );
    const o = await correr({ g, id });
    return [o.c, o.r];
  };
  // Valores del 2026-10-01: (U, x, L) → (coerced, In Range?).
  assert.deepEqual(await rango(5, 1, 1), [1, true], "x en el límite inferior: incluido");
  assert.deepEqual(await rango(10, 10, 0), [10, false], "x en el límite superior: no incluido");
  assert.deepEqual(await rango(10, 5, 0), [5, true]);
  assert.deepEqual(await rango(10, 15, 0), [10, false]);
  assert.deepEqual(await rango(10, -3, 0), [0, false]);
  assert.deepEqual(await rango(5, 0, 1), [1, false], "por debajo se lleva al inferior");
  // Con los extremos cambiados en el menú (Include upper/lower limit).
  assert.deepEqual(await rango(10, 10, 0, { "include-upper-limit": true }), [10, true]);
  assert.deepEqual(await rango(10, 0, 0, { "include-lower-limit": false }), [0, false]);
  assert.deepEqual(await rango(10, 20, 10, { "include-upper-limit": true, "include-lower-limit": true }), [10, false]);
  // Con los límites cruzados, In Range? es FALSE y coerced(x) usa los límites ordenados: la mediana.
  assert.deepEqual(await rango(1, 3, 5), [3, false]);
  assert.deepEqual(await rango(5, 1, 6), [5, false]);
  assert.deepEqual(await rango(1, 5, 3), [3, false]);
  // Con un NaN en x o en un límite, coerced(x) es NaN e In Range? FALSE.
  const nan = await rango(5, NaN, 1);
  assert.ok(Number.isNaN(nan[0]) && nan[1] === false);
  const nanL = await rango(5, 1, NaN);
  assert.ok(Number.isNaN(nanL[0]) && nanL[1] === false);
});

test("not a number devuelve TRUE sólo con un NaN", async () => {
  assert.equal(await un("not-a-number-path-refnum", [NaN]), true);
  assert.equal(await un("not-a-number-path-refnum", [Infinity]), false);
  assert.equal(await un("not-a-number-path-refnum", [5]), false);
  assert.equal(await un("not-a-number-path-refnum", [5, "i32"]), false, "un entero nunca lo es");
});
