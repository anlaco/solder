// Cadenas (DT-042): bloques [longitud][bytes] en memoria lineal, un búfer por
// nodo en el data space, sin recolector. Como en LabVIEW, una cadena son bytes:
// String Length cuenta bytes, y un bucle reescribe su búfer en cada vuelta.

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
    const r = bloque === "while-loop" || bloque === "for-loop" ? Gr.crearEstructura(g, CAT, bloque, 0, 0, 200, 150) : Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    if (dentro) g = Gr.meter(g, CAT, [r.id], id[dentro]);
    id[nombre] = r.id;
    if (bloque === "for-loop") {
      id[`${nombre}:N`] = g.nodos.find((n) => n.tipo === "loop-count" && n.dentro === r.id).id;
      id[`${nombre}:i`] = g.nodos.find((n) => n.tipo === "loop-iteration" && n.dentro === r.id).id;
    }
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

async function correr({ g, id }, valores = {}) {
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.ok(WebAssembly.validate(c.bytes), "el módulo es WebAssembly válido");
  const nombre = Object.fromEntries(Object.entries(id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, Object.fromEntries(Object.entries(valores).map(([k, x]) => [id[k], x])));
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k], x]));
}

test("concatenate y string length: la longitud es en bytes", async () => {
  const v = vi(
    [["a", "str-const", { value: "año " }], ["b", "str-const", { value: "2026" }], ["c", "concatenate-strings"], ["l", "string-length"], ["r", "str-indicator"], ["n", "indicator", { type: "i32" }]],
    [["a.result", "c.string-0"], ["b.result", "c.string-1"], ["c.concatenated-string", "r.value"], ["c.concatenated-string", "l.string"], ["l.length", "n.value"]],
  );
  assert.deepEqual(await correr(v), { r: "año 2026", n: 9 }, "«ñ» son dos bytes en UTF-8");
});

test("un control de cadena llega al diagrama y una vacia mide cero", async () => {
  const v = vi(
    [["x", "str-control"], ["y", "str-const"], ["c", "concatenate-strings"], ["r", "str-indicator"], ["l", "string-length"], ["n", "indicator", { type: "i32" }]],
    [["x.result", "c.string-0"], ["y.result", "c.string-1"], ["c.concatenated-string", "r.value"], ["y.result", "l.string"], ["l.length", "n.value"]],
  );
  assert.deepEqual(await correr(v, { x: "hola" }), { r: "hola", n: 0 });
});

test("un shift register de cadena acumula, con su propia copia", async () => {
  const v = vi(
    [["f", "for-loop"], ["n", "const", { value: 5 }], ["vacia", "str-const"], ["x", "str-const", { value: "ab" }, "f"], ["c", "concatenate-strings", null, "f"], ["r", "str-indicator"]],
    [["n.result", "f:N.count"]],
  );
  let g = v.g;
  const sr = Gr.crearRegistro(g, CAT, v.id.f, 0);
  g = sr.g;
  const con = (a, pa, b, pb) => (g = Gr.conectar(g, CAT, { nodo: a, puerto: pa, dir: "out" }, { nodo: b, puerto: pb, dir: "in" }).g);
  con(v.id.vacia, "result", sr.izquierdo, "init");
  con(sr.izquierdo, "value", v.id.c, "string-0");
  con(v.id.x, "result", v.id.c, "string-1");
  con(v.id.c, "concatenated-string", sr.derecho, "value");
  con(sr.derecho, "result", v.id.r, "value");
  assert.deepEqual(await correr({ g, id: v.id }), { r: "ababababab" });
});

