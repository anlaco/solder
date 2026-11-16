// Programming ▸ Numeric, Boolean and Comparison: the arithmetic of two values, rounding, the comparisons, Max & Min,
// In Range and Coerce, the logical functions and Compound Arithmetic.
//
// Each emitter takes the node's emitting context (`node`, compile-ovi's `e`) and returns its instructions.

import { PATH, esCluster } from "../../model/types.mjs";
import { constantOf } from "../constants.mjs";
import { importIndex } from "../host-imports.mjs";
import { i32Const, ins } from "../instructions.mjs";
import { isFloat, isSigned, narrowInteger, wasmTypeOf } from "../wasm-types.mjs";

/** An arithmetic function of two inputs: `operation` is WebAssembly's (add, sub, mul…), wrapped to the type's width. */
export function arithmetic(node, operation) {
  const type = node.tOut(0);
  return [...node.entrada(0), ...node.entrada(1), ins(`${wasmTypeOf(type)}.${operation}`), ...narrowInteger(type)];
}

/** A rounding function (floor, ceil, nearest…): a float is rounded, an integer is already whole. */
export function rounding(node, operation) {
  const type = node.tOut(0);
  return isFloat(type) ? [...node.entrada(0), ins(`${wasmTypeOf(type)}.${operation}`)] : node.entrada(0);
}

/**
 * The instruction that compares two values of type `type`: `operation` is eq, ne, gt, lt, ge or le. Signed and unsigned
 * integers use their own comparison; floats, IEEE's: with a NaN everything is FALSE but `ne`.
 */
export function compareInstruction(type, operation) {
  const wasmType = wasmTypeOf(type);
  if (isFloat(type) || operation === "eq" || operation === "ne") return ins(`${wasmType}.${operation}`);
  return ins(`${wasmType}.${operation}_${type === "boolean" || isSigned(type) ? "s" : "u"}`);
}

/** A comparison of two inputs. */
export function compare(node, operation) {
  if (esCluster(node.tIn(0)) || esCluster(node.tIn(1))) throw new Error("Comparing clusters cannot be compiled yet (M6).");
  // Two paths are equal with the host's rules (DT-067); how LabVIEW orders paths is not measured.
  if (node.logicalTIn(0) === PATH) {
    if (operation !== "eq" && operation !== "ne") throw new Error("Comparing paths by order is not measured in LabVIEW yet.");
    return [...node.entrada(0), ...node.entrada(1), ins("call", importIndex("paths_equal")), ...(operation === "ne" ? [ins("i32.eqz")] : [])];
  }
  // Strings are compared byte by byte, by the host, which gives -1, 0 or 1.
  if (node.tIn(0) === "string") return [...node.entrada(0), ...node.entrada(1), ins("call", importIndex("cmp")), i32Const(0), ins(`i32.${operation}${operation === "eq" || operation === "ne" ? "" : "_s"}`)];
  return [...node.entrada(0), ...node.entrada(1), compareInstruction(node.tIn(0), operation)];
}

/** A comparison of the input with zero (Equal To 0?, Greater Than 0?…). */
export function compareWithZero(node, operation) {
  return [...node.entrada(0), ...constantOf(node.tIn(0), 0), compareInstruction(node.tIn(0), operation)];
}

/** The larger or the smaller of two locals; with floats a NaN wins, as WebAssembly's own max and min do. */
function extreme(type, operation, first, second) {
  const [getFirst, getSecond] = [ins("local.get", first), ins("local.get", second)];
  if (isFloat(type)) return [getFirst, getSecond, ins(`${wasmTypeOf(type)}.${operation}`)];
  return [getFirst, getSecond, getFirst, getSecond, compareInstruction(type, operation === "max" ? "gt" : "lt"), ins("select")];
}

/**
 * The larger (`operation` "max") or the smaller ("min") of two locals of type `type`. With floats, as LabVIEW's Max &
 * Min (checked in 2026 Q3): a NaN is ignored when the other is a number, and two NaNs give NaN. WebAssembly's
 * `f64.max` propagates the NaN instead, so the result is corrected through `scratch`, a temporary local.
 */
