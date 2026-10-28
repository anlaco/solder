// Array To Spreadsheet String and Spreadsheet String To Array, as LabVIEW 2026 Q3 does them (DT-067 §9). Every rule
// here was measured by running them in LabVIEW (labview-captures/reports/2026-10-28-spreadsheet-strings.md, "the
// report" below); what was not measured says so. Write and Read Delimited Spreadsheet are these plus a file.
//
// Pure functions over JavaScript values. An array is `{ sizes, elements }`: its size in each dimension (one or two)
// and its elements in row order. An element is a JavaScript number for a real, a BigInt for an integer and a
// string for a string; `element` describes its type as `{ kind, bits, signed }`, `kind` being "float", "int" or
// "string", as format-string.mjs takes its arguments.

import { formatPiece, parseFormat } from "./format-string.mjs";
import { aEntero64 } from "./number-text.mjs";

/** The delimiter when it is unwired or empty: a tab (measured on both functions). */
export const DEFAULT_DELIMITER = "\t";
/** The end of line written after every row, the last too: the system's (CRLF measured on Windows; LF elsewhere is unverified). */
export const endOfLineFor = (pathRules) => (pathRules === "windows" ? "\r\n" : "\n");

const delimiterOf = (delimiter) => (delimiter === "" ? DEFAULT_DELIMITER : delimiter);
const isString = (element) => element.kind === "string";

// ——— Array To Spreadsheet String ———

/**
 * The spreadsheet string of `array`: each row's elements joined by the delimiter, each row ending with `endOfLine`.
 * A one-dimensional array is one row; an empty array gives "" (the report §2).
 */
export function arrayToSpreadsheetString({ format, array, element, delimiter, endOfLine }) {
  const { sizes, elements } = array;
  const columns = sizes.at(-1);
  if (elements.length === 0 || columns === 0) return "";
  const pieces = parseFormat(format);
  const separator = delimiterOf(delimiter);
  let text = "";
  for (let start = 0; start < elements.length; start += columns) {
    const row = elements.slice(start, start + columns).map((value) => formatElement(pieces, value, element));
    text += row.join(separator) + endOfLine;
  }
  return text;
}

/** What one element becomes: the format applied with its literals, element by element (the report §2, §3). */
function formatElement(pieces, value, element) {
  if (pieces.length === 0) return isString(element) ? value : formatNumber(DEFAULT_REAL, value, element);
  let text = "";
  for (const piece of pieces) {
    if (piece.literal !== undefined) text += piece.literal;
    else if (piece.conversion !== undefined) text += isString(element) ? formatText(piece, value) : formatNumber(piece, value, element);
    // A decimal separator code (`%;`, `%.;`) writes nothing: the value is lost and only the literals remain (measured).
  }
  return text;
}

/** %f with six decimals: what an empty format, %s and a conversion LabVIEW does not know write for a number (measured). */
const DEFAULT_REAL = { conversion: "f", flags: "", width: null, precision: null, position: null, set: null };

function formatNumber(piece, value, element) {
  const known = formatPiece(piece, { ...element, value });
  if (!known.error) return known.text;
  // %s, and a conversion such as the "," of `%,3f` or `%.3,f`, are %f with the piece's own width and precision.
  return formatPiece({ ...piece, conversion: DEFAULT_REAL.conversion }, { ...element, value }).text;
}

/** A string element is written as it is: a numeric conversion is ignored, %s pads and truncates (measured, no quoting). */
function formatText(piece, value) {
  const asText = formatPiece(piece, { kind: "string", value });
  return asText.error ? value : asText.text;
}

// ——— Spreadsheet String To Array ———

const END_OF_LINE = /\r\n|\r|\n/;
const TRAILING_END_OF_LINE = /(\r\n|\r|\n)$/;

/**
 * The array of a spreadsheet string, of `dimensions` (1 or 2) and `element` type. Rows end at CR, LF or CRLF and
 * are padded to the widest with zeros or empty strings; a one-dimensional array splits only at the delimiter, so an
 * end of line is part of a field (the report §4).
 */
export function spreadsheetStringToArray({ format, text, element, delimiter, dimensions }) {
  if (text === "") return { sizes: Array(dimensions).fill(0), elements: [] };
  const body = text.replace(TRAILING_END_OF_LINE, "");
  if (dimensions === 1) {
    const read = fieldReader(format, element);
    const elements = body.split(delimiterOf(delimiter)).map(read);
    return { sizes: [elements.length], elements };
  }
  return rowsToArray({ rows: body.split(END_OF_LINE), format, element, delimiter });
}

/** A 2D array from the text of its rows: each split at the delimiter, read, and padded to the widest row. */
export function rowsToArray({ rows, format, element, delimiter }) {
  const read = fieldReader(format, element);
  const separator = delimiterOf(delimiter);
  const fields = rows.map((line) => line.split(separator).map(read));
  const columns = fields.length ? Math.max(...fields.map((row) => row.length)) : 0;
  const empty = read("");
  const elements = fields.flatMap((row) => [...row, ...Array(columns - row.length).fill(empty)]);
  return { sizes: [fields.length, columns], elements };
}

/** The 2D array with its rows and columns swapped. */
export function transposeArray({ sizes: [rows, columns], elements }) {
  const swapped = [];
  for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) swapped.push(elements[row * columns + column]);
  return { sizes: [columns, rows], elements: swapped };
}

/** The first row of a 2D array, as a 1D array; none when it has no rows. */
export const firstRowOf = ({ sizes: [rows, columns], elements }) => (rows === 0 ? { sizes: [0], elements: [] } : { sizes: [columns], elements: elements.slice(0, columns) });

const END_OF_LINE_AT = /^(\r\n|\r|\n)/;

