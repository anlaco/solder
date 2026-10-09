// Format Into String and Scan From String (and Format Value / Scan Value), as
// LabVIEW 2026 Q3 does them. Every rule here was measured by running the
// functions in LabVIEW (labview-captures/format-scan/, spec/04 Rule 21j);
// what could not be measured says "unverified".
//
// Pure functions over JavaScript values: the runtime reads the arguments from
// the compiled VI's memory and writes the results back (DT-042 b).
//
// An argument or an output is `{ kind, value, bits, signed }`: `kind` is
// "float", "int", "bool" or "string"; `bits` and `signed` describe an integer.

import { aEntero64, cientifica, fraccionaria, noFinito } from "./number-text.mjs";

/** LabVIEW's error codes for format strings (Help ▸ Explain Error). */
export const FORMAT_ERRORS = {
  typeMismatch: 81, // "Format specifier type mismatch."
  unknownSpecifier: 82, // "Unknown format specifier."
  tooFewSpecifiers: 83, // "Too few format specifiers."
  tooManySpecifiers: 84, // "Too many format specifiers."
  scanFailed: 85, // "Scan failed. The input string does not contain data in the expected format."
};

const DEFAULT_PRECISION = 6;
const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);
// %g is fixed notation from 1e-4 up to (not including) 1e7, and scientific outside (measured).
const G_FIXED_FROM = 1e-4;
const G_FIXED_BELOW = 1e7;
const SI_PREFIXES = { "-24": "y", "-21": "z", "-18": "a", "-15": "f", "-12": "p", "-9": "n", "-6": "u", "-3": "m", 0: "", 3: "k", 6: "M", 9: "G", 12: "T", 15: "P", 18: "E", 21: "Z", 24: "Y" };
const WHITESPACE = /[ \t\r\n]/;

// ——— Parsing the format string ———

/**
 * The pieces of a format string: literal text and specifiers. A specifier is
 * `{ conversion, flags, width, precision, position, set }`; `%;` with a
 * character before it (`%.;`, `%,;`) changes the decimal separator.
 */
