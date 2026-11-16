// A reference evaluator for the property tests of the compiler (compiler-properties.test.mjs): what each numeric
// function gives, computed with JavaScript's own numbers and never with the compiler's code. It lives only in the tests:
// the product has no interpreter (DT-039).
//
// A value is a BigInt for an integer type, a number for a float type and a boolean for a Boolean. Each rule is
// LabVIEW's, as the catalog and labview-captures/reports/2026-11-16-numeric-edges.md give it.

import { NUMERICOS } from "../../core/model/types.mjs";

const isInteger = (type) => type !== "boolean" && NUMERICOS[type].entero;
const isFloat = (type) => type !== "boolean" && !NUMERICOS[type].entero;

/** The integer `value` cut to the width of `type`, as an overflow wraps. */
const wrap = (type, value) => (NUMERICOS[type].signo ? BigInt.asIntN(NUMERICOS[type].bits, value) : BigInt.asUintN(NUMERICOS[type].bits, value));

/** The float `value` as `type` holds it: an SGL keeps 24 bits of mantissa. */
const asFloat = (type, value) => (type === "sgl" ? Math.fround(value) : value);

const limitsOf = (type) => {
  const { bits, signo } = NUMERICOS[type];
  return signo ? [-(2n ** BigInt(bits - 1)), 2n ** BigInt(bits - 1) - 1n] : [0n, 2n ** BigInt(bits) - 1n];
};

/** Rounds to the nearest integer, a tie to the even one; a zero keeps the sign of what was rounded, as IEEE says. */
function roundHalfToEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  const rounded = fraction < 0.5 || (fraction === 0.5 && floor % 2 === 0) ? floor : floor + 1;
  return rounded === 0 && value < 0 ? -0 : rounded;
}

/** A float to an integer type: rounded, saturated, and the largest value for a NaN. */
function floatToInteger(type, value) {
  const [lowest, highest] = limitsOf(type);
  if (Number.isNaN(value)) return highest;
  const rounded = roundHalfToEven(value);
  if (rounded >= Number(highest)) return highest;
  if (rounded <= Number(lowest)) return lowest;
  return BigInt(rounded);
}

const DOUBLE_MANTISSA_BITS = 53n;

/**
 * An integer to a float type, rounded once. To a DBL, JavaScript's own conversion is that. To an SGL, a 64-bit integer
 * would be rounded twice, first to a DBL; so the bits a DBL cannot hold are folded into one sticky bit, far below
 * where the SGL rounds, and the second rounding decides alone.
 */
function integerToFloat(type, value) {
  if (type === "number") return Number(value);
  const magnitude = value < 0n ? -value : value;
  const excess = BigInt(magnitude.toString(2).length) - DOUBLE_MANTISSA_BITS;
  if (excess <= 0n) return Math.fround(Number(value));
  const sticky = magnitude & ((1n << excess) - 1n) ? 1n : 0n;
  const folded = Number(((magnitude >> excess) | sticky) << excess);
  return Math.fround(value < 0n ? -folded : folded);
}

/** The value of type `from` as a value of type `to`: LabVIEW's coercion dot. */
export function convert(value, from, to) {
  if (from === to) return value;
  if (isInteger(to)) return isInteger(from) ? wrap(to, value) : floatToInteger(to, value);
  return isInteger(from) ? integerToFloat(to, value) : asFloat(to, value);
}

/** One arithmetic step in `type`: `integer` over BigInts, wrapped; `float` over numbers, rounded to the type. */
const compute = (type, integer, float) => (isInteger(type) ? (...values) => wrap(type, integer(...values)) : (...values) => asFloat(type, float(...values)));

const signOf = (value) => (value > 0 ? 1 : value < 0 ? -1 : 0);
const magnitudeOf = (value) => (value < 0n ? -value : value);

/** floor(x / y) and x − y·floor(x / y) in `type`; an integer divided by zero gives 0 and x. */
function quotientAndRemainder(type, x, y) {
  if (isFloat(type)) {
    const quotient = asFloat(type, Math.floor(asFloat(type, x / y)));
    return { quotient, remainder: asFloat(type, x - asFloat(type, y * quotient)) };
  }
  if (y === 0n) return { quotient: 0n, remainder: x };
  const truncated = x / y;
  const floor = x % y !== 0n && x < 0n !== y < 0n ? truncated - 1n : truncated;
  return { quotient: wrap(type, floor), remainder: wrap(type, x - y * floor) };
}

