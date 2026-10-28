// Array To Spreadsheet String and Spreadsheet String To Array against the values measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-28-spreadsheet-strings.md, the section of each test).

import assert from "node:assert/strict";
import { test } from "node:test";

import { arrayToSpreadsheetString, readDelimitedRows, spreadsheetStringToArray } from "../../core/runtime/spreadsheet.mjs";

const DBL = { kind: "float" };
const I32 = { kind: "int", bits: 32, signed: true };
const I64 = { kind: "int", bits: 64, signed: true };
const U8 = { kind: "int", bits: 8, signed: false };
const STRING = { kind: "string" };
const CRLF = "\r\n";

/** A 2D array from its rows. */
const rows = (values) => ({ sizes: [values.length, values[0]?.length ?? 0], elements: values.flat() });
const write = (format, values, { element = DBL, delimiter = ",", oneDimension = false } = {}) =>
  arrayToSpreadsheetString({ format, array: oneDimension ? { sizes: [values.length], elements: values } : rows(values), element, delimiter, endOfLine: CRLF });
const read = (format, text, { element = DBL, delimiter = ",", dimensions = 2 } = {}) => {
  const { sizes, elements } = spreadsheetStringToArray({ format, text, element, delimiter, dimensions });
  if (dimensions === 1) return elements;
  return Array.from({ length: sizes[0] }, (_, row) => elements.slice(row * sizes[1], (row + 1) * sizes[1]));
};

const DATA = [[1, 2.5], [3, 4]];

test("§2: a real array with each format, every row ending with the end of line", () => {
  assert.equal(write("%.3f", DATA), "1.000,2.500\r\n3.000,4.000\r\n");
  for (const format of ["", "%s", "%g", "%f"]) assert.equal(write(format, DATA), "1.000000,2.500000\r\n3.000000,4.000000\r\n", format);
  assert.equal(write("%d", DATA), "1,2\r\n3,4\r\n");
  assert.equal(write("%e", DATA), "1.000000E+0,2.500000E+0\r\n3.000000E+0,4.000000E+0\r\n");
  assert.equal(write("%5.1f", DATA), "  1.0,  2.5\r\n  3.0,  4.0\r\n");
  assert.equal(write("%x", [[255, 16]]), "FF,10\r\n");
  assert.equal(write("%5d", [[255, 16]]), "  255,   16\r\n");
});

test("§2: the delimiter is literal, and a tab when unwired or empty", () => {
  assert.equal(write("%.3f", DATA, { delimiter: "" }), "1.000\t2.500\r\n3.000\t4.000\r\n");
  assert.equal(write("%.1f", [[1, 2], [3, 4]], { delimiter: "ab" }), "1.0ab2.0\r\n3.0ab4.0\r\n");
  assert.equal(write("%.1f", [[1, 2], [3, 4]], { delimiter: "\r\n" }), "1.0\r\n2.0\r\n3.0\r\n4.0\r\n");
});

test("§2: one dimension is one row; an empty array is an empty string", () => {
  assert.equal(write("%.3f", [1, 2.5, 3], { oneDimension: true }), "1.000,2.500,3.000\r\n");
  assert.equal(write("%.3f", [5], { oneDimension: true }), "5.000\r\n");
  assert.equal(write("%.3f", [], { oneDimension: true }), "");
  assert.equal(write("%.3f", []), "");
  assert.equal(write("%.3f", [[]]), "");
});

test("§2: special values, rounding half to even and literals", () => {
  const special = [[NaN, -0], [1e10, Infinity], [-Infinity, 1e-5]];
  assert.equal(write("%.3f", special), "NaN,-0.000\r\n10000000000.000,Inf\r\n-Inf,0.000\r\n");
  assert.equal(write("%g", special), "NaN,-0.000000\r\n1.000000E+10,Inf\r\n-Inf,1.000000E-5\r\n");
  assert.equal(write("%d", special), "9223372036854775807,0\r\n10000000000,9223372036854775807\r\n-9223372036854775808,0\r\n");
  assert.equal(write("%d", [[2.5, 3.5], [-2.5, -3.5], [0.5, 1.5]]), "2,4\r\n-2,-4\r\n0,2\r\n");
  assert.equal(write("[%.1f]", [[1.5, 2]]), "[1.5],[2.0]\r\n");
  assert.equal(write("%.2f;", [[1.5, 2]]), "1.50;,2.00;\r\n");
  assert.equal(write("abc", [[1.5, 2]]), "abc,abc\r\n");
});