export function parseFormat(format) {
  const pieces = [];
  let literal = "";
  let i = 0;
  const flushLiteral = () => {
    if (literal) pieces.push({ literal });
    literal = "";
  };
  while (i < format.length) {
    if (format[i] !== "%") {
      literal += format[i++];
      continue;
    }
    const separator = /^%([.,]?);/.exec(format.slice(i));
    if (separator) {
      flushLiteral();
      pieces.push({ decimalSeparator: separator[1] || "." });
      i += separator[0].length;
      continue;
    }
    const match = /^%(?:(\d+)\$)?([-+0# ]*)(\d+)?(?:\.(\d+))?(\[\^?\]?[^\]]*\]|.)?/.exec(format.slice(i));
    i += match[0].length;
    const conversion = match[5] ?? "";
    if (conversion === "%") {
      literal += "%";
      continue;
    }
    flushLiteral();
    pieces.push({
      conversion: conversion.startsWith("[") ? "[" : conversion,
      set: conversion.startsWith("[") ? conversion.slice(1, -1) : null,
      flags: match[2],
      width: match[3] === undefined ? null : Number(match[3]),
      precision: match[4] === undefined ? null : Number(match[4]),
      position: match[1] === undefined ? null : Number(match[1]),
    });
  }
  flushLiteral();
  return pieces;
}

const NUMERIC_CONVERSIONS = new Set(["d", "u", "x", "X", "o", "b", "f", "F", "e", "E", "g", "G", "p"]);
const STRING_CONVERSIONS = new Set(["s", "S", "["]);
const TIME_CONVERSIONS = new Set(["t", "T"]);

const isValueSpecifier = (piece) => piece.conversion !== undefined;

/**
 * Which argument each specifier takes (positional `%2$d` or in order), and the
 * count error LabVIEW gives when the specifiers and the rows do not match:
 * fewer specifiers than rows is error 83, more is error 84. The rows count
 * whether they are wired or not (measured on Scan From String).
 */
function assignArguments(pieces, rowCount) {
  const specifiers = pieces.filter(isValueSpecifier);
  let next = 0;
  const indices = specifiers.map((piece) => (piece.position !== null ? piece.position - 1 : next++));
  const used = new Set(indices);
  if (indices.some((index) => index >= rowCount)) return { error: FORMAT_ERRORS.tooManySpecifiers };
  if (used.size < rowCount) return { error: FORMAT_ERRORS.tooFewSpecifiers };
  return { indices };
}

// ——— Format Into String ———

/**
 * Format Into String: `initial` followed by `format` applied to `args`. With
 * an empty format, each argument in its default format, joined by one space.
 * Returns `{ text }` or, on error, `{ error, arg }` (arg is 1-based, or null
 * when the error is about the count) and the text is empty (measured: even
 * `initial` is dropped). `separator` is the system decimal separator.
 */
export function formatIntoString(format, initial, args, separator = ".") {
  const pieces = format === "" ? defaultPieces(args) : parseFormat(format);
  const assigned = assignArguments(pieces, args.length);
  if (assigned.error) return { error: assigned.error, arg: null, text: "" };
  let text = initial;
  let decimal = separator;
  let specifierIndex = 0;
  for (const piece of pieces) {
    if (piece.literal !== undefined) text += piece.literal;
    else if (piece.decimalSeparator !== undefined) decimal = piece.decimalSeparator;
    else {
      const argIndex = assigned.indices[specifierIndex++];
      const formatted = formatOne(piece, args[argIndex], decimal);
      if (formatted.error) return { error: formatted.error, arg: argIndex + 1, text: "" };
      text += formatted.text;
    }
  }
  return { text };
}

/** The format used for an empty format string: %f, %d or %s by type, joined by one space (measured). */
function defaultPieces(values) {
  const pieces = [];
  values.forEach((value, i) => {
    if (i > 0) pieces.push({ literal: " " });
    const conversion = value.kind === "float" ? "f" : value.kind === "int" ? "d" : "s";
    pieces.push({ conversion, set: null, flags: "", width: null, precision: null, position: null, isDefault: true });
  });
  return pieces;
}

function formatOne(piece, arg, decimal) {
  const { conversion } = piece;
  if (TIME_CONVERSIONS.has(conversion)) throw new Error("Format Into String: the time formats %t and %T are not done yet.");
  if (STRING_CONVERSIONS.has(conversion) && conversion !== "[") {
    if (arg.kind === "bool") return { text: pad(arg.value ? "TRUE" : "FALSE", piece, false) };
    if (arg.kind !== "string") return { error: FORMAT_ERRORS.typeMismatch };
    const truncated = piece.precision === null ? arg.value : arg.value.slice(0, piece.precision);
    return { text: pad(truncated, piece, false) };
  }
  if (!NUMERIC_CONVERSIONS.has(conversion)) return { error: FORMAT_ERRORS.unknownSpecifier };
  if (arg.kind === "string") return { error: FORMAT_ERRORS.typeMismatch };
  if ("duxXob".includes(conversion)) return { text: pad(formatInteger(arg, conversion, piece.flags), piece, true) };
  return { text: pad(formatReal(arg, conversion, piece, decimal), piece, true) };
}

/** An argument as a 64-bit integer: a real rounds to nearest, ties to even, and saturates (NaN gives the maximum, measured). */
function integerValue(arg) {
  if (arg.kind === "bool") return arg.value ? 1n : 0n;
  if (arg.kind === "int") return BigInt(arg.value);
  if (Number.isNaN(arg.value)) return I64_MAX;
  if (arg.value === Infinity) return I64_MAX;
  if (arg.value === -Infinity) return I64_MIN;
  return aEntero64(arg.value);
}

/** The width in bits of an argument for hexadecimal, octal and binary: its own; a real goes through I64 (measured). */
const integerBits = (arg) => (arg.kind === "int" ? arg.bits : arg.kind === "bool" ? 8 : 64);

function formatInteger(arg, conversion, flags) {
  const value = integerValue(arg);
  if (conversion === "d" || conversion === "u") {
    const shown = arg.kind === "int" && !arg.signed ? BigInt.asUintN(arg.bits, value) : value;
    return withSign(shown.toString(), flags);
  }
  const unsigned = BigInt.asUintN(integerBits(arg), value);
  const radix = { x: 16, X: 16, o: 8, b: 2 }[conversion];
  return unsigned.toString(radix).toUpperCase();
}

const withSign = (digits, flags) => (flags.includes("+") && !digits.startsWith("-") ? `+${digits}` : digits);

function formatReal(arg, conversion, piece, decimal) {
  const precision = piece.precision ?? DEFAULT_PRECISION;
  // An integer is exact in %f: U64 max gives 18446744073709551615.000000 (measured).
  if (arg.kind !== "float" && "fF".includes(conversion)) {
    const integer = arg.kind === "int" && !arg.signed ? BigInt.asUintN(arg.bits, integerValue(arg)) : integerValue(arg);
    return withSign(integer.toString() + (precision > 0 ? decimal + "0".repeat(precision) : ""), piece.flags);
  }
  const x = arg.kind === "float" ? arg.value : Number(integerValue(arg));
  if (!Number.isFinite(x)) return noFinito(x);
  const text = realText(x, conversion.toLowerCase(), precision);
  return withSign(text.replace(".", decimal), piece.flags);
}

function realText(x, conversion, precision) {
  if (conversion === "f") return fraccionaria(x, precision);
  if (conversion === "e") return cientifica(x, precision, false);
  if (conversion === "g") {
    const magnitude = Math.abs(x);
    const fixed = magnitude === 0 || (magnitude >= G_FIXED_FROM && magnitude < G_FIXED_BELOW);
    return fixed ? fraccionaria(x, precision) : cientifica(x, precision, false);
  }
  return siText(x, precision);
}

/** %p: engineering notation with an SI prefix instead of the exponent (12345.6 gives 12.345600k). */
function siText(x, precision) {
  if (x === 0) return fraccionaria(x, precision);
  const engineering = cientifica(x, precision, true);
  const [mantissa, exponent] = engineering.split("E");
  const prefix = SI_PREFIXES[Number(exponent)];
  return prefix === undefined ? engineering : mantissa + prefix;
}

/** Pads to the minimum width: spaces on the left, on the right with "-", or zeros after the sign with "0" for numbers. */
function pad(text, piece, numeric) {
  const width = piece.width ?? 0;
  if (text.length >= width) return text;
  if (piece.flags.includes("-")) return text.padEnd(width, " ");
  if (numeric && piece.flags.includes("0") && /^[+-]?[0-9A-F]/.test(text)) {
    const sign = /^[+-]/.test(text) ? text[0] : "";
    return sign + text.slice(sign.length).padStart(width - sign.length, "0");
  }
  return text.padStart(width, " ");
}

// ——— Scan From String ———

/**
 * Scan From String: reads `outputs.length` values from `input`, starting at
 * `start` (clamped to the length), with `format` (empty: each output's default
 * format, separated by whitespace). `outputs` gives each output's kind and
 * default value. Returns `{ values, remaining, offset, error, arg }`, `offset`
 * counted from the beginning of `input`. A conversion that fails gives error
 * 85: the outputs before it keep what was read and the rest their defaults,
 * and the remaining string starts where it failed. A count or type error is
 * found before scanning: every output gets its default and nothing is read.
 */
export function scanFromString(input, format, start, outputs, separator = ".") {
  const begin = Math.min(Math.max(0, start), input.length);
  const defaults = outputs.map((output) => output.value);
  const pieces = format === "" ? defaultPieces(outputs) : parseFormat(format);
  const notScanned = (error, arg) => ({ values: defaults, remaining: input, offset: 0, error, arg });
  const assigned = assignArguments(pieces, outputs.length);
  if (assigned.error) return notScanned(assigned.error, null);
  const specifiers = pieces.filter(isValueSpecifier);
  for (const [i, piece] of specifiers.entries()) {
    const output = outputs[assigned.indices[i]];
    if (TIME_CONVERSIONS.has(piece.conversion)) throw new Error("Scan From String: the time formats %t and %T are not done yet.");
    if (!NUMERIC_CONVERSIONS.has(piece.conversion) && !STRING_CONVERSIONS.has(piece.conversion)) return notScanned(FORMAT_ERRORS.unknownSpecifier, assigned.indices[i] + 1);
    if (STRING_CONVERSIONS.has(piece.conversion) !== (output.kind === "string")) return notScanned(FORMAT_ERRORS.typeMismatch, assigned.indices[i] + 1);
  }
  const values = [...defaults];
  let position = begin;
  let decimal = separator;
  let specifierIndex = 0;
  for (const piece of pieces) {
    if (piece.decimalSeparator !== undefined) {
      decimal = piece.decimalSeparator;
      continue;
    }
    if (piece.literal !== undefined) {
      const matched = matchLiteral(input, position, piece.literal);
      if (matched === null) return { values, remaining: input.slice(position), offset: position, error: FORMAT_ERRORS.scanFailed, arg: assigned.indices[specifierIndex] + 1 };
      position = matched;
      continue;
    }
    const argIndex = assigned.indices[specifierIndex++];
    const startOfField = piece.conversion === "[" ? position : skipWhitespace(input, position);
    const read = readField(input, startOfField, piece, decimal);
    if (read === null) return { values, remaining: input.slice(startOfField), offset: startOfField, error: FORMAT_ERRORS.scanFailed, arg: argIndex + 1 };
    values[argIndex] = toOutput(read.value, outputs[argIndex]);
    position = read.end;
  }
  return { values, remaining: input.slice(position), offset: position, error: null, arg: null };
}

/** Literal text of the format: whitespace matches any run of whitespace (also none); anything else, itself. */
function matchLiteral(input, position, literal) {
  let at = position;
  for (const character of literal) {
    if (WHITESPACE.test(character)) {
      at = skipWhitespace(input, at);
      continue;
    }
    if (input[at] !== character) return null;
    at++;
  }
  return at;
}

function skipWhitespace(input, position) {
  let at = position;
  while (at < input.length && WHITESPACE.test(input[at])) at++;
  return at;
}

/** Reads one field at `start`: `{ value, end }`, or null when nothing matches. A width limits how many characters are read. */
function readField(input, start, piece, decimal) {
  const field = piece.width === null ? input.slice(start) : input.slice(start, start + piece.width);
  const match = fieldPattern(piece, decimal).exec(field);
  if (!match || match[0] === "") return null;
  return { value: fieldValue(match[0], piece, decimal), end: start + match[0].length };
}

function fieldPattern(piece, decimal) {
  const d = decimal === "." ? "\\." : decimal;
  switch (piece.conversion) {
    case "d":
    case "u":
      return /^[+-]?\d+/;
    case "x":
    case "X":
      return /^[0-9A-Fa-f]+/;
    case "o":
      return /^[0-7]+/;
    case "b":
      return /^[01]+/;
    case "p":
      return new RegExp(`^(?:[+-]?(?:\\d+${d}?\\d*|${d}\\d+)(?:[eE][+-]?\\d+)?[yzafpnumkMGTPEZY]?|[+-]?inf|nan)`, "i");
    case "s":
    case "S":
      return /^[^ \t\r\n]+/;
    case "[":
      return new RegExp(`^[${piece.set.replace(/\\/g, "\\\\")}]+`);
    default:
      return new RegExp(`^(?:[+-]?(?:\\d+${d}?\\d*|${d}\\d+)(?:[eE][+-]?\\d+)?|[+-]?inf|nan)`, "i");
  }
}

const SI_FACTORS = Object.fromEntries(Object.entries(SI_PREFIXES).filter(([, letter]) => letter).map(([exponent, letter]) => [letter, 10 ** Number(exponent)]));

function fieldValue(text, piece, decimal) {
  switch (piece.conversion) {
    case "d":
    case "u":
      return Number(text);
    case "x":
    case "X":
      return parseInt(text, 16);
    case "o":
      return parseInt(text, 8);
    case "b":
      return parseInt(text, 2);
    case "s":
    case "S":
    case "[":
      return text;
    case "p": {
      const prefix = SI_FACTORS[text.at(-1)];
      return prefix ? realValue(text.slice(0, -1), decimal) * prefix : realValue(text, decimal);
    }
    default:
      return realValue(text, decimal);
  }
}

function realValue(text, decimal) {
  if (/^[+-]?inf$/i.test(text)) return text.startsWith("-") ? -Infinity : Infinity;
  if (/^nan$/i.test(text)) return NaN;
  return Number(decimal === "." ? text : text.replace(decimal, "."));
}

/** A value read into an output of its kind: an integer rounds to nearest, ties to even, and saturates (NaN gives the maximum, measured). */
function toOutput(value, output) {
  if (output.kind === "string") return value;
  if (output.kind === "float") return value;
  if (output.kind === "bool") return value !== 0;
  const min = output.signed ? -(2n ** BigInt(output.bits - 1)) : 0n;
  const max = output.signed ? 2n ** BigInt(output.bits - 1) - 1n : 2n ** BigInt(output.bits) - 1n;
  if (Number.isNaN(value)) return max;
  if (!Number.isFinite(value)) return value > 0 ? max : min;
  const rounded = aEntero64(value);
  return rounded > max ? max : rounded < min ? min : rounded;
}

// ——— Format Value and Scan Value ———

/**
 * Format Value: `prefix` followed by `format` applied to one number. It has no
 * error terminals: a specifier after the first is left as text, and %s formats
 * the number with %f (measured: "%d %d" of 7 gives "7 %d", "%s" of 7 gives "7.000000").
 */
export function formatValue(prefix, format, value, separator = ".") {
  const arg = { kind: "float", value };
  if (format === "") return prefix + formatIntoString("%f", "", [arg], separator).text;
  let text = prefix;
  let decimal = separator;
  let used = false;
  for (const piece of parseFormat(format)) {
    if (piece.literal !== undefined) text += piece.literal;
    else if (piece.decimalSeparator !== undefined) decimal = piece.decimalSeparator;
    else if (used) text += sourceOf(piece);
    else {
      used = true;
      const asReal = STRING_CONVERSIONS.has(piece.conversion) ? { ...piece, conversion: "f" } : piece;
      const formatted = formatOne(asReal, arg, decimal);
      text += formatted.error ? sourceOf(piece) : formatted.text;
    }
  }
  return text;
}

/** The text of a specifier as it was written, to leave it untouched. */
const sourceOf = (piece) =>
  `%${piece.position !== null ? `${piece.position}$` : ""}${piece.flags}${piece.width ?? ""}${piece.precision !== null ? `.${piece.precision}` : ""}${piece.conversion === "[" ? `[${piece.set}]` : piece.conversion}`;

/** Scan Value: one number from the beginning of `input`; on failure, the default and the whole input (it has no error terminals). */
export function scanValue(input, format, defaultValue, separator = ".") {
  const scanned = scanFromString(input, format, 0, [{ kind: "float", value: defaultValue }], separator);
  if (scanned.error) return { value: defaultValue, remaining: input };
  return { value: scanned.values[0], remaining: scanned.remaining };
}
