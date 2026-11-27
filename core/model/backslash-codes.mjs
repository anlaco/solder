// '\' Codes Display of a string (DT-110): how LabVIEW shows a string's bytes as text and reads typed text back into
// bytes. Every rule here is measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-27-string-codes-display.md).
// The display style only changes how the value is shown; switching it never changes the value (§4 of that report).

import { bytesToText, textToBytes } from "./string-bytes.mjs";

const BACKSLASH = 0x5c;

/** The bytes shown as a backslash and a lowercase letter (§1); `\\` is the backslash itself. */
const LETTER_OF_BYTE = new Map([[0x08, "b"], [0x09, "t"], [0x0a, "n"], [0x0c, "f"], [0x0d, "r"], [0x20, "s"], [BACKSLASH, "\\"]]);
const BYTE_OF_LETTER = new Map([...LETTER_OF_BYTE].map(([byte, letter]) => [letter, byte]));

/** The bytes shown as themselves: the printable ASCII from `!` to `~` (§1); the space is `\s` and 0x7F is `\7F`. */
const FIRST_PRINTABLE = 0x21;
const LAST_PRINTABLE = 0x7e;

/** At most two hex digits are read after a backslash (§3: `\100` is 0x10 and then "0"). */
const MOST_HEX_DIGITS = 2;
/** Only uppercase digits are hex (§3: `\0d` is 0x00 and then "d"; `\B` is 0x0B but `\b` is backspace). */
const isHexDigit = (character) => /^[0-9A-F]$/.test(character);

/** How one byte shows: a letter code, itself, or `\XX` with two uppercase hex digits (§1). */
function byteCode(byte) {
  if (LETTER_OF_BYTE.has(byte)) return `\\${LETTER_OF_BYTE.get(byte)}`;
  if (byte >= FIRST_PRINTABLE && byte <= LAST_PRINTABLE) return String.fromCharCode(byte);
  return `\\${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** The text '\' Codes Display shows for a string's bytes. A newline is `\n` on the same line (§6). */
export const bytesToCodes = (bytes) => Array.from(bytes, byteCode).join("");

/**
 * The bytes of text typed in '\' Codes Display (§3). After a backslash: up to two uppercase hex digits are a byte; a
 * lowercase letter code or a second backslash is its byte; any other character is kept and the backslash dropped
 * (`\e` is "e", `\x41` is "x41"); a backslash at the very end is kept. Text that is not a code is its UTF-8 bytes.
 */
export function codesToBytes(text) {
  const characters = Array.from(String(text ?? ""));
  const bytes = [];
  for (let index = 0; index < characters.length; index++) {
    if (characters[index] !== "\\") {
      bytes.push(...textToBytes(characters[index]));
      continue;
    }
    const digits = hexDigitsAt(characters, index + 1);
    const next = characters[index + 1];
    if (digits) bytes.push(parseInt(digits, 16));
    else if (next === undefined) bytes.push(BACKSLASH);
    else if (BYTE_OF_LETTER.has(next)) bytes.push(BYTE_OF_LETTER.get(next));
    else bytes.push(...textToBytes(next));
    index += digits ? digits.length : next === undefined ? 0 : 1;
  }
  return Uint8Array.from(bytes);
}

/** The uppercase hex digits, one or two, that start at `start`; "" when there is none. */
function hexDigitsAt(characters, start) {
  let digits = "";
  while (digits.length < MOST_HEX_DIGITS && isHexDigit(characters[start + digits.length] ?? "")) digits += characters[start + digits.length];
  return digits;
}

/** The text a string value shows in '\' Codes Display. */
export const valueToCodes = (value) => bytesToCodes(textToBytes(value));

/** The string value of text typed in '\' Codes Display. */
export const codesToValue = (text) => bytesToText(codesToBytes(text));

/** The display styles LabVIEW offers a string (§4); only Normal and '\' Codes are built (DT-110). */
export const DISPLAY = { normal: "normal", codes: "codes" };

/** The display style kept in an object's config: absent means Normal Display, LabVIEW's default. */
export const displayOf = (config) => (config?.display === DISPLAY.codes ? DISPLAY.codes : DISPLAY.normal);

/** The text a string object shows for its value, in its display style. */
export const shownText = (value, config) => (displayOf(config) === DISPLAY.codes ? valueToCodes(value) : String(value ?? ""));

/** The value of the text typed into a string object, in its display style. */
export const typedValue = (text, config) => (displayOf(config) === DISPLAY.codes ? codesToValue(text) : text);