test("§5: the decimal is always the point, and `%,` and `%;` are not decimal codes", () => {
  const delimiter = ";";
  assert.equal(write("%,3f", [[1, 2.5]], { delimiter }), "1.0000003f;2.5000003f\r\n");
  assert.equal(write("%,.3f", [[1, 2.5]], { delimiter }), "1.000000.3f;2.500000.3f\r\n");
  assert.equal(write("%;3f", [[1, 2.5]], { delimiter }), "3f;3f\r\n");
  assert.equal(write("%.3,f", [[1, 2.5]], { delimiter }), "1.000f;2.500f\r\n");
  assert.deepEqual(read("%.3f", "1,5;2,5\n3.5;4.5\n", { delimiter }), [[1, 2], [3.5, 4.5]]);
  assert.deepEqual(read("%,3f", "1;2\n", { delimiter }), [[0, 0]]);
});

test("§3: integers are exact, strings are written as they are", () => {
  const integers = [[1n, -2n], [300n, 4n]];
  assert.equal(write("%d", integers, { element: I32 }), "1,-2\r\n300,4\r\n");
  assert.equal(write("%.3f", integers, { element: I32 }), "1.000,-2.000\r\n300.000,4.000\r\n");
  assert.equal(write("", integers, { element: I32 }), "1.000000,-2.000000\r\n300.000000,4.000000\r\n");
  assert.equal(write("%x", integers, { element: I32 }), "1,FFFFFFFE\r\n12C,4\r\n");
  assert.equal(write("%x", [[-2n]], { element: I64 }), "FFFFFFFFFFFFFFFE\r\n");
  assert.equal(write("%d", [[9007199254740993n, -9223372036854775808n]], { element: I64 }), "9007199254740993,-9223372036854775808\r\n");
  assert.equal(write("%x", [[1n, 2n], [255n, 4n]], { element: U8 }), "1,2\r\nFF,4\r\n");
  const strings = [["a", "b c"], ["", "d,e"]];
  for (const format of ["", "%s", "%.3f", "%d"]) assert.equal(write(format, strings, { element: STRING }), "a,b c\r\n,d,e\r\n", format);
  assert.equal(write("%5s", strings, { element: STRING }), "    a,  b c\r\n     ,  d,e\r\n");
  assert.equal(write("%.1s", strings, { element: STRING }), "a,b\r\n,d\r\n");
  assert.equal(write("%s", [["x\ny", 'q"r']], { element: STRING }), 'x\ny,q"r\r\n');
});

test("§4: rows end at LF, CRLF or CR and are padded with zeros", () => {
  assert.deepEqual(read("%.3f", "1,2.5\n3,4\n"), [[1, 2.5], [3, 4]]);
  assert.deepEqual(read("%.3f", "1,2.5\r\n3,4\r\n"), [[1, 2.5], [3, 4]]);
  assert.deepEqual(read("%.3f", "1,2\r3,4\n5\r\n6"), [[1, 2], [3, 4], [5, 0], [6, 0]]);
  assert.deepEqual(read("%.3f", "1,2\n3,4,5\n6\n"), [[1, 2, 0], [3, 4, 5], [6, 0, 0]]);
  assert.deepEqual(read("%.3f", "1,2,\n"), [[1, 2, 0]]);
  assert.deepEqual(read("%.3f", "1,,3\n,5,\n"), [[1, 0, 3], [0, 5, 0]]);
  assert.deepEqual(read("%.3f", ""), []);
  assert.deepEqual(read("%.3f", "\n"), [[0]]);
  assert.deepEqual(read("%.3f", "\n\n"), [[0], [0]]);
  assert.deepEqual(read("%.3f", "1,2\r\n\r\n"), [[1, 2], [0, 0]]);
  assert.deepEqual(read("%.3f", " 1 , 2 \n"), [[1, 2]]);
  assert.deepEqual(read("%.3f", "1,2.5\n3,4\n", { delimiter: "" }), [[1], [3]]);
  assert.deepEqual(read("%.3f", "1\t2\t3\n4\t5\t6\n", { delimiter: "" }), [[1, 2, 3], [4, 5, 6]]);
});

