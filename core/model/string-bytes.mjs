// A LabVIEW string is bytes; a Solder string value is JavaScript text (DT-042 §6). This codec joins the two with
// nothing lost (DT-110): valid UTF-8 is the text it spells, and each byte that is not part of valid UTF-8 travels as
// one lone surrogate, U+DC80 plus the byte, as Python's "surrogateescape" does. So an instrument's binary answer, or a
// \FF typed in '\' Codes Display, survives the panel, the .ovi (JSON writes it as "\udcff") and the runtime.

/** The first of the 128 surrogates that carry a byte from 0x80 to 0xFF (a byte below 0x80 is always valid UTF-8). */
const ESCAPE_BASE = 0xdc00;
const ESCAPE_FIRST = 0xdc80;
const ESCAPE_LAST = 0xdcff;

/** U+FFFD in UTF-8: what a lone surrogate that carries no byte becomes, as TextEncoder makes it. */
const REPLACEMENT_BYTES = [0xef, 0xbf, 0xbd];

const isHighSurrogate = (unit) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit) => unit >= 0xdc00 && unit <= 0xdfff;
const isEscapedByte = (unit) => unit >= ESCAPE_FIRST && unit <= ESCAPE_LAST;

/** Appends the UTF-8 bytes of one code point. */
function pushCodePoint(bytes, codePoint) {
  if (codePoint < 0x80) bytes.push(codePoint);
  else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
  else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
  else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
}

/** The bytes of a Solder string: its text in UTF-8, each escaped byte as itself. */
export function textToBytes(text) {
  const source = String(text ?? "");
  const bytes = [];
  for (let index = 0; index < source.length; index++) {
    const unit = source.charCodeAt(index);
    const next = source.charCodeAt(index + 1);
    if (isHighSurrogate(unit) && isLowSurrogate(next)) {
      pushCodePoint(bytes, 0x10000 + ((unit - 0xd800) << 10) + (next - 0xdc00));
      index++;
    } else if (isEscapedByte(unit)) bytes.push(unit - ESCAPE_BASE);
    else if (isHighSurrogate(unit) || isLowSurrogate(unit)) bytes.push(...REPLACEMENT_BYTES);
    else pushCodePoint(bytes, unit);
  }
  return Uint8Array.from(bytes);
}

/**
 * How many bytes the valid UTF-8 sequence at `offset` takes, and its code point; null when the bytes there are not
 * valid UTF-8 (a stray continuation byte, a cut sequence, an overlong form, an encoded surrogate, beyond U+10FFFF).
 */
function readSequence(bytes, offset) {
  const lead = bytes[offset];
  if (lead < 0x80) return { length: 1, codePoint: lead };
  const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
  if (!length || offset + length > bytes.length) return null;
  let codePoint = lead & (0xff >> (length + 1));
  for (let k = 1; k < length; k++) {
    const continuation = bytes[offset + k];
    if ((continuation & 0xc0) !== 0x80) return null;
    codePoint = (codePoint << 6) | (continuation & 0x3f);
  }
  const smallest = [0, 0, 0x80, 0x800, 0x10000][length];
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  return codePoint < smallest || isSurrogate || codePoint > 0x10ffff ? null : { length, codePoint };
}

/** The Solder string of some bytes: valid UTF-8 as its text, every other byte escaped. */
export function bytesToText(bytes) {
  let text = "";
  for (let offset = 0; offset < bytes.length; ) {
    const sequence = readSequence(bytes, offset);
    if (sequence) {
      text += String.fromCodePoint(sequence.codePoint);
      offset += sequence.length;
    } else {
      text += String.fromCharCode(ESCAPE_BASE + bytes[offset]);
      offset++;
    }
  }
  return text;
}
