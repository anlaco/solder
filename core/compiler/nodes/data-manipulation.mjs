// Numeric ▸ Data Manipulation: the operations on the bits of an integer, and Mantissa & Exponent.
//
// An integer narrower than 32 bits lives in an i32 with its sign (or zeros) extended; a 64-bit one in an i64. Each
// operation works on the bits of its type's width and leaves the result back in that form (`narrowInteger`).
//
// Each emitter takes the node's emitting context (`node`, compile-vi's `e`) and returns its instructions.

import { ins } from "../instructions.mjs";
import { bitWidth, convertValue, integerConstant, lowBitsMask, narrowInteger, wasmTypeOf } from "../wasm-types.mjs";

const BYTE_BITS = 8;
const WORD_BITS = 16;
const LONG_BITS = 32;
const QUAD_BITS = 64;

/** Swap Bytes: the two bytes of each 16-bit word. */
export function swapBytes(node) {
  const type = node.tIn(0);
  const [width, wasmType] = [bitWidth(type), wasmTypeOf(type)];
  if (width === BYTE_BITS) return node.entrada(0);
  const lowBytes = width === WORD_BITS ? 0xff : width === LONG_BITS ? 0x00ff00ff : 0x00ff00ff00ff00ffn;
  const value = node.temporal(wasmType);
  return [
    ...node.entrada(0), ins("local.tee", value), integerConstant(wasmType, lowBytes), ins(`${wasmType}.and`), integerConstant(wasmType, BYTE_BITS), ins(`${wasmType}.shl`),
    ins("local.get", value), integerConstant(wasmType, BYTE_BITS), ins(`${wasmType}.shr_u`), integerConstant(wasmType, lowBytes), ins(`${wasmType}.and`), ins(`${wasmType}.or`),
    ...narrowInteger(type),
  ];
}

/** Swap Words: the two 16-bit words of each 32-bit integer. */
export function swapWords(node) {
  const type = node.tIn(0);
  const [width, wasmType] = [bitWidth(type), wasmTypeOf(type)];
  if (width <= WORD_BITS) return node.entrada(0);
  if (width === LONG_BITS) return [...node.entrada(0), integerConstant("i32", WORD_BITS), ins("i32.rotl")];
  const value = node.temporal("i64");
  const lowWords = 0x0000ffff0000ffffn;
  return [
    ...node.entrada(0), ins("local.tee", value), integerConstant(wasmType, lowWords), ins("i64.and"), integerConstant(wasmType, WORD_BITS), ins("i64.shl"),
    ins("local.get", value), integerConstant(wasmType, WORD_BITS), ins("i64.shr_u"), integerConstant(wasmType, lowWords), ins("i64.and"), ins("i64.or"),
  ];
}

/** The shift `y`, as an i32. */
const shiftAmount = (node) => [...node.entrada(1), ...convertValue(node.tIn(1), "i32")];

/** Rotate: x rotated left by y bits; to the right when y is negative. */
export function rotate(node) {
  const type = node.tIn(0);
  const width = bitWidth(type);
  if (width === LONG_BITS) return [...node.entrada(0), ...shiftAmount(node), ins("i32.rotl")];
  if (width === QUAD_BITS) return [...node.entrada(0), ...shiftAmount(node), ins("i64.extend_i32_s"), ins("i64.rotl")];
  const [value, amount] = [node.temporal("i32"), node.temporal("i32")];
  const mask = Number(lowBitsMask(width));
  return [
    ...node.entrada(0), integerConstant("i32", mask), ins("i32.and"), ins("local.set", value),
    ...shiftAmount(node), integerConstant("i32", width - 1), ins("i32.and"), ins("local.set", amount),
    ins("local.get", value), ins("local.get", amount), ins("i32.shl"),
    ins("local.get", value), integerConstant("i32", width), ins("local.get", amount), ins("i32.sub"), ins("i32.shr_u"),
    ins("i32.or"), integerConstant("i32", mask), ins("i32.and"), ...narrowInteger(type),
  ];
}

/** Logical Shift: x << y, filling with zeros; to the right when y is negative; zero when y leaves the width. */
export function logicalShift(node) {
  const type = node.tIn(0);
  const [width, wasmType] = [bitWidth(type), wasmTypeOf(type)];
  const [value, amount] = [node.temporal(wasmType), node.temporal("i32")];
  const widen = wasmType === "i64" ? [ins("i64.extend_i32_s")] : [];
  const masked = width < LONG_BITS ? [integerConstant("i32", Number(lowBitsMask(width))), ins("i32.and")] : [];
  return [
    ...node.entrada(0), ...masked, ins("local.set", value),
    ...shiftAmount(node), ins("local.set", amount),
    // In range: -(w-1) <= y <= w-1  ⇔  (y + w-1) <u 2w-1.
    ins("local.get", value), ins("local.get", amount), ...widen, ins(`${wasmType}.shl`),
    ins("local.get", value), integerConstant("i32", 0), ins("local.get", amount), ins("i32.sub"), ...widen, ins(`${wasmType}.shr_u`),
    ins("local.get", amount), integerConstant("i32", -1), ins("i32.gt_s"), ins("select"),
    integerConstant(wasmType, 0),
    ins("local.get", amount), integerConstant("i32", width - 1), ins("i32.add"), integerConstant("i32", 2 * width - 1), ins("i32.lt_u"), ins("select"),
    ...narrowInteger(type),
  ];
}