test("§4: what a field reads as a real", () => {
  assert.deepEqual(read("%.3f", "a,2\n12abc,3"), [[0, 2], [12, 3]]);
  assert.deepEqual(read("%.3f", "1e3,inf,nan,-inf,1e400,-1e400,1e-400,-nan"), [[1000, Infinity, NaN, -Infinity, Infinity, -Infinity, 0, 0]]);
  assert.deepEqual(read("%.3f", "-0,+5,.5,5.,0x10,1_0,1e,--1,1.2.3"), [[-0, 5, 0.5, 5, 0, 1, 1, 0, 1.2]]);
  for (const format of ["", "%s", "%f", "%e", "%g", "%5.1f"]) assert.deepEqual(read(format, "1,2.5"), [[1, 2.5]], format);
  assert.deepEqual(read("%d", "1,2.5\n3,4\n"), [[1, 2], [3, 4]]);
  assert.deepEqual(read("%d", "1e3,inf,nan\n0x10,1e2,-7.9"), [[1, 0, 0], [0, 1, -7]]);
  assert.deepEqual(read("%x", "a,2\n1e3,-7.9"), [[10, 2], [483, 18446744073709551609]]);
});

test("§4: one dimension splits only at the delimiter", () => {
  const one = { dimensions: 1 };
  assert.deepEqual(read("%.3f", "1,2.5\n3,4\n", one), [1, 2.5, 4]);
  assert.deepEqual(read("%.3f", "1\n2\n3\n", one), [1]);
  assert.deepEqual(read("%.3f", "1,,3\n,5,\n", one), [1, 0, 3, 5, 0]);
  assert.deepEqual(read("%.3f", "", one), []);
  assert.deepEqual(read("%.3f", "\n", one), [0]);
});

test("§4: into integers a real rounds half to even, %d truncates, and both saturate", () => {
  const values = "2.5,3.5,-2.5,-3.5,0.5,1.5";
  assert.deepEqual(read("%.3f", values, { element: I32 }), [[2n, 4n, -2n, -4n, 0n, 2n]]);
  assert.deepEqual(read("%d", values, { element: I32 }), [[2n, 3n, -2n, -3n, 0n, 1n]]);
  assert.deepEqual(read("%d", "1e3,3000000000", { element: I32 }), [[1n, 2147483647n]]);
  assert.deepEqual(read("%d", "3000000000", { element: I64 }), [[3000000000n]]);
  assert.deepEqual(read("%.3f", "300,-5,255,256,2.5,3.5", { element: U8 }), [[255n, 0n, 255n, 255n, 2n, 4n]]);
  assert.deepEqual(read("%d", "300,-5,255,256,2.5,3.5", { element: U8 }), [[255n, 0n, 255n, 255n, 2n, 3n]]);
});

test("§4: strings are read as they are, whatever the format", () => {
  const strings = { element: STRING };
  for (const format of ["%s", "", "%d", "%.3f"]) assert.deepEqual(read(format, "a,b c\n,d\n", strings), [["a", "b c"], ["", "d"]], format);
  assert.deepEqual(read("%s", " x , y \n", strings), [[" x ", " y "]]);
  assert.deepEqual(read("%s", '"q,r",s\n', strings), [['"q', 'r"', "s"]]);
  assert.deepEqual(read("%s", "a\tb,c\n", strings), [["a\tb", "c"]]);
  assert.deepEqual(read("%s", "1,2\n3", strings), [["1", "2"], ["3", ""]]);
  assert.deepEqual(read("%s", "\n", strings), [[""]]);
  const oneDimension = { element: STRING, dimensions: 1 };
  assert.deepEqual(read("%s", "a,b,c\r\n", oneDimension), ["a", "b", "c"]);
  assert.deepEqual(read("%s", "a,b,c\n\n", oneDimension), ["a", "b", "c\n"]);
  assert.deepEqual(read("%s", "a,b\nc,d\n", oneDimension), ["a", "b\nc", "d"]);
  assert.deepEqual(read("%s", ",\n", oneDimension), ["", ""]);
});

