// Los tipos numéricos de LabVIEW y su conversión (DT-038). Sin navegador.

import assert from "node:assert/strict";
import { test } from "node:test";

import { COLORES, POR_ABREVIATURA, arrayOf, aspecto, comun, conversion, convertirValor, dimensionsOf, flattenArrayValue, iguales, nestArrayValue, nombre, withoutOneDimension } from "../../core/model/types.mjs";

// «Numeric Conversion», en la ayuda de NI: gana la representación con más
// bits; con los mismos, la sin signo. La coma flotante gana al entero.
test("el tipo común sigue la regla de LabVIEW", () => {
  assert.equal(comun("i32", "i32"), "i32");
  assert.equal(comun("i16", "i32"), "i32");
  assert.equal(comun("i32", "u32"), "u32", "con los mismos bits, sin signo");
  assert.equal(comun("u8", "i16"), "i16", "más bits gana aunque tenga signo");
  assert.equal(comun("i32", "number"), "number");
  assert.equal(comun("i64", "number"), "number", "la coma flotante gana con los mismos bits");
  assert.equal(comun("i32", "sgl"), "sgl");
  assert.equal(comun("sgl", "number"), "number");
  assert.equal(comun({ enum: ["a"] }, "i32"), "i32", "un enum cuenta como U16");
});

test("entre numéricos se convierte y el resto sólo si es igual", () => {
  assert.equal(conversion("i32", "i32"), "igual");
  assert.equal(conversion("i32", "number"), "coercion");
  assert.equal(conversion({ array: "i32" }, { array: "number" }), "coercion");
  assert.equal(conversion("number", "boolean"), null);
  assert.equal(conversion({ array: "number" }, "number"), null);
  assert.equal(conversion("string", "string"), "igual");
});

test("el cable lleva el color de su tipo y el grosor de su dimensión", () => {
  assert.equal(aspecto("number").color, COLORES.flotante);
  assert.equal(aspecto("sgl").color, COLORES.flotante);
  assert.equal(aspecto("i32").color, COLORES.entero);
  assert.equal(aspecto("u8").color, COLORES.entero);
  assert.equal(aspecto({ enum: [] }).color, COLORES.entero);
  assert.deepEqual(aspecto({ array: "i32" }), { color: COLORES.entero, dimension: 1 });
  assert.equal(aspecto({ array: "number", dims: 2 }).dimension, 2);
  assert.equal(nombre("number"), "DBL");
  assert.equal(nombre({ array: "u16" }), "array de U16");
});

test("una constante enseña su valor como LabVIEW y lee lo que se escribe", async () => {
  const { formatear, leerNumero } = await import("../../core/model/types.mjs");
  assert.equal(formatear(43.3, "number", ","), "43,3");
  assert.equal(formatear(0, "number", ","), "0");
  assert.equal(formatear(32, "i32", ","), "32");
  assert.equal(formatear(Infinity, "number"), "Inf");
  assert.deepEqual(leerNumero("43,3", "i32"), { valor: 43.3, tipo: "number" });
  assert.deepEqual(leerNumero("43.3", "i32"), { valor: 43.3, tipo: "number" });
  assert.deepEqual(leerNumero("32", "number"), { valor: 32, tipo: "number" }, "un entero no cambia una DBL");
  assert.deepEqual(leerNumero("300", "u8"), { valor: 255, tipo: "u8" }, "se satura");
  assert.equal(leerNumero("abc", "i32"), null);
});

// Representation, comprobado en LabVIEW 2026 Q3 con una constante DBL: 3,7 pasa a
// 4 y 2,5 pasa a 2 al cambiarla a I32 (labview-captures/block-diagram/
// numeric-representacion-*). La saturación entre enteros no se ha comprobado.
test("convertir un valor a otra representación redondea al par y satura", () => {
  assert.equal(convertirValor(3.7, "i32"), 4);
  assert.equal(convertirValor(2.5, "i32"), 2, "en un empate, al par");
  assert.equal(convertirValor(3.5, "i32"), 4);
  assert.equal(convertirValor(-2.5, "i32"), -2);
  assert.equal(convertirValor(-3.5, "i32"), -4);
  assert.equal(convertirValor(300, "u8"), 255, "satura por arriba");
  assert.equal(convertirValor(-5, "u8"), 0, "y por abajo");
  assert.equal(convertirValor(-200, "i8"), -128);
  assert.equal(convertirValor(NaN, "i16"), 0);
  assert.equal(convertirValor(Infinity, "i32"), 2147483647);
  assert.equal(convertirValor(3.7, "number"), 3.7);
  assert.equal(convertirValor(3.7, "sgl"), Math.fround(3.7), "un SGL pierde lo que no cabe en 32 bits");
  assert.ok(Object.is(convertirValor(-0.2, "i32"), 0), "sin cero negativo");
});

test("cada abreviatura de Representation nombra su tipo", () => {
  assert.equal(POR_ABREVIATURA.dbl, "number");
  assert.equal(POR_ABREVIATURA.sgl, "sgl");
  assert.equal(POR_ABREVIATURA.u16, "u16");
  assert.equal(POR_ABREVIATURA.ext, undefined, "EXT, FXP y los complejos aún no son tipos (DT-038 §5)");
});

// DT-044: like LabVIEW's type descriptor, an array is an element type plus a
// dimension count, and the element is never an array.
test("an array has an element type and a number of dimensions", () => {
  assert.equal(dimensionsOf({ array: "number" }), 1);
  assert.equal(dimensionsOf({ array: "number", dims: 2 }), 2);
  assert.equal(dimensionsOf("number"), 0);
  assert.deepEqual(arrayOf("number"), { array: "number" });
  assert.deepEqual(arrayOf({ array: "i32" }), { array: "i32", dims: 2 }, "an array of arrays is a 2D array");
  assert.deepEqual(arrayOf({ array: "i32", dims: 2 }), { array: "i32", dims: 3 });
  assert.deepEqual(withoutOneDimension({ array: "i32", dims: 2 }), { array: "i32" }, "one index of a 2D gives a row");
  assert.equal(withoutOneDimension({ array: "i32" }), "i32");
  assert.equal(iguales({ array: "number" }, { array: "number", dims: 2 }), false);
  assert.equal(conversion({ array: "i32", dims: 2 }, { array: "number", dims: 2 }), "coercion");
  assert.equal(conversion({ array: "number" }, { array: "number", dims: 2 }), null, "dimensions never convert");
  assert.equal(nombre({ array: "number", dims: 2 }), "2D array de DBL");
});

test("a nested array value flattens in row order and nests back", () => {
  const { sizes, elements } = flattenArrayValue([[1, 2, 3], [4]], 2, 0);
  assert.deepEqual(sizes, [2, 3]);
  assert.deepEqual(elements, [1, 2, 3, 4, 0, 0], "a ragged value is padded with the default");
  assert.deepEqual(nestArrayValue(elements, sizes), [[1, 2, 3], [4, 0, 0]]);
  assert.deepEqual(flattenArrayValue([], 2, 0), { sizes: [0, 0], elements: [] });
  assert.deepEqual(flattenArrayValue([7, 8], 1, 0), { sizes: [2], elements: [7, 8] });
  assert.deepEqual(nestArrayValue([], [0, 3]), []);
});
