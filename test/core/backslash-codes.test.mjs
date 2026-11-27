// '\' Codes Display and the lossless string codec (DT-110). The tables are LabVIEW 2026 Q3's, measured in
// labview-captures/reports/2026-11-27-string-codes-display.md (local evidence, never committed).

import assert from "node:assert/strict";
import { test } from "node:test";

import { bytesToCodes, codesToBytes, codesToValue, shownText, typedValue, valueToCodes } from "../../core/model/backslash-codes.mjs";
import { bytesToText, textToBytes } from "../../core/model/string-bytes.mjs";

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const bytesOf = (hexText) => Uint8Array.from(hexText.split(" ").filter(Boolean), (pair) => parseInt(pair, 16));

test("each byte shows as LabVIEW shows it in '\\' Codes Display (§1)", () => {
  const shown = (byte) => bytesToCodes([byte]);
  const letters = { 0x08: "\\b", 0x09: "\\t", 0x0a: "\\n", 0x0c: "\\f", 0x0d: "\\r", 0x20: "\\s", 0x5c: "\\\\" };
  for (let byte = 0; byte <= 0xff; byte++) {
    const expected = letters[byte] ?? (byte >= 0x21 && byte <= 0x7e ? String.fromCharCode(byte) : `\\${byte.toString(16).toUpperCase().padStart(2, "0")}`);
    assert.equal(shown(byte), expected, `byte ${byte.toString(16)}`);
  }
  assert.equal(shown(0x0b), "\\0B");
  assert.equal(shown(0x7f), "\\7F");
  assert.equal(shown(0xe9), "\\E9");
  assert.equal(shown(0x7c), "|");
});

test("a space is always \\s, and a newline stays on its line (§2, §6)", () => {
  assert.equal(valueToCodes(" a"), "\\sa");
  assert.equal(valueToCodes("a "), "a\\s");
  assert.equal(valueToCodes("a  b"), "a\\s\\sb");
  assert.equal(valueToCodes("line1\nline2 x\nlast"), "line1\\nline2\\sx\\nlast");
});

test("typed text is read back into the bytes LabVIEW reads (§3)", () => {
  const cases = {
    "\\n": "0A", "\\r": "0D", "\\t": "09", "\\s": "20", "\\b": "08", "\\f": "0C", "\\\\": "5C",
    "\\0D": "0D", "\\0d": "00 64", "\\41": "41", "\\4": "04", "\\4G": "04 47", "\\G": "47", "\\x41": "78 34 31",
    "\\N": "4E", "\\R": "52", "\\T": "54", "\\S": "53", "\\B": "0B", "\\F": "0F", "\\": "5C", "a\\": "61 5C",
    "\\\\n": "5C 6E", "\\e": "65", "\\a": "61", "\\v": "76", "\\0": "00", "\\00": "00", "\\FF": "FF", "\\ff": "0C 66",
    "\\100": "10 30", "\n": "0A", " ": "20",
    "\\00D": "00 44", "\\0a": "00 61", "\\1": "01", "\\ ": "20", "\\n\\n": "0A 0A", "\\4a": "04 61", "\\Ab": "0A 62",
    "\\aB": "61 42", "\\A": "0A", "\\C": "0C", "\\D": "0D", "\\E": "0E", "\\Ff": "0F 66", "\\fF": "0C 46",
    "\\0G": "00 47", "\\G0": "47 30", "\\u0041": "75 30 30 34 31", "\\\"": "22", "\\'": "27", "\\/": "2F", "\\?": "3F",
    "\\z": "7A", "\\41\\n\\s\\e\\ff\\0d\\": "41 0A 20 65 0C 66 00 64 5C",
  };
  for (const [typed, expected] of Object.entries(cases)) assert.equal(hex(codesToBytes(typed)), expected, JSON.stringify(typed));
});

test("what is typed shows afterwards as LabVIEW shows it (§3, right column)", () => {
  const cases = { "\\0D": "\\r", "\\0d": "\\00d", "\\41": "A", "\\4G": "\\04G", "\\x41": "x41", "\\B": "\\0B", "\\": "\\\\", "\\ff": "\\ff", "\\100": "\\100" };
  for (const [typed, shown] of Object.entries(cases)) assert.equal(bytesToCodes(codesToBytes(typed)), shown, JSON.stringify(typed));
});

test("switching the display never changes the value (§4)", () => {
  assert.equal(valueToCodes("*IDN?\n"), "*IDN?\\n");
  assert.equal(valueToCodes("*IDN?\\n"), "*IDN?\\\\n");
  assert.equal(codesToValue("*IDN?\\n"), "*IDN?\n");
  assert.equal(shownText("*IDN?\n", {}), "*IDN?\n");
  assert.equal(shownText("*IDN?\n", { display: "codes" }), "*IDN?\\n");
  assert.equal(typedValue("\\n", {}), "\\n");
  assert.equal(typedValue("\\n", { display: "codes" }), "\n");
  for (let byte = 0; byte <= 0xff; byte++) assert.equal(hex(codesToBytes(bytesToCodes([byte]))), hex([byte]));
});

test("every byte sequence survives the trip through Solder's text (DT-110)", () => {
  const samples = ["", "41 42", "C3 A9", "FF", "80 81", "C3", "E2 82", "ED A0 80", "C0 AF", "F4 90 80 80", "F0 9F 98 80", "00 0A 0D FF 41"];
  for (const sample of samples) assert.equal(hex(textToBytes(bytesToText(bytesOf(sample)))), sample, sample);
  // Random bytes: the decoder is a bijection onto the texts the encoder takes back.
  let seed = 12345;
  const nextByte = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 0xff;
  for (let trial = 0; trial < 500; trial++) {
    const bytes = Uint8Array.from({ length: trial % 40 }, nextByte);
    assert.equal(hex(textToBytes(bytesToText(bytes))), hex(bytes));
  }
});

test("valid UTF-8 is the text it spells, and a byte that is not shows as \\XX", () => {
  assert.equal(bytesToText(bytesOf("C3 A9")), "é");
  assert.equal(hex(textToBytes("é😀")), hex(new TextEncoder().encode("é😀")));
  assert.equal(valueToCodes(bytesToText(bytesOf("41 FF 0D 0A"))), "A\\FF\\r\\n");
  assert.equal(hex(textToBytes(codesToValue("\\FF"))), "FF");
  // A lone surrogate that carries no byte becomes U+FFFD, as TextEncoder makes it.
  assert.equal(hex(textToBytes("\ud800")), "EF BF BD");
  // JSON keeps an escaped byte, so an .ovi does too.
  assert.equal(hex(textToBytes(JSON.parse(JSON.stringify(bytesToText(bytesOf("FF"))))) ), "FF");
});
