// Format Into String and Scan From String: every expected value is what LabVIEW
// 2026 Q3 gave (labview-captures/format-scan/), with a Spanish locale where the
// test says separator ",".

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatIntoString, formatValue, scanFromString, scanValue } from "../../core/runtime/format-string.mjs";

const real = (value) => ({ kind: "float", value });
const int = (value, bits = 32, signed = true) => ({ kind: "int", value: BigInt(value), bits, signed });
const text = (value) => ({ kind: "string", value });
const bool = (value) => ({ kind: "bool", value });
const fmt = (format, ...args) => formatIntoString(format, "", args).text;

test("integer formats round a real to nearest, ties to even", () => {
  assert.deepEqual([3.7, -3.5, 2.5, 1.5, 0.5].map((x) => fmt("%d", real(x))), ["4", "-4", "2", "2", "0"]);
  assert.deepEqual(["%5d", "%-5d", "%05d", "%+d"].map((f) => fmt(f, real(3.7))), ["    4", "4    ", "00004", "+4"]);
});

test("fractional, scientific and %g formats", () => {
  assert.equal(fmt("%f", real(3.14159)), "3.141590");
  assert.equal(formatIntoString("%f", "", [real(3.14159)], ",").text, "3,141590", "the system separator by default");
  assert.deepEqual(["%.2f", "%8.3f", "%e", "%.3e", "%,;%.2f"].map((f) => fmt(f, real(3.14159))), ["3.14", "   3.142", "3.141590E+0", "3.142E+0", "3,14"]);
  assert.deepEqual([fmt("%.0f", real(2.5)), fmt("%.0f", real(3.5)), fmt("%.1f", real(0.25)), fmt("%.2f", real(2.675))], ["2", "4", "0.2", "2.67"]);
  assert.deepEqual([fmt("%+f", real(2.5)), fmt("%010.2f", real(2.5)), fmt("%-10.2f|", real(2.5)), fmt("%E", real(2.5)), fmt("%G", real(2.5))],
    ["+2.500000", "0000002.50", "2.50      |", "2.500000E+0", "2.500000"]);
  assert.deepEqual([fmt("%10.4e", real(12345.6789)), fmt("%e", real(0))], [" 1.2346E+4", "0.000000E+0"]);
  assert.deepEqual([0.0001, 1e-5, 999999, 1e6, 1e7, 12345678, 0, -0.5].map((x) => fmt("%g", real(x))),
    ["0.000100", "1.000000E-5", "999999.000000", "1000000.000000", "1.000000E+7", "1.234568E+7", "0.000000", "-0.500000"]);
});

test("radix formats use the two's complement width of the input type", () => {
  assert.deepEqual(["%x", "%X", "%o", "%b", "%#x", "%08x", "%5x", "%10b", "%u"].map((f) => fmt(f, real(255))),
    ["FF", "FF", "377", "11111111", "FF", "000000FF", "   FF", "  11111111", "255"]);
  assert.equal(fmt("%x", real(-1)), "FFFFFFFFFFFFFFFF", "a real goes through I64");
  assert.deepEqual([fmt("%x", int(-5)), fmt("%o", int(-5)), fmt("%x", int(-1, 8)), fmt("%d", int(-128, 8))], ["FFFFFFFB", "37777777773", "FF", "-128"]);
  const u64max = int(2n ** 64n - 1n, 64, false);
  assert.deepEqual([fmt("%d", u64max), fmt("%x", u64max), fmt("%f", u64max)], ["18446744073709551615", "FFFFFFFFFFFFFFFF", "18446744073709551615.000000"]);
  assert.deepEqual([fmt("%d", real(1e10)), fmt("%d", real(1e20)), fmt("%d", real(NaN)), fmt("%d", real(-Infinity))], ["10000000000", "9223372036854775807", "9223372036854775807", "-9223372036854775808"]);
});