/** Max & Min of two floats: a NaN is ignored when the other is a number. */
function largerAndSmaller(type, x, y) {
  if (isInteger(type)) return { max: x > y ? x : y, min: x < y ? x : y };
  if (Number.isNaN(x)) return { max: y, min: y };
  if (Number.isNaN(y)) return { max: x, min: x };
  return { max: Math.max(x, y), min: Math.min(x, y) };
}

const logical = (integer, boolean) => (type, x, y) => (type === "boolean" ? boolean(x, y) : wrap(type, integer(x, y)));

const INTEGER_CONVERSIONS = {
  "to-byte-integer": "i8", "to-word-integer": "i16", "to-long-integer": "i32", "to-quad-integer": "i64",
  "to-unsigned-byte-integer": "u8", "to-unsigned-word-integer": "u16", "to-unsigned-long-integer": "u32", "to-unsigned-quad-integer": "u64",
  "to-single-precision-float": "sgl", "to-double-precision-float": "number",
};

/**
 * What each function gives: `(inputs, inputTypes, outputTypes) → outputs`, the inputs already in their terminals'
 * types and everything by port name.
 */
export const FUNCTIONS = {
  add: ({ a, b }, _, { result }) => ({ result: compute(result, (x, y) => x + y, (x, y) => x + y)(a, b) }),
  sub: ({ a, b }, _, { result }) => ({ result: compute(result, (x, y) => x - y, (x, y) => x - y)(a, b) }),
  mul: ({ a, b }, _, { result }) => ({ result: compute(result, (x, y) => x * y, (x, y) => x * y)(a, b) }),
  div: ({ a, b }, types, { result }) => ({ result: asFloat(result, convert(a, types.a, result) / convert(b, types.b, result)) }),
  increment: ({ x }, _, { result }) => ({ result: compute(result, (value) => value + 1n, (value) => value + 1)(x) }),
  decrement: ({ x }, _, { result }) => ({ result: compute(result, (value) => value - 1n, (value) => value - 1)(x) }),
  square: ({ x }, _, { result }) => ({ result: compute(result, (value) => value * value, (value) => value * value)(x) }),
  "absolute-value": ({ x }, _, { result }) => ({ result: compute(result, magnitudeOf, Math.abs)(x) }),
  sign: ({ number }, _, { result }) => ({ result: compute(result, (value) => BigInt(signOf(value)), signOf)(number) }),
  "round-to-nearest": ({ number }, _, { result }) => ({ result: isInteger(result) ? number : asFloat(result, roundHalfToEven(number)) }),
  "quotient-remainder": ({ x, y }, _, { quotient }) => quotientAndRemainder(quotient, x, y),
  "max-and-min": ({ x, y }, _, { max }) => largerAndSmaller(max, x, y),
  equal: ({ x, y }) => ({ result: x === y }),
  less: ({ x, y }) => ({ result: x < y }),
  "greater-or-equal": ({ x, y }) => ({ result: x >= y }),
  select: ({ t, s, f }) => ({ result: s ? t : f }),
  "and-op": ({ x, y }, _, { result }) => ({ result: logical((p, q) => p & q, (p, q) => p && q)(result, x, y) }),
  "or-op": ({ x, y }, _, { result }) => ({ result: logical((p, q) => p | q, (p, q) => p || q)(result, x, y) }),
  "xor-op": ({ x, y }, _, { result }) => ({ result: logical((p, q) => p ^ q, (p, q) => p !== q)(result, x, y) }),
  ...Object.fromEntries(Object.entries(INTEGER_CONVERSIONS).map(([block, to]) => [block, ({ number }, types) => ({ result: convert(number, types.number, to) })])),
};

/** The value a control of `type` hands to the diagram when the panel is given `value`. */
export const controlValue = (type, value) => (isInteger(type) ? wrap(type, BigInt(value)) : asFloat(type, Number(value)));

/** The value as the panel shows it: a 64-bit integer reaches it as a JavaScript number (runtime.mjs). */
export const asShown = (value) => (typeof value === "bigint" ? Number(value) : value);

/** Values worth trying in a control of `type`: its ends, what lies around zero, and what a float has that an integer has not. */
export function interestingValues(type) {
  if (isFloat(type)) return [0, -0, 1, -1, 0.5, 2.5, -2.5, 3.5, 255.5, 1e10, -1e10, 3e9, 1e19, -1e19, 1e-3, Infinity, -Infinity, NaN];
  const [lowest, highest] = limitsOf(type);
  const around = [0n, 1n, 2n, 3n, 7n, 100n, 127n, 128n, 255n, 256n, -1n, -2n, -7n, -128n];
  return [...new Set([lowest, highest, lowest + 1n, highest - 1n, ...around.filter((value) => value >= lowest && value <= highest)])];
}