/**
 * The rows Read Delimited Spreadsheet reads from `text` (labview-captures/reports/2026-10-28-delimited-spreadsheet.md
 * Q4): from `offset`, all of them when `rows` is negative (`maxCharacters` is then ignored); otherwise `rows` steps,
 * each reading a whole line, or with `maxCharacters` up to that many characters. A step stopped by an end of line
 * consumes it and ends the row; one stopped by the limit leaves the row open for the next step. A step with nothing
 * left to read, or a line the file ends without an end of line, is the end of the file. Gives the rows' text, the
 * mark after the read and whether the end of the file was reached.
 */
export function readDelimitedRows({ text, rows, offset, maxCharacters }) {
  let position = Math.min(Math.max(offset, 0), text.length);
  if (rows < 0) {
    const rest = text.slice(position);
    return { rows: rest === "" ? [] : rest.replace(TRAILING_END_OF_LINE, "").split(END_OF_LINE), mark: text.length, endOfFile: false };
  }
  const read = [];
  let open = null;
  let endOfFile = false;
  for (let step = 0; step < rows; step++) {
    if (position >= text.length) {
      endOfFile = true;
      break;
    }
    const lineEnd = text.slice(position).search(END_OF_LINE);
    const untilEnd = lineEnd < 0 ? text.length - position : lineEnd;
    const length = maxCharacters > 0 ? Math.min(maxCharacters, untilEnd) : untilEnd;
    open = (open ?? "") + text.slice(position, position + length);
    position += length;
    // A step that fills the limit leaves even an end of line right after it for the next step (measured: rows 1 with
    // max 5 on `1,2.5\r\n` marks 5, rows 2 marks 7).
    const stoppedByLimit = maxCharacters > 0 && length === maxCharacters;
    if (stoppedByLimit) continue;
    const ending = END_OF_LINE_AT.exec(text.slice(position));
    if (ending) position += ending[0].length;
    else endOfFile = true;
    read.push(open);
    open = null;
    if (endOfFile) break;
  }
  if (open !== null) read.push(open);
  return { rows: read, mark: position, endOfFile };
}

/** How a field is read: a string as it is; a number by the first conversion of the format (the report §4). */
function fieldReader(format, element) {
  if (isString(element)) return (field) => field;
  const pieces = parseFormat(format);
  const specifier = pieces.find((piece) => piece.conversion !== undefined || piece.decimalSeparator !== undefined);
  // A decimal separator code or a conversion LabVIEW does not know makes the scan fail: every field is 0 (measured).
  const fails = specifier !== undefined && (specifier.decimalSeparator !== undefined || !KNOWN_READS.has(specifier.conversion));
  const reader = fails ? () => null : INTEGER_READS[specifier?.conversion] ?? readReal;
  return (field) => toElement(reader(field), element);
}

const KNOWN_READS = new Set(["d", "u", "x", "X", "o", "b", "f", "F", "e", "E", "g", "G", "s", "S"]);

const LEADING_BLANKS = /^[ \t\r\n]*/;
const REAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const INFINITY = /^([+-]?)inf/i;
const NOT_A_NUMBER = /^nan/i;

/** A real at the start of the field, after blanks; what is not one reads as null (0). Measured: `-nan` is 0. */
function readReal(field) {
  const rest = field.replace(LEADING_BLANKS, "");
  const real = REAL.exec(rest);
  if (real) return Number(real[0]);
  const infinity = INFINITY.exec(rest);
  if (infinity) return infinity[1] === "-" ? -Infinity : Infinity;
  return NOT_A_NUMBER.test(rest) ? NaN : null;
}

/** An integer at the start of the field in `radix`, as a BigInt; a negative one wraps to 64 bits unsigned except in decimal (measured with %x). */
function integerReader(pattern, radix) {
  return (field) => {
    const match = pattern.exec(field.replace(LEADING_BLANKS, ""));
    if (!match) return null;
    const magnitude = [...match[2]].reduce((value, digit) => value * BigInt(radix) + BigInt(parseInt(digit, radix)), 0n);
    if (match[1] !== "-") return magnitude;
    return radix === 10 ? -magnitude : BigInt.asUintN(64, -magnitude);
  };
}

/** %d reads an integer prefix (`2.5` is 2, `1e3` is 1); %x hexadecimal. %o and %b are read the same way: unverified. */
const INTEGER_READS = {
  d: integerReader(/^([+-]?)(\d+)/, 10),
  u: integerReader(/^([+-]?)(\d+)/, 10),
  x: integerReader(/^([+-]?)([0-9A-Fa-f]+)/, 16),
  X: integerReader(/^([+-]?)([0-9A-Fa-f]+)/, 16),
  o: integerReader(/^([+-]?)([0-7]+)/, 8),
  b: integerReader(/^([+-]?)([01]+)/, 2),
};

/**
 * A value read into the array's element type: a real stays a number; into an integer, a real rounds to nearest,
 * ties to even, and both saturate to the type (I32 3000000000 is 2147483647, U8 -5 is 0, measured).
 */
function toElement(value, element) {
  if (element.kind === "float") return value === null ? 0 : Number(value);
  if (value === null) return 0n;
  const integer = typeof value === "bigint" ? value : realToInteger(value);
  const [lowest, highest] = element.signed ? [-(2n ** BigInt(element.bits - 1)), 2n ** BigInt(element.bits - 1) - 1n] : [0n, 2n ** BigInt(element.bits) - 1n];
  return integer < lowest ? lowest : integer > highest ? highest : integer;
}

/** NaN into an integer is unverified; it is read as 0. Infinities saturate. */
function realToInteger(real) {
  if (Number.isNaN(real)) return 0n;
  if (!Number.isFinite(real)) return real > 0 ? 2n ** 64n : -(2n ** 64n);
  return aEntero64(real);
}