// Sin recolector: el búfer de un nodo se reutiliza en cada vuelta, así que mil
// vueltas no gastan más memoria que una.
test("un bucle que concatena reutiliza su bufer: la memoria no crece", async () => {
  const hacer = (n) =>
    vi(
      [["f", "for-loop"], ["n", "const", { value: n }], ["a", "str-const", { value: "x".repeat(1000) }, "f"], ["b", "str-const", { value: "y".repeat(1000) }, "f"], ["c", "concatenate-strings", null, "f"], ["l", "string-length", null, "f"]],
      [["n.result", "f:N.count"], ["a.result", "c.string-0"], ["b.result", "c.string-1"], ["c.concatenated-string", "l.string"]],
    );
  const memoria = async (n) => {
    const c = compilar(hacer(n).g, CAT);
    // Se mide la cima del montón tras correr, mirando la memoria de la instancia del ejecutor.
    let cima = null;
    const original = WebAssembly.instantiate;
    WebAssembly.instantiate = async (...a) => {
      const r = await original(...a);
      cima = () => new DataView(r.instance.exports.memoria.buffer).getInt32(4, true);
      return r;
    };
    try {
      await ejecutar(c, {});
    } finally {
      WebAssembly.instantiate = original;
    }
    return cima();
  };
  assert.equal(await memoria(1000), await memoria(1), "la cima del montón es la misma con 1 vuelta que con 1000");
});

// ——— Las funciones de la paleta String, con los resultados medidos en LabVIEW 2026 Q3 ———
// (labview-captures/string/prueba-*.png). Cada una se prueba cableando controles a sus
// entradas e indicadores a sus salidas, y corriendo el VI compilado.

/**
 * Corre un bloque: `entradas` da, por puerto, el valor de un control (cadena,
 * número —con su tipo en `tipos`— o booleano); `salidas`, los puertos a leer, cada
 * uno con el tipo de su indicador. Devuelve el valor de cada salida.
 */
async function bloque(tipo, entradas, salidas, { config, separador } = {}) {
  const nodos = [["f", tipo, config]];
  const cables = [];
  const valores = {};
  for (const [puerto, valor] of Object.entries(entradas)) {
    const control = typeof valor === "string" ? "str-control" : typeof valor === "boolean" ? "bool-control" : "control";
    const cfg = control === "control" ? { type: Number.isInteger(valor) && Math.abs(valor) < 2 ** 31 ? "i32" : "number" } : undefined;
    nodos.push([`c:${puerto}`, control, cfg]);
    cables.push([`c:${puerto}.result`, `f.${puerto}`]);
    valores[`c:${puerto}`] = valor;
  }
  for (const [puerto, t] of Object.entries(salidas)) {
    nodos.push([`i:${puerto}`, t === "string" ? "str-indicator" : t === "boolean" ? "bool-indicator" : "indicator", t === "string" || t === "boolean" ? undefined : { type: t }]);
    cables.push([`f.${puerto}`, `i:${puerto}.value`]);
  }
  const v = vi(nodos, cables);
  const c = compilar(v.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const nombre = Object.fromEntries(Object.entries(v.id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, Object.fromEntries(Object.entries(valores).map(([k, x]) => [v.id[k], x])), { separador });
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k].slice(2), x]));
}

test("String Subset: offset negativo cuenta 0, length negativo da vacía, length largo da el resto", async () => {
  const sub = async (offset, length) => (await bloque("string-subset", { string: "abcdef", offset, length }, { substring: "string" })).substring;
  assert.equal(await sub(2, 3), "cde");
  assert.equal(await sub(2, 100), "cdef");
  assert.equal(await sub(-1, 2), "ab");
  assert.equal(await sub(2, -1), "");
  assert.equal(await sub(6, 3), "", "con offset = longitud no queda nada");
  assert.equal(await sub(10, 3), "");
  assert.equal(await sub(0, 0), "");
  // Sin cablear length, es el resto.
  assert.equal((await bloque("string-subset", { string: "abcdef", offset: 2 }, { substring: "string" })).substring, "cdef");
});

test("Replace Substring: cambia, inserta, borra, y deja la cadena si el offset no vale", async () => {
  const rep = (sustituto, offset, length) => bloque("replace-substring", { string: "abcdef", substring: sustituto, offset, length }, { "result-string": "string", "replaced-substring": "string" });
  assert.deepEqual(await rep("XY", 2, 2), { "result-string": "abXYef", "replaced-substring": "cd" });
  assert.deepEqual(await rep("XY", 2, 0), { "result-string": "abXYcdef", "replaced-substring": "" });
  assert.deepEqual(await rep("", 2, 2), { "result-string": "abef", "replaced-substring": "cd" });
  assert.deepEqual(await rep("XY", 10, 0), { "result-string": "abcdef", "replaced-substring": "" });
  assert.deepEqual(await rep("XY", 4, 100), { "result-string": "abcdXY", "replaced-substring": "ef" });
  assert.deepEqual(await rep("XY", -1, 1), { "result-string": "abcdef", "replaced-substring": "" });
  // Sin cablear length, son los bytes de substring.
  assert.equal((await bloque("replace-substring", { string: "abcdef", substring: "XY", offset: 1 }, { "result-string": "string" }))["result-string"], "aXYdef");
});