// Read Delimited Spreadsheet's steps (labview-captures/reports/2026-10-28-delimited-spreadsheet.md Q4).
test("delimited Q4: rows, offset and max characters per row give LabVIEW's rows and mark", () => {
  const small = "1,2.5\r\n3,4\r\n";
  const steps = (text, rows, offset, maxCharacters) => {
    const result = readDelimitedRows({ text, rows, offset, maxCharacters });
    return [result.rows, result.mark, result.endOfFile];
  };
  assert.deepEqual(steps(small, -1, 3, 0), [[".5", "3,4"], 12, false]);
  assert.deepEqual(steps(small, 1, 3, 0), [[".5"], 7, false]);
  assert.deepEqual(steps(small, -1, 6, 0), [["", "3,4"], 12, false]);
  assert.deepEqual(steps(small, 1, 6, 0), [[""], 7, false]);
  assert.deepEqual(steps(small, -1, 0, 3), [["1,2.5", "3,4"], 12, false], "max is ignored with all rows");
  assert.deepEqual(steps(small, 1, 0, 3), [["1,2"], 3, false]);
  assert.deepEqual(steps(small, 1, 0, 5), [["1,2.5"], 5, false]);
  assert.deepEqual(steps(small, 1, 7, 0), [["3,4"], 12, false]);
  assert.deepEqual(steps(small, 1, 7, 2), [["3,"], 9, false]);
  assert.deepEqual(steps(small, 3, 0, 3), [["1,2.5", "3,4"], 10, false]);
  assert.deepEqual(steps(small, 2, 0, 3), [["1,2.5"], 7, false]);
  assert.deepEqual(steps(small, 2, 0, 5), [["1,2.5"], 7, false]);
  assert.deepEqual(steps(small, 3, 0, 0), [["1,2.5", "3,4"], 12, true], "more rows than there are");
  assert.deepEqual(steps(small, 0, 0, 0), [[], 0, false]);
  assert.deepEqual(steps("1,2", 1, 0, 0), [["1,2"], 3, true], "a last line with no end of line");

  const long = "1,2,3,4,5\r\n6,7,8,9,10\r\n11,12\r\n";
  const measured = [
    [1, 3, ["1,2"], 3], [1, 5, ["1,2,3"], 5], [1, 8, ["1,2,3,4,"], 8], [1, 20, ["1,2,3,4,5"], 11],
    [2, 3, ["1,2,3,"], 6], [2, 5, ["1,2,3,4,5"], 11], [3, 3, ["1,2,3,4,5"], 9], [3, 5, ["1,2,3,4,5", "6,7,8"], 16],
    [3, 8, ["1,2,3,4,5", "6,7,8,9,"], 19], [4, 5, ["1,2,3,4,5", "6,7,8,9,10"], 21], [4, 8, ["1,2,3,4,5", "6,7,8,9,10"], 23],
    [4, 3, ["1,2,3,4,5"], 11],
  ];
  for (const [rows, maxCharacters, expectedRows, mark] of measured) assert.deepEqual(steps(long, rows, 0, maxCharacters), [expectedRows, mark, false], `${rows} rows, max ${maxCharacters}`);
  assert.deepEqual(steps(long, 4, 0, 0), [["1,2,3,4,5", "6,7,8,9,10", "11,12"], 30, true]);
  assert.deepEqual(steps(long, 4, 0, 20), [["1,2,3,4,5", "6,7,8,9,10", "11,12"], 30, true]);
});