test("NaN, infinities and SI prefixes", () => {
  assert.deepEqual([NaN, Infinity, -Infinity].map((x) => fmt("%.2f", real(x))), ["NaN", "Inf", "-Inf"]);
  assert.deepEqual([fmt("%p", real(12345.6)), fmt("%.2p", real(12345.6)), fmt("%p", real(0.0123)), fmt("%p", real(0)), fmt("%p", real(1e12)), fmt("%p", real(1e-12))],
    ["12.345600k", "12.35k", "12.300000m", "0.000000", "1.000000T", "1.000000p"]);
});

test("several arguments, positions, an empty format and the initial string", () => {
  assert.equal(fmt("x=%d, y=%.;%.1f", real(3), real(2.25)), "x=3, y=2.2");
  assert.deepEqual([fmt("a%db%dc", real(3), real(2.25)), fmt("%d%% and %d", real(3), real(2.25)), fmt("%2$d %1$d", real(3), real(2.25))], ["a3b2c", "3% and 2", "2 3"]);
  assert.equal(formatIntoString("", "", [real(3), real(2.25)], ",").text, "3,000000 2,250000");
  assert.equal(formatIntoString("%d %d", "abc", [real(3), real(2.25)]).text, "abc3 2");
});

test("strings and Booleans", () => {
  assert.deepEqual(["%d %s", "%d %8s|", "%d %-8s|", "%d %.3s|", "%d %8.2s|", "%d %S"].map((f) => fmt(f, real(3), text("hello"))),
    ["3 hello", "3    hello|", "3 hello   |", "3 hel|", "3       he|", "3 hello"]);
  assert.deepEqual(["%d", "%5d", "%s"].map((f) => fmt(f, bool(true))), ["1", "    1", "TRUE"]);
  assert.equal(formatIntoString("", "", [real(3), bool(true)], ",").text, "3,000000 TRUE");
});

test("format errors: type mismatch 81, unknown 82, too few 83, too many 84; the text is empty", () => {
  assert.deepEqual(formatIntoString("%s", "x", [real(255)]), { error: 81, arg: 1, text: "" });
  assert.deepEqual(formatIntoString("%c", "", [real(255)]), { error: 82, arg: 1, text: "" });
  assert.deepEqual(formatIntoString("%%", "", [real(1)]), { error: 83, arg: null, text: "" });
  assert.deepEqual(formatIntoString("%d", "", [real(3), real(2)]), { error: 83, arg: null, text: "" });
  assert.deepEqual(formatIntoString("%d %d %d", "", [real(3), real(2)]), { error: 84, arg: null, text: "" });
  assert.deepEqual(formatIntoString("%d %d", "", [real(3), text("a")]), { error: 81, arg: 2, text: "" });
});

const scan = (input, format, outputs = [real(0)], start = 0, separator = ".") => scanFromString(input, format, start, outputs, separator);

test("scanning numbers skips leading whitespace and stops where the number ends", () => {
  const one = (input, format) => {
    const r = scan(input, format);
    return [r.values[0], r.remaining, r.offset, r.error];
  };
  assert.deepEqual(one("42abc", "%d"), [42, "abc", 2, null]);
  assert.deepEqual(one("  42", "%d"), [42, "", 4, null]);
  assert.deepEqual(one("3.9", "%d"), [3, ".9", 1, null]);
  assert.deepEqual(one("abc", "%d"), [0, "abc", 0, 85]);
  assert.deepEqual(one("-", "%d"), [0, "-", 0, 85]);
  assert.deepEqual(one("1e3", "%f"), [1000, "", 3, null]);
  assert.deepEqual(one("-0.5x", "%f"), [-0.5, "x", 4, null]);
  assert.deepEqual(one("1e400", "%f"), [Infinity, "", 5, null]);
  assert.deepEqual(one("ff", "%x"), [255, "", 2, null]);
  assert.deepEqual(one("0xff", "%x"), [0, "xff", 1, null]);
  assert.deepEqual([one("17", "%o")[0], one("101", "%b")[0], one("12.5k", "%.;%p")[0]], [15, 5, 12500]);
  assert.deepEqual(one("12345678", "%5d"), [12345, "678", 5, null]);
  const comma = scan("3.25", "%f", [real(0)], 0, ",");
  assert.deepEqual([comma.values[0], comma.remaining], [3, ".25"], "%f follows the system separator unless %.; says otherwise");
});