test("Search and Replace String: primera, todas, sin distinguir mayúsculas, offset y cadena vacía", async () => {
  const sr = (entradas) =>
    bloque("search-and-replace-string", { "input-string": "abcABCabc", "search-string": "abc", "replace-string": "X", ...entradas }, { "result-string": "string", "number-of-replacements": "i32", "offset-past-replacement": "i32" });
  assert.deepEqual(await sr({}), { "result-string": "XABCabc", "number-of-replacements": 1, "offset-past-replacement": 1 });
  assert.deepEqual(await sr({ "replace-all": true }), { "result-string": "XABCX", "number-of-replacements": 2, "offset-past-replacement": 5 });
  assert.deepEqual(await sr({ "replace-all": true, "ignore-case": true }), { "result-string": "XXX", "number-of-replacements": 3, "offset-past-replacement": 3 });
  assert.deepEqual(await sr({ "search-string": "zz", "replace-all": true }), { "result-string": "abcABCabc", "number-of-replacements": 0, "offset-past-replacement": -1 });
  assert.deepEqual(await sr({ "replace-all": true, "ignore-case": true, offset: 3 }), { "result-string": "abcXX", "number-of-replacements": 2, "offset-past-replacement": 5 });
  assert.deepEqual(await sr({ "search-string": "", "replace-all": true }), { "result-string": "XaXbXcXAXBXCXaXbXcX", "number-of-replacements": 10, "offset-past-replacement": 19 });
});

test("To Upper Case, To Lower Case, Reverse String, Rotate String y Trim Whitespace", async () => {
  const una = async (tipo, entradas, salida) => (await bloque(tipo, entradas, { [salida]: "string" }))[salida];
  assert.equal(await una("to-upper-case", { string: "abc-é1" }, "all-upper-case-string"), "ABC-é1", "sólo las letras ASCII");
  assert.equal(await una("to-lower-case", { string: "ABC-1" }, "all-lower-case-string"), "abc-1");
  assert.equal(await una("reverse-string", { string: "abcd" }, "reversed"), "dcba");
  assert.equal(await una("rotate-string", { string: "abcd" }, "first-char-last"), "bcda", "la ayuda de NI: abcd pasa a bcda");
  assert.equal(await una("rotate-string", { string: "" }, "first-char-last"), "");
  assert.equal(await una("trim-whitespace", { string: " \t\r\n hola mundo \n" }, "trimmed-string"), "hola mundo");
  assert.equal(await una("trim-whitespace", { string: "  " }, "trimmed-string"), "");
});

test("Concatenate Strings admite más entradas", async () => {
  let v = vi([["a", "str-const", { value: "uno " }], ["b", "str-const", { value: "dos " }], ["c", "str-const", { value: "tres" }], ["f", "concatenate-strings"], ["r", "str-indicator"]], [["a.result", "f.string-0"], ["b.result", "f.string-1"], ["f.concatenated-string", "r.value"]]);
  let g = Gr.fijarEntradas(v.g, CAT, v.id.f, 3);
  g = Gr.conectar(g, CAT, { nodo: v.id.c, puerto: "result", dir: "out" }, { nodo: v.id.f, puerto: "string-2", dir: "in" }).g;
  assert.deepEqual(await correr({ g, id: v.id }), { r: "uno dos tres" });
});

test("Number To Decimal/Hexadecimal String: el ancho rellena y un negativo es su complemento a dos", async () => {
  const n = async (tipo, entradas, salida) => (await bloque(tipo, entradas, { [salida]: "string" }))[salida];
  assert.equal(await n("number-to-decimal-string", { number: 42, width: 6 }, "decimal-integer-string"), "    42");
  assert.equal(await n("number-to-decimal-string", { number: -42, width: 2 }, "decimal-integer-string"), "-42");
  assert.equal(await n("number-to-decimal-string", { number: 3.5 }, "decimal-integer-string"), "4", "un DBL se redondea al par: 3,5 da 4 y 2,5 da 2");
  assert.equal(await n("number-to-decimal-string", { number: 2.5 }, "decimal-integer-string"), "2");
  assert.equal(await n("number-to-hexadecimal-string", { number: 255, width: 6 }, "hex-integer-string"), "0000FF", "el hexadecimal se rellena con ceros");
  assert.equal(await n("number-to-hexadecimal-string", { number: -1 }, "hex-integer-string"), "FFFFFFFF", "una I32");
  assert.equal(await n("number-to-hexadecimal-string", { number: 0, width: 3 }, "hex-integer-string"), "000");
});

