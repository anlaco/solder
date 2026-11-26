// The values that constants and controls store in Solder's files: what a scalar value may be, checked when the file
// is read (issue #22), and the numbers JSON cannot hold, written as the texts LabVIEW shows (DT-108). Only scalars and
// arrays of them are handled here; paths, clusters and the rest keep their own readers, and a cluster's elements are
// read one by one as objects of their own.

import { esArray, esNumerico, withoutOneDimension } from "./types.mjs";

/** The text of each number JSON cannot hold, as LabVIEW shows it (`formatear` in types.mjs). */
const INFINITY_TEXT = "Inf";
const MINUS_INFINITY_TEXT = "-Inf";
const NAN_TEXT = "NaN";
const NUMBER_OF_TEXT = new Map([[INFINITY_TEXT, Infinity], [MINUS_INFINITY_TEXT, -Infinity], [NAN_TEXT, NaN]]);

/** A `JSON.stringify` replacer that writes Inf, -Inf and NaN, wherever they are, as their texts instead of `null`. */
export function specialNumbersAsText(key, value) {
  if (typeof value !== "number" || Number.isFinite(value)) return value;
  if (Number.isNaN(value)) return NAN_TEXT;
  return value > 0 ? INFINITY_TEXT : MINUS_INFINITY_TEXT;
}

/** Words for the kind each scalar type needs, for the message. */
const TEXT = "text";
const BOOLEAN = "true or false";
const NUMBER = `a number (or "${INFINITY_TEXT}", "${MINUS_INFINITY_TEXT}", "${NAN_TEXT}")`;

/**
 * The kind of value `type` needs and whether `value` is one, or null for a type not checked here. A number may also
 * be null: an Inf or NaN saved before DT-108, which cannot be told apart and reads as the block's default.
 */
function expectedKind(type) {
  if (type === "string") return { words: TEXT, accepts: (value) => typeof value === "string" };
  if (type === "boolean") return { words: BOOLEAN, accepts: (value) => typeof value === "boolean" };
  if (esNumerico(type)) return { words: NUMBER, accepts: (value) => value === null || typeof value === "number" || NUMBER_OF_TEXT.has(value) };
  return null;
}

/**
 * Throws `ErrorType` when `value`, the value an object named `name` stores for its `type`, is not of that type's kind.
 * An absent value is the block's own default and passes.
 */
export function checkScalarValue({ name, type, value, ErrorType }) {
  if (value === undefined) return;
  const kind = expectedKind(type);
  if (!kind || kind.accepts(value)) return;
  throw new ErrorType(`"${name}" holds ${JSON.stringify(value)} as its value, which must be ${kind.words}`);
}

/**
 * `value` as the file stores it for `type`, read back: the texts of DT-108 become their numbers where `type` (or, in an
 * array, its element type) is numeric. Anything else is returned as it is.
 */
export function valueFromFile(value, type) {
  if (esNumerico(type)) return NUMBER_OF_TEXT.has(value) ? NUMBER_OF_TEXT.get(value) : value;
  if (esArray(type) && Array.isArray(value)) return value.map((element) => valueFromFile(element, withoutOneDimension(type)));
  return value;
}

/**
 * The editor's clipboard carries graph fragments between windows as JSON (spec/05 rule 73), where a string may hold
 * any text, "Inf" included; so there each number JSON cannot hold travels as an object no graph holds.
 */
const CLIPBOARD_NUMBER_KEY = "solder-non-finite-number";

/** The text of a clipboard packet, keeping Inf, -Inf and NaN. */
export const clipboardText = (packet) => JSON.stringify(packet, (key, value) => (typeof value === "number" && !Number.isFinite(value) ? { [CLIPBOARD_NUMBER_KEY]: specialNumbersAsText(key, value) } : value));

/** A clipboard packet from its text, its Inf, -Inf and NaN restored. */
export function clipboardPacket(text) {
  return JSON.parse(text, (key, value) => {
    const isTagged = value && typeof value === "object" && Object.keys(value).length === 1 && CLIPBOARD_NUMBER_KEY in value;
    return isTagged ? NUMBER_OF_TEXT.get(value[CLIPBOARD_NUMBER_KEY]) : value;
  });
}