function maxOrMin(type, operation, first, second, scratch) {
  if (!isFloat(type)) return extreme(type, operation, first, second);
  const wasmType = wasmTypeOf(type);
  const [getFirst, getSecond] = [ins("local.get", first), ins("local.get", second)];
  return [
    getSecond, getFirst, getSecond, ins(`${wasmType}.${operation}`), getFirst, getFirst, ins(`${wasmType}.ne`), ins("select"), ins("local.set", scratch),
    getFirst, ins("local.get", scratch), getSecond, getSecond, ins(`${wasmType}.ne`), ins("select"),
  ];
}

/** Max & Min: gives max(x, y) and min(x, y). */
export function maxAndMin(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  const [first, second, scratch] = [node.temporal(wasmType), node.temporal(wasmType), node.temporal(wasmType)];
  return [
    ...node.entrada(0), ins("local.set", first), ...node.entrada(1), ins("local.set", second),
    ...maxOrMin(type, "max", first, second, scratch), ...maxOrMin(type, "min", first, second, scratch),
  ];
}

/**
 * In Range and Coerce (upper limit, x, lower limit). In Range? compares with the limits as they come, including each
 * end or not by the node's configuration; with crossed limits it is FALSE. coerced(x) brings x into the range with the
 * limits in order, and is NaN when x or a limit is. Checked in LabVIEW 2026 Q3.
 */
export function inRangeAndCoerce(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  const [upper, value, lower, low, high, raised] = Array.from({ length: 6 }, () => node.temporal(wasmType));
  const config = node.nodo.config ?? {};
  const [includeUpper, includeLower] = [config["include-upper-limit"] ?? false, config["include-lower-limit"] ?? true];
  return [
    ...node.entrada(0), ins("local.set", upper), ...node.entrada(1), ins("local.set", value), ...node.entrada(2), ins("local.set", lower),
    // coerced(x) = min(max(x, min(L, U)), max(L, U))
    ...extreme(type, "min", lower, upper), ins("local.set", low),
    ...extreme(type, "max", lower, upper), ins("local.set", high),
    ...extreme(type, "max", value, low), ins("local.set", raised),
    ...extreme(type, "min", raised, high),
    // In Range?
    ins("local.get", value), ins("local.get", lower), compareInstruction(type, includeLower ? "ge" : "gt"),
    ins("local.get", value), ins("local.get", upper), compareInstruction(type, includeUpper ? "le" : "lt"),
    ins("i32.and"),
  ];
}

/** Logical negation: of a Boolean, its opposite; of an integer, all its bits. */
export function negate(type) {
  if (type === "boolean") return [ins("i32.eqz")];
  return [...constantOf(type, -1), ins(`${wasmTypeOf(type)}.xor`), ...narrowInteger(type)];
}

/** A logical function of two inputs (And, Or, Exclusive Or). */
export function logical(node, operation) {
  return [...node.entrada(0), ...node.entrada(1), ins(`${wasmTypeOf(node.tOut(0))}.${operation}`)];
}

const COMPOUND_OPERATIONS = { add: "add", multiply: "mul", and: "and", or: "or", xor: "xor" };

/** What an inverted input or output of Compound Arithmetic becomes: negated (add), its reciprocal (multiply) or its bits negated. */
function compoundInversion(node, mode, type) {
  const wasmType = wasmTypeOf(type);
  if (mode === "add") return isFloat(type) ? [ins(`${wasmType}.neg`)] : [...constantOf(type, -1), ins(`${wasmType}.mul`)];
  if (mode === "multiply") {
    const value = node.temporal(wasmType);
    return [ins("local.set", value), ...constantOf(type, 1), ins("local.get", value), ins(isFloat(type) ? `${wasmType}.div` : `${wasmType}.div_s`)];
  }
  return negate(type);
}

/** Compound Arithmetic: its operation over all its inputs, each inverted one inverted first. */
export function compoundArithmetic(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  const mode = node.nodo.config?.mode ?? node.cat.bloque(node.nodo.tipo).config.mode.value;
  const inverted = new Set(node.nodo.config?.inverted ?? []);
  const inputCount = node.cat.puertos(node.nodo).in.length;
  const code = [];
  for (let input = 0; input < inputCount; input++) {
    code.push(...node.entrada(input));
    if (inverted.has(`value-${input}`)) code.push(...compoundInversion(node, mode, type));
    if (input) code.push(ins(`${wasmType}.${COMPOUND_OPERATIONS[mode]}`), ...narrowInteger(type));
  }
  if (inverted.has("result")) code.push(...compoundInversion(node, mode, type));
  return code;
}