test("Number To Fractional, Exponential y Engineering String", async () => {
  const n = async (tipo, entradas, salida) => (await bloque(tipo, { "use-system-decimal-point": false, ...entradas }, { [salida]: "string" }))[salida];
  const f = (number, precision, width = 0) => n("number-to-fractional-string", { number, precision, width }, "f-format-string");
  assert.equal(await f(3.14159, 6), "3.141590");
  assert.equal(await f(3.14159, 2), "3.14");
  assert.equal(await f(3.14159, 2, 10), "      3.14", "width positivo, a la derecha");
  assert.equal(await f(3.14159, 0), "3");
  assert.equal(await f(-0.5, 3), "-0.500");
  assert.equal(await f(1234567.891, 3), "1234567.891");
  assert.equal(await f(0.0001234, 2), "0.00");
  assert.equal(await f(2.5, 0), "2", "el valor exacto se redondea al par");
  assert.equal(await f(3.5, 0), "4");
  assert.equal(await f(1e20, 1), "100000000000000000000.0");
  const e = (number, precision, width = 0) => n("number-to-exponential-string", { number, precision, width }, "e-format-string");
  assert.equal(await e(3.14159, 6), "3.141590E+0");
  assert.equal(await e(12345.678, 6), "1.234568E+4");
  assert.equal(await e(0.00012, 2), "1.20E-4");
  assert.equal(await e(0, 3), "0.000E+0");
  assert.equal(await e(-5, 0), "-5E+0");
  assert.equal(await e(1e100, 2), "1.00E+100");
  assert.equal(await e(9.99999, 2), "1.00E+1");
  assert.equal(await e(3.14159, 6, 16), "     3.141590E+0");
  const g = (number, precision) => n("number-to-engineering-string", { number, precision }, "engineering-string");
  assert.equal(await g(12345.678, 3), "12.346E+3");
  assert.equal(await g(0.00012, 2), "120.00E-6");
  assert.equal(await g(999999, 2), "1.00E+6");
  assert.equal(await g(1e100, 1), "10.0E+99");
  assert.equal(await g(100000, 3), "100.000E+3");
  assert.equal(await g(0.5, 0), "500E-3");
  // Con use system decimal point, el separador del sistema.
  const sis = await bloque("number-to-fractional-string", { number: 3.14159, precision: 2, "use-system-decimal-point": true }, { "f-format-string": "string" }, { separador: "," });
  assert.equal(sis["f-format-string"], "3,14");
});

