// Rings (DT-091): the Text Ring and Menu Ring controls and indicators and the Ring Constant. A ring is a plain numeric
// of its representation, U16 by default; its items are pairs of a text and a value that belong to the object, not to
// the type, so a ring wire is an ordinary numeric wire (measured in LabVIEW 2026 Q3,
// labview-captures/reports/2026-11-15-rings.md, "Representation" and "Wiring").

import { convertirValor, esEntero, limites } from "./types.mjs";

/** A new ring's representation (measured: Text Ring, Menu Ring and Ring Constant are all U16). */
export const RING_REPRESENTATION = "u16";

/** The representations a ring takes (measured: Representation ▸ greys FXP and the complex types). */
export const RING_REPRESENTATIONS = ["ext", "dbl", "sgl", "i64", "i32", "i16", "i8", "u64", "u32", "u16", "u8"];

/** A new ring has one empty item whose value is 0 (measured). */
export const newRingItems = () => [{ text: "", value: 0 }];

/** The two looks of a panel ring (Controls ▸ Modern ▸ Ring & Enum, items 1 and 2). */
export const RING_STYLES = { TEXT: "text-ring", MENU: "menu-ring" };

/** Items with the values 0, 1, 2… by position, which is what "Sequential values" keeps (ticked by default, measured). */
export const sequentialItems = (texts) => texts.map((text, index) => ({ text, value: index }));

/** Are the values 0, 1, 2… by position? The dialog opens with "Sequential values" ticked only then (measured). */
export const isSequential = (items) => items.every((item, index) => item.value === index);

/** Is some value given to two items? LabVIEW greys OK while it is (measured). */
export function hasDuplicateValues(items) {
  const values = items.map((item) => item.value);
  return new Set(values).size !== values.length;
}

/**
 * What a ring shows for `value`: the text of the item that has it, or `<value>` when none has (measured: `<9>`, both with
 * Allow Undefined Values off and on; nothing coerces the value).
 */
export function ringText(items, value) {
  const item = items.find((candidate) => candidate.value === value);
  return item ? item.text : `<${value}>`;
}

/** A value typed into the Values column, brought into the representation's range (measured: on U16, -1 gives 0 and 70000 gives 65535). */
export const typedRingValue = (typed, representation) => convertirValor(typed, representation);

/**
 * Item values after the ring's representation changes: an integer wraps modulo 2^n into the new range (measured: I32
 * [10106, 10083, 10078, -1] to I8 gave [122, 99, 94, -1], and -1 to U8 gave 255); a float to an integer rounds to the
 * nearest (measured on a value, 3.5 read back 4: LabVIEW rounds half to even, as `convertirValor`).
 */
export function itemsInRepresentation(items, representation) {
  return items.map((item) => ({ ...item, value: valueInRepresentation(item.value, representation) }));
}

function valueInRepresentation(value, representation) {
  if (!esEntero(representation)) return convertirValor(value, representation);
  const { min, max } = limites(representation);
  const span = max - min + 1n;
  const whole = BigInt(convertirValor(value, "i64"));
  return Number((((whole - min) % span) + span) % span + min);
}

/**
 * The ring's items as stored: `[{ text, value }]`. A file of format version 4 or older saved a ring constant's items as
 * texts whose values were their positions (DT-091 §3); those still read here, so a node built before the migration ran
 * (a test, the clipboard) shows the same.
 */
export function ringItems(config) {
  const items = config?.items;
  if (!Array.isArray(items) || items.length === 0) return newRingItems();
  return items.map((item, index) => (typeof item === "string" ? { text: item, value: index } : item));
}
