// Programming ▸ String: Concatenate Strings, the functions the host runs in JavaScript over the same memory (DT-042 b),
// the conversions between numbers and strings, and the character tests.
//
// Each emitter takes the node's emitting context (`node`, compile-ovi's `e`) and returns its instructions.

import { esEntero } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { i32Const, ins, localGet } from "../instructions.mjs";
import { callMemory } from "../runtime-functions.mjs";
import { bitWidth, convertValue } from "../wasm-types.mjs";

/** A string block is `[length I32][bytes]` (linear-memory.mjs). */
const STRING_LENGTH_BYTES = 4;
/** The width a non-integer number is formatted with by the host's number-to-string functions. */
const FLOAT_BITS = 64;

/** Concatenate Strings: all its inputs, one after the other, in the node's cell. */
export function concatenateStrings(node) {
  const inputCount = node.cat.puertos(node.nodo).in.length;
  const handles = Array.from({ length: inputCount }, () => node.temporal("i32"));
  const lengths = Array.from({ length: inputCount }, () => node.temporal("i32"));
  const [block, cell] = [node.temporal("i32"), node.celda()];
  const sumOfLengths = (count) => lengths.slice(0, count).flatMap((length) => [localGet(length), ins("i32.add")]);
  const code = [];
  handles.forEach((handle, index) => code.push(...node.entrada(index), ins("local.set", handle), localGet(handle), callMemory("longitud"), ins("local.set", lengths[index])));
  code.push(i32Const(cell), i32Const(STRING_LENGTH_BYTES), ...sumOfLengths(inputCount), callMemory("redimensionar"), ins("local.tee", block));
  code.push(i32Const(0), ...sumOfLengths(inputCount), ins("i32.store"));
  // Each input's bytes go after the length and the bytes of the inputs before it.
  handles.forEach((handle, index) => {
    code.push(localGet(block), i32Const(STRING_LENGTH_BYTES), ins("i32.add"), ...sumOfLengths(index));
    code.push(localGet(handle), callMemory("datos"), localGet(lengths[index]), ins("memory.copy"));
  });
  code.push(i32Const(cell));
  return code;
}

/** A string function of the host: it leaves its result in the node's cell, and the cell's handle on the stack. */
export function callStringFunction(node, importName, inputs) {
  const cell = node.celda();
  return [i32Const(cell), ...inputs.flatMap((input) => node.entrada(input)), ins("call", importIndex(importName)), i32Const(cell)];
}

/** Number To Decimal/Hexadecimal/Octal String: the number (as f64), the width and the bits of its type. */
export function numberToString(node, importName) {
  const cell = node.celda();
  const type = node.tIn(0);
  return [i32Const(cell), ...node.entrada(0), ...convertValue(type, "number"), ...node.entrada(1), i32Const(esEntero(type) ? bitWidth(type) : FLOAT_BITS), ins("call", importIndex(importName)), i32Const(cell)];
}

/** Number To Fractional/Exponential/Engineering String: the number, the width, the precision and Use System Decimal Point. */
export function numberToFloatString(node, importName) {
  const cell = node.celda();
  return [i32Const(cell), ...node.entrada(1), ...convertValue(node.tIn(1), "number"), ...node.entrada(2), ...node.entrada(3), ...node.entrada(0), ins("call", importIndex(importName)), i32Const(cell)];
}

/**
 * Decimal/Hexadecimal/Octal/Fract-Exp String To Number: `first` is the position of string among the inputs (default
 * is the last). When there is no number, the output is default and offset past number is offset.
 */
export function stringToNumber(node, importName, first) {
  const [number, offsetPast] = [node.temporal("f64"), node.temporal("i32")];
  const type = node.tOut(1);
  return [
    ...node.entrada(first), ...node.entrada(first + 1), ins("call", importIndex(importName)), ins("local.set", number),
    ins("call", importIndex("extra")), ins("local.set", offsetPast),
    localGet(offsetPast),
    ...node.entrada(first + 2), ...convertValue(node.tIn(first + 2), type),
    localGet(number), ...convertValue("number", type),
    // A NaN means no number was read: then default.
    localGet(number), localGet(number), ins("f64.ne"), ins("select"),
  ];
}

/** The character tests: on the first byte of a string (-1 when it is empty) or on a number's code. */
export function characterTest(node, test) {
  const character = node.temporal("i32");
  const load =
    node.tIn(0) === "string"
      ? [...node.entrada(0), ins("local.tee", character), callMemory("datos"), ins("i32.load8_u"), i32Const(-1), localGet(character), callMemory("longitud"), ins("select")]
      : [...node.entrada(0), ...convertValue(node.tIn(0), "i32")];
  return [...load, ins("local.set", character), ...test(character)];
}
