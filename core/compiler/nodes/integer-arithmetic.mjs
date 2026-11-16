// Numeric ▸ Quotient & Remainder and Scale By Power Of 2: the two functions whose integer results are not the float
// ones converted. Every case was measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-16-numeric-edges.md,
// Q3 and Q5).
//
// Each emitter takes the node's emitting context (`node`, compile-ovi's `e`) and returns its instructions.

import { constantOf } from "../constants.mjs";
import { importIndex } from "../host-imports.mjs";
import { ins } from "../instructions.mjs";
import { convertValue, integerConstant, isFloat, isSigned, narrowInteger, wasmTypeOf } from "../wasm-types.mjs";

const BITS_OF_WASM_TYPE = { i32: 32, i64: 64 };

/** Quotient & Remainder: gives x − y·floor(x/y) and floor(x/y), in that order. */
export function quotientAndRemainder(node) {
  return isFloat(node.tOut(0)) ? floatQuotientAndRemainder(node) : integerQuotientAndRemainder(node);
}

/** With floats, IEEE's: dividing by zero gives ±∞ (or NaN) and a NaN remainder. */
function floatQuotientAndRemainder(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  const [dividend, divisor, quotient] = [node.temporal(wasmType), node.temporal(wasmType), node.temporal(wasmType)];
  const get = (local) => ins("local.get", local);
  return [
    ...node.entrada(0), ins("local.set", dividend), ...node.entrada(1), ins("local.set", divisor),
    get(dividend), get(divisor), ins(`${wasmType}.div`), ins(`${wasmType}.floor`), ins("local.set", quotient),
    get(dividend), get(divisor), get(quotient), ins(`${wasmType}.mul`), ins(`${wasmType}.sub`),
    get(quotient),
  ];
}

/**
 * WebAssembly rounds a quotient toward zero: when the remainder is not zero and its sign is not the divisor's, the
 * floor is one less, and the remainder one divisor more. The three are locals of type `wasmType`.
 */
function roundQuotientDown(wasmType, quotient, remainder, divisor) {
  const get = (local) => ins("local.get", local);
  const zero = integerConstant(wasmType, 0);
  return [
    get(remainder), zero, ins(`${wasmType}.ne`), get(remainder), get(divisor), ins(`${wasmType}.xor`), zero, ins(`${wasmType}.lt_s`), ins("i32.and"),
    ins("if"),
    get(quotient), integerConstant(wasmType, 1), ins(`${wasmType}.sub`), ins("local.set", quotient),
    get(remainder), get(divisor), ins(`${wasmType}.add`), ins("local.set", remainder),
    ins("end"),
  ];
}

/**
 * With integers, exactly, in the integer's own width (an I64 does not fit a DBL). Dividing by zero gives quotient 0
 * and remainder x. The smallest integer divided by −1 wraps back to itself, with remainder 0; WebAssembly traps on
 * both divisions, so they never reach its `div`.
 */
function integerQuotientAndRemainder(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  const signed = isSigned(type);
  const [dividend, divisor, quotient, remainder] = Array.from({ length: 4 }, () => node.temporal(wasmType));
  const get = (local) => ins("local.get", local);
  const zero = integerConstant(wasmType, 0);
  const divide = [
    get(dividend), get(divisor), ins(`${wasmType}.div_${signed ? "s" : "u"}`), ins("local.set", quotient),
    get(dividend), get(divisor), ins(`${wasmType}.rem_${signed ? "s" : "u"}`), ins("local.set", remainder),
    ...(signed ? roundQuotientDown(wasmType, quotient, remainder, divisor) : []),
  ];
  const negateDividend = [zero, get(dividend), ins(`${wasmType}.sub`), ...narrowInteger(type), ins("local.set", quotient), zero, ins("local.set", remainder)];
  return [
    ...node.entrada(0), ins("local.set", dividend), ...node.entrada(1), ins("local.set", divisor),
    get(divisor), ins(`${wasmType}.eqz`),
    ins("if"), zero, ins("local.set", quotient), get(dividend), ins("local.set", remainder),
    ins("else"),
    ...(signed ? [get(divisor), integerConstant(wasmType, -1), ins(`${wasmType}.eq`), ins("if"), ...negateDividend, ins("else"), ...divide, ins("end")] : divide),
    ins("end"),
    get(remainder), get(quotient),
  ];
}

/** Scale By Power Of 2: x·2^n. */
export function scaleByPowerOf2(node) {
  const type = node.tOut(0);
  const wasmType = wasmTypeOf(type);
  if (isFloat(type)) return [...node.entrada(1), ins("f64.const", 2), ...node.entrada(0), ins("f64.convert_i32_s"), ins("call", importIndex("pow")), ...convertValue("number", type), ins(`${wasmType}.mul`)];
  return integerScaleByPowerOf2(node, type, wasmType);
}

/**
 * With an integer, a shift: to the left when n ≥ 0, losing the bits that leave the type; to the right when n < 0,
 * which rounds down (−7·2^−1 is −4). A shift of the whole width or more gives 0 to the left, and to the right what
 * shifting every bit out gives: 0, or −1 for a negative x. WebAssembly takes the count modulo the width instead, so
 * the count is checked first.
 */
function integerScaleByPowerOf2(node, type, wasmType) {
  const bits = BITS_OF_WASM_TYPE[wasmType];
  const [value, power, rightCount] = [node.temporal(wasmType), node.temporal("i32"), node.temporal("i32")];
  const get = (local) => ins("local.get", local);
  const toWasmType = wasmType === "i64" ? [ins("i64.extend_i32_u")] : [];
  return [
    ...node.entrada(1), ins("local.set", value), ...node.entrada(0), ins("local.set", power),
    // −n, at most one less than the width; compared as unsigned so that −(−2^31), which wraps, counts as large.
    ins("i32.const", 0), get(power), ins("i32.sub"), ins("local.tee", rightCount), ins("i32.const", bits - 1), get(rightCount), ins("i32.const", bits), ins("i32.lt_u"), ins("select"), ins("local.set", rightCount),
    get(value), get(rightCount), ...toWasmType, ins(`${wasmType}.shr_${isSigned(type) ? "s" : "u"}`),
    get(value), get(power), ...toWasmType, ins(`${wasmType}.shl`), ...constantOf(type, 0), get(power), ins("i32.const", bits), ins("i32.lt_s"), ins("select"),
    get(power), ins("i32.const", 0), ins("i32.lt_s"), ins("select"), ...narrowInteger(type),
  ];
}