test("String To Number: decimal, hexadecimal y fraccionaria, con default y offset past number", async () => {
  const d = (string, extra = {}) => bloque("decimal-string-to-number", { string, ...extra }, { number: "i32", "offset-past-number": "i32" });
  assert.deepEqual(await d("12abc", { default: 7 }), { number: 12, "offset-past-number": 2 });
  assert.deepEqual(await d("abc", { default: 7 }), { number: 7, "offset-past-number": 0 });
  assert.deepEqual(await d("  42"), { number: 42, "offset-past-number": 4 });
  assert.deepEqual(await d("-5x"), { number: -5, "offset-past-number": 2 });
  assert.deepEqual(await d("+7"), { number: 7, "offset-past-number": 2 });
  assert.deepEqual(await d("3.9"), { number: 3, "offset-past-number": 1 });
  assert.deepEqual(await d("abc12", { offset: 3 }), { number: 12, "offset-past-number": 5 });
  assert.deepEqual(await d("99999999999"), { number: 2147483647, "offset-past-number": 11 }, "se satura en I32");
  assert.deepEqual(await d("1e3"), { number: 1, "offset-past-number": 1 });
  const fe = (string, extra = {}) => bloque("fract-exp-string-to-number", { string, ...extra }, { number: "number", "offset-past-number": "i32" });
  assert.deepEqual(await fe("3.14abc"), { number: 3.14, "offset-past-number": 4 });
  assert.deepEqual(await fe("1e3"), { number: 1000, "offset-past-number": 3 });
  assert.deepEqual(await fe(".5"), { number: 0.5, "offset-past-number": 2 });
  assert.deepEqual(await fe("5."), { number: 5, "offset-past-number": 2 });
  assert.deepEqual(await fe("1.5E-2"), { number: 0.015, "offset-past-number": 6 });
  assert.deepEqual(await fe("1.9e+2x"), { number: 190, "offset-past-number": 6 });
  assert.deepEqual(await fe("inf"), { number: Infinity, "offset-past-number": 3 });
  assert.deepEqual(await fe("1,5"), { number: 1, "offset-past-number": 1 }, "la coma no es decimal al leer");
  assert.deepEqual(await fe("zzz", { default: 9.5 }), { number: 9.5, "offset-past-number": 0 });
  const h = (string) => bloque("hexadecimal-string-to-number", { string }, { number: "u32", "offset-past-number": "i32" });
  assert.deepEqual(await h("ff-z"), { number: 255, "offset-past-number": 2 });
});

test("las comparaciones de cadenas son byte a byte", async () => {
  const gt = async (x, y) => (await bloque("greater", { x, y }, { result: "boolean" })).result;
  assert.equal(await gt("abc", "ab"), true);
  assert.equal(await gt("B", "a"), false, "B (66) es menor que a (97)");
  assert.equal(await gt("a", "B"), true);
  assert.equal(await gt("ab", "abc"), false, "una cadena menor que otra que la empieza");
  assert.equal(await gt("", "a"), false);
  assert.equal(await gt("a", ""), true);
  assert.equal(await gt("abc", "abc"), false);
  assert.equal(await gt("Z", "a"), false);
  const op = async (tipo, x, y) => (await bloque(tipo, { x, y }, { result: "boolean" })).result;
  assert.equal(await op("equal", "abc", "abc"), true);
  assert.equal(await op("equal", "abc", "abC"), false, "distingue mayúsculas");
  assert.equal(await op("not-equal", "abc", "abd"), true);
  assert.equal(await op("less", "ab", "abc"), true);
  assert.equal(await op("less-or-equal", "abc", "abc"), true);
  assert.equal(await op("greater-or-equal", "abc", "abd"), false);
});

test("Empty String?, Decimal Digit?, Hex Digit?, Octal Digit? y White Space? miran el primer byte o el código", async () => {
  const q = async (tipo, char) => (await bloque(tipo, { char }, { result: "boolean" })).result;
  assert.equal((await bloque("empty-string-path", { "string-path": "" }, { result: "boolean" })).result, true);
  assert.equal((await bloque("empty-string-path", { "string-path": "a" }, { result: "boolean" })).result, false);
  assert.equal(await q("decimal-digit", "7x"), true);
  assert.equal(await q("decimal-digit", "x7"), false, "sólo el primer carácter");
  assert.equal(await q("decimal-digit", ""), false);
  assert.equal(await q("decimal-digit", 55), true, "un número es un código ASCII: 55 es «7»");
  assert.equal(await q("hex-digit", "f"), true);
  assert.equal(await q("hex-digit", "G"), false);
  assert.equal(await q("hex-digit", "A"), true);
  assert.equal(await q("octal-digit", "7"), true);
  assert.equal(await q("octal-digit", "8"), false);
  assert.equal(await q("white-space", " "), true);
  assert.equal(await q("white-space", "\t"), true);
  assert.equal(await q("white-space", "a"), false);
  assert.equal(await q("white-space", 13), true);
});

test("las constantes de cadena fijas", async () => {
  for (const [tipo, texto] of [["empty-string-constant", ""], ["space-constant", " "], ["tab-constant", "\t"], ["carriage-return-constant", "\r"], ["line-feed-constant", "\n"], ["end-of-line-constant", "\n"]]) {
    const v = vi([["c", tipo], ["r", "str-indicator"]], [["c.result", "r.value"]]);
    assert.deepEqual(await correr(v), { r: texto }, tipo);
  }
});