test("literals, several outputs and count errors", () => {
  assert.deepEqual(scan("3,4", "%d,").values, [3]);
  assert.equal(scan("y5", "x%d").error, 85);
  assert.deepEqual([scan("50%", "%d%%").values[0], scan("%7", "%%%d").values[0]], [50, 7]);
  const five = [real(0), real(0), real(0), real(0), real(0)];
  assert.deepEqual(scan("1 2 3 4 5", "%d %d %d %d %d", five).values, [1, 2, 3, 4, 5]);
  const few = scan("1 2 3", "%d %d %d", five);
  assert.deepEqual([few.error, few.remaining, few.offset], [83, "1 2 3", 0]);
  assert.equal(scan("1 2 3 4 5 6", "%d %d %d %d %d %d", five).error, 84);
});

test("scanned values take the type of their output: integers round to even and saturate", () => {
  const types = [real(0), int(0), int(0, 8, false)];
  const read = (input) => scan(input, "%f %f %f", types).values;
  assert.deepEqual(read("3.7 3.7 3.7"), [3.7, 4n, 4n]);
  assert.deepEqual(read("2.5 2.5 -3.5"), [2.5, 2n, 0n]);
  assert.deepEqual(read("1 1e10 NaN"), [1, 2147483647n, 255n]);
  assert.deepEqual(scan("300 -5", "%d %d", [int(0), int(0, 8, false)]).values, [300n, 0n]);
});

test("strings, sets, the initial location and failures with defaults", () => {
  const withString = [real(0), real(0), real(0), real(0), text("")];
  const words = scan("1 2 3 4 hello world", "%d %d %d %d %s", withString);
  assert.deepEqual([words.values[4], words.remaining, words.offset], ["hello", " world", 13]);
  assert.deepEqual(scan("1 2 3 4 hello world", "", withString).values, [1, 2, 3, 4, "hello"]);
  assert.equal(scan("1 2 3 4 abc123", "%d %d %d %d %[a-z]", withString).values[4], "abc");
  assert.equal(scan("1 2 3 4 ab cd,ef", "%d %d %d %d %[^,]", withString).values[4], "ab cd");
  assert.equal(scan("1 2 3 4 abcdef", "%d %d %d %d %3s", withString).values[4], "abc");
  assert.deepEqual(scan("1 2 3 4 x", "%d %d %d %d %d", withString).error, 81, "%d into a string output");
  const located = scan("xx 1 2 3 4 abc", "%d %d %d %d %s", withString, 3);
  assert.deepEqual([located.values, located.offset], [[1, 2, 3, 4, "abc"], 14], "the offset is counted from the beginning");
  const failed = scan("1 2 x 4 hello", "%d %d %d %d %s", [real(9), real(7), real(8), real(0), text("dflt")]);
  assert.deepEqual([failed.values, failed.remaining, failed.offset, failed.error, failed.arg], [[1, 2, 8, 0, "dflt"], "x 4 hello", 4, 85, 3]);
});

test("Format Value and Scan Value have no errors", () => {
  assert.deepEqual([formatValue("x=", "%.;%.2f", 3.14159), formatValue("", "%d", 5.5), formatValue("", "%d %d", 7), formatValue("", "%s", 7, ","), formatValue("abc", "%.;%5.1f|", 3.14159)],
    ["x=3.14", "6", "7 %d", "7,000000", "abc  3.1|"]);
  assert.deepEqual(scanValue("42abc", "%d", 0), { value: 42, remaining: "abc" });
  assert.deepEqual(scanValue("abc", "%d", 9), { value: 9, remaining: "abc" });
});
