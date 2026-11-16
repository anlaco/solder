// How Solder's types are held in WebAssembly (DT-039, DT-042): the value type of each, the layout of a cluster in
// linear memory, and the instructions that convert a value from one numeric type to another, as LabVIEW's coercion dot.

import { NUMERICOS, esArray, esCluster, esEntero, esNumerico, representacion } from "../model/types.mjs";
import { ins } from "./instructions.mjs";

/** The WebAssembly value type a Solder type travels as, or null for one that has none. */
export function wasmTypeOf(type) {
  if (type === "boolean") return "i32";
  // A string travels as its handle, the address of its cell in the data space; a cluster or an array, as the address
  // of its block (DT-042).
  if (type === "string" || esCluster(type) || esArray(type)) return "i32";
  if (!esNumerico(type)) return null;
  const representation = representacion(type);
  if (representation === "number") return "f64";
  if (representation === "sgl") return "f32";
  return NUMERICOS[representation].bits === 64 ? "i64" : "i32";
}

export const isSigned = (type) => NUMERICOS[representacion(type)]?.signo ?? true;
export const bitWidth = (type) => NUMERICOS[representacion(type)]?.bits ?? 32;
export const isFloat = (type) => esNumerico(type) && !esEntero(type);

const CLUSTER_ALIGNMENT = 8;
const alignUp = (offset, alignment) => (offset + alignment - 1) & ~(alignment - 1);

/**
 * A cluster's layout in memory, as LabVIEW's (DT-042 §3): its fields in order, each scalar inside, aligned to its
 * size; a string as the cell of its handle; a cluster inside another, inline and aligned to 8. `tam` (its size) is
 * aligned to 8. The field names (`tam`, `campos`, `off`, `nombre`, `tipo`) are read by the runtime, so they stay.
 */
export function clusterLayout(type) {
  let offset = 0;
  const campos = [];
  for (const field of type.cluster) {
    const size = esCluster(field.type) ? clusterLayout(field.type).tam : ["f64", "i64"].includes(wasmTypeOf(field.type)) ? 8 : 4;
    offset = alignUp(offset, esCluster(field.type) ? CLUSTER_ALIGNMENT : size);
    campos.push({ off: offset, nombre: field.name, tipo: field.type });
    offset += size;
  }
  return { tam: alignUp(offset, CLUSTER_ALIGNMENT), campos };
}

/** Cuts an 8- or 16-bit integer back to its size, as LabVIEW wraps it on overflow. */
export function narrowInteger(type) {
  if (!esEntero(type) || bitWidth(type) > 16) return [];
  if (isSigned(type)) return [ins(bitWidth(type) === 8 ? "i32.extend8_s" : "i32.extend16_s")];
  return [ins("i32.const", bitWidth(type) === 8 ? 0xff : 0xffff), ins("i32.and")];
}

/** The range a float is clamped to before it becomes a small integer: [signed low, signed high, unsigned low, unsigned high]. */
const SMALL_INTEGER_RANGES = { 8: [-128, 127, 0, 255], 16: [-32768, 32767, 0, 65535] };

/** From a float to an integer: rounded to the nearest and saturated, as LabVIEW does (NI's help, "Numeric Conversion"). */
function floatToInteger(fromWasm, toWasm, to) {
  const conversion = [ins(`${fromWasm}.nearest`)];
  if (bitWidth(to) <= 16) {
    const range = SMALL_INTEGER_RANGES[bitWidth(to)];
    const [low, high] = isSigned(to) ? range.slice(0, 2) : range.slice(2);
    conversion.push(ins(`${fromWasm}.const`, low), ins(`${fromWasm}.max`), ins(`${fromWasm}.const`, high), ins(`${fromWasm}.min`));
  }
  conversion.push(ins(`${toWasm}.trunc_sat_${fromWasm}_${isSigned(to) ? "s" : "u"}`));
  return conversion;
}

/**
 * The instructions that convert the value on the stack from type `from` to type `to`, or null when a Boolean meets a
 * type of another width. Between integers the low bits are kept (unverified in LabVIEW: the common type never narrows,
 * so it does not happen today).
 */
export function convertValue(from, to) {
  if (from === to || JSON.stringify(from) === JSON.stringify(to)) return [];
  const [fromWasm, toWasm] = [wasmTypeOf(from), wasmTypeOf(to)];
  if (from === "boolean" || to === "boolean") return fromWasm === toWasm ? [] : null;
  if (isFloat(from) && isFloat(to)) return fromWasm === toWasm ? [] : [ins(toWasm === "f64" ? "f64.promote_f32" : "f32.demote_f64")];
  if (!isFloat(from) && isFloat(to)) return [ins(`${toWasm}.convert_${fromWasm}_${isSigned(from) ? "s" : "u"}`)];
  if (isFloat(from)) return floatToInteger(fromWasm, toWasm, to);
  const widening = [];
  if (fromWasm === "i32" && toWasm === "i64") widening.push(ins(isSigned(from) ? "i64.extend_i32_s" : "i64.extend_i32_u"));
  if (fromWasm === "i64" && toWasm === "i32") widening.push(ins("i32.wrap_i64"));
  return [...widening, ...narrowInteger(to)];
}

/** An integer constant of the value type `wasmType` ("i32" or "i64"). */
export const integerConstant = (wasmType, value) => ins(`${wasmType}.const`, wasmType === "i64" ? BigInt(value) : Number(value));

/** The low `width` bits set to one (only for widths under 32 bits). */
export const lowBitsMask = (width) => (1n << BigInt(width)) - 1n;
