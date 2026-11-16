// A row record: how a value goes to the host and comes back for the functions the host runs row by row (Format Into
// String and Scan From String, spec/04 Rule 21j; the Property Node, DT-072; the Call Library Function Node, DT-080).
// Each row is FORMAT_ROW_BYTES in a buffer of the node: [kind I32][bits I32][value: f64, i64 or I32].

import { esEntero } from "../../model/types.mjs";
import { ins } from "../instructions.mjs";
import { bitWidth, convertValue, isSigned } from "../wasm-types.mjs";

export const FORMAT_ROW_BYTES = 16;
export const ROW_BITS_OFFSET = 4;
export const ROW_VALUE_OFFSET = 8;
/** The kinds of row, numbered as the host reads them. */
const ROW_KIND = { float: 0, signed: 1, unsigned: 2, bool: 3, string: 4 };

const rowKind = (type) => (type === "string" ? ROW_KIND.string : type === "boolean" ? ROW_KIND.bool : !esEntero(type) ? ROW_KIND.float : isSigned(type) ? ROW_KIND.signed : ROW_KIND.unsigned);
const isIntegerKind = (kind) => kind === ROW_KIND.signed || kind === ROW_KIND.unsigned;
const integerTypeOf = (kind) => (kind === ROW_KIND.signed ? "i64" : "u64");

/** Writes the value that `value` leaves on the stack, of type `type`, into the row record at `record`. */
export function writeRow(type, record, value) {
  const kind = rowKind(type);
  const bits = type === "string" || type === "boolean" ? 0 : bitWidth(type);
  const header = [ins("i32.const", record), ins("i32.const", kind), ins("i32.store"), ins("i32.const", record), ins("i32.const", bits), ins("i32.store", ROW_BITS_OFFSET)];
  const at = [ins("i32.const", record)];
  if (kind === ROW_KIND.float) return [...header, ...at, ...value, ...convertValue(type, "number"), ins("f64.store", ROW_VALUE_OFFSET)];
  if (isIntegerKind(kind)) return [...header, ...at, ...value, ...convertValue(type, integerTypeOf(kind)), ins("i64.store", ROW_VALUE_OFFSET)];
  return [...header, ...at, ...value, ins("i32.store", ROW_VALUE_OFFSET)];
}

/** Leaves on the stack the value of type `type` that the host left in the row record at `record`. */
export function readRow(type, record) {
  const kind = rowKind(type);
  if (kind === ROW_KIND.float) return [ins("i32.const", record), ins("f64.load", ROW_VALUE_OFFSET), ...convertValue("number", type)];
  if (isIntegerKind(kind)) return [ins("i32.const", record), ins("i64.load", ROW_VALUE_OFFSET), ...convertValue(integerTypeOf(kind), type)];
  if (kind === ROW_KIND.string) return [ins("i32.const", record), ins("i32.load", ROW_BITS_OFFSET)];
  return [ins("i32.const", record), ins("i32.load", ROW_VALUE_OFFSET)];
}