/** Rotate Left With Carry or Rotate Right With Carry: gives [carry, value]. */
export const rotateWithCarry = (toTheLeft) => (node) => {
  const type = node.tIn(1);
  const [width, wasmType] = [bitWidth(type), wasmTypeOf(type)];
  const [value, carry] = [node.temporal(wasmType), node.temporal("i32")];
  const toWasmType = wasmType === "i64" ? [ins("i64.extend_i32_u")] : [];
  const toI32 = wasmType === "i64" ? [ins("i32.wrap_i64")] : [];
  const masked = toTheLeft || width >= LONG_BITS ? [] : [integerConstant("i32", Number(lowBitsMask(width))), ins("i32.and")];
  const inputs = [...node.entrada(1), ...masked, ins("local.set", value), ...node.entrada(0), ins("local.set", carry)];
  if (toTheLeft) {
    return [
      ...inputs,
      ins("local.get", value), integerConstant(wasmType, width - 1), ins(`${wasmType}.shr_u`), ...toI32, integerConstant("i32", 1), ins("i32.and"),
      ins("local.get", value), integerConstant(wasmType, 1), ins(`${wasmType}.shl`), ins("local.get", carry), ...toWasmType, ins(`${wasmType}.or`), ...narrowInteger(type),
    ];
  }
  return [
    ...inputs,
    ins("local.get", value), integerConstant(wasmType, 1), ins(`${wasmType}.and`), ...toI32,
    ins("local.get", value), integerConstant(wasmType, 1), ins(`${wasmType}.shr_u`), ins("local.get", carry), ...toWasmType, integerConstant(wasmType, width - 1), ins(`${wasmType}.shl`), ins(`${wasmType}.or`), ...narrowInteger(type),
  ];
};

/** Split Number: [hi, lo], each unsigned and half as wide. */
export function splitNumber(node) {
  const type = node.tIn(0);
  const [width, wasmType] = [bitWidth(type), wasmTypeOf(type)];
  const value = node.temporal(wasmType);
  const half = width / 2;
  if (width === QUAD_BITS) return [...node.entrada(0), ins("local.set", value), ins("local.get", value), integerConstant("i64", LONG_BITS), ins("i64.shr_u"), ins("i32.wrap_i64"), ins("local.get", value), ins("i32.wrap_i64")];
  const mask = Number(lowBitsMask(half));
  return [
    ...node.entrada(0), ins("local.set", value),
    ins("local.get", value), integerConstant("i32", half), ins("i32.shr_u"), integerConstant("i32", mask), ins("i32.and"),
    ins("local.get", value), integerConstant("i32", mask), ins("i32.and"),
  ];
}

/** Join Numbers: (hi.lo), unsigned and twice as wide. */
export function joinNumbers(node) {
  const width = bitWidth(node.tIn(0));
  if (width === LONG_BITS) return [...node.entrada(0), ins("i64.extend_i32_u"), integerConstant("i64", LONG_BITS), ins("i64.shl"), ...node.entrada(1), ins("i64.extend_i32_u"), ins("i64.or")];
  const mask = Number(lowBitsMask(width));
  return [
    ...node.entrada(0), integerConstant("i32", mask), ins("i32.and"), integerConstant("i32", width), ins("i32.shl"),
    ...node.entrada(1), integerConstant("i32", mask), ins("i32.and"), ins("i32.or"),
  ];
}

/** The IEEE 754 fields of a float: where its exponent starts, the exponent's mask and its bias. */
const FLOAT_FIELDS = {
  f32: { bitsType: "i32", exponentShift: 23, exponentMask: 0xff, bias: 127 },
  f64: { bitsType: "i64", exponentShift: 52, exponentMask: 0x7ff, bias: 1023 },
};

/** Mantissa & Exponent: number = mantissa * 2^exponent, with 1 <= |mantissa| < 2; 0 gives (0, 0). */
export function mantissaAndExponent(node) {
  const floatType = wasmTypeOf(node.tOut(0)) === "f32" ? "f32" : "f64";
  const { bitsType, exponentShift, exponentMask, bias } = FLOAT_FIELDS[floatType];
  const isSingle = floatType === "f32";
  const [bits, exponent] = [node.temporal(bitsType), node.temporal(bitsType)];
  const zero = [ins(`${floatType}.const`, 0)];
  const readExponent = [ins("local.get", bits), integerConstant(bitsType, exponentShift), ins(`${bitsType}.shr_u`), integerConstant(bitsType, exponentMask), ins(`${bitsType}.and`), ins("local.set", exponent)];
  const exponentIsZero = [ins("local.get", exponent), ins(`${bitsType}.eqz`)];
  const unbiased = [ins("local.get", exponent), integerConstant(bitsType, bias), ins(`${bitsType}.sub`), ins(isSingle ? "f32.convert_i32_s" : "f64.convert_i64_s")];
  // The mantissa: the number's bits with the exponent set to 0 (the bias).
  const clearedExponent = isSingle ? ~(exponentMask << exponentShift) : ~(BigInt(exponentMask) << BigInt(exponentShift));
  const biasedZero = isSingle ? bias << exponentShift : BigInt(bias) << BigInt(exponentShift);
  const mantissa = [ins("local.get", bits), integerConstant(bitsType, clearedExponent), ins(`${bitsType}.and`), integerConstant(bitsType, biasedZero), ins(`${bitsType}.or`), ins(isSingle ? "f32.reinterpret_i32" : "f64.reinterpret_i64")];
  // `select` gives its first operand when the condition is true: with exponent 0, the zero.
  return [
    ...node.entrada(0), ins(isSingle ? "i32.reinterpret_f32" : "i64.reinterpret_f64"), ins("local.set", bits), ...readExponent,
    ...zero, ...mantissa, ...exponentIsZero, ins("select"),
    ...zero, ...unbiased, ...exponentIsZero, ins("select"),
  ];
}
