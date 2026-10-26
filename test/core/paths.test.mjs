// The path rules of core/model/paths.mjs against LabVIEW 2026 Q3 on Windows, case by case
// (labview-captures/reports/2026-10-26-path-type.md §3, §4).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_PATH, NOT_A_PATH, PATH_KIND, arrayOfStringsToPath, buildPath, decodePath, encodePath, isEmptyPath, isNotAPath,
  pathFromText, pathToArrayOfStrings, pathToText, pathsEqual, stripPath,
} from "../../core/model/paths.mjs";

const WINDOWS = "windows";
const fromText = (text) => pathFromText(text, WINDOWS);
const toText = (path) => pathToText(path, WINDOWS);

test("String To Path on Windows gives LabVIEW's paths, its kind and Path To String of each", () => {
  const cases = [
    ["", "", PATH_KIND.ABSOLUTE],
    ["C:/a/b", "C:\\/a/b", PATH_KIND.ABSOLUTE],
    ["a\\b", "a\\b", PATH_KIND.RELATIVE],
    ["\\\\server\\share\\f", "\\\\server\\share\\f", PATH_KIND.ABSOLUTE],
    ["C:\\a\\", "C:\\a", PATH_KIND.ABSOLUTE],
    ["C:a", "C:\\a", PATH_KIND.ABSOLUTE],
    ["/a/b", "/a/b", PATH_KIND.RELATIVE],
    ["..\\x", "..\\x", PATH_KIND.RELATIVE],
    [".", ".", PATH_KIND.RELATIVE],
    ["C:\\a\\\\b", "C:\\a\\b", PATH_KIND.ABSOLUTE],
    ["c:\\A", "c:\\A", PATH_KIND.ABSOLUTE],
    ["<Not A Path>", "<Not A Path>", PATH_KIND.NOT_A_PATH],
    ["C:\\a/b\\c", "C:\\a/b\\c", PATH_KIND.ABSOLUTE],
    ["a/b", "a/b", PATH_KIND.RELATIVE],
    ["\\\\?\\C:\\a", "C:\\a", PATH_KIND.ABSOLUTE],
    ["C:", "C:\\", PATH_KIND.ABSOLUTE],
  ];
  for (const [text, shown, kind] of cases) {
    const path = fromText(text);
    assert.equal(toText(path), shown, `String To Path of ${JSON.stringify(text)}`);
    assert.equal(path.kind, kind, `Path Type of ${JSON.stringify(text)}`);
  }
});

test("Build Path gives LabVIEW's result for every measured base and name", () => {
  const notAPath = "<Not A Path>";
  const cases = [
    [fromText("C:\\a"), "b", "C:\\a\\b"],
    [EMPTY_PATH, "b", "b:\\"],
    [NOT_A_PATH, "b", notAPath],
    [fromText("C:\\a"), "..\\x", "C:\\x"],
    [fromText("C:\\a"), "C:\\z", notAPath],
    [fromText("C:\\a"), "b\\", "C:\\a\\b"],
    [fromText("C:\\a\\"), "b", "C:\\a\\b"],
    [fromText("C:\\a"), "", notAPath],
    [fromText("a"), "b", "a\\b"],
    [fromText("C:\\a"), ".", "C:\\a"],
    [fromText("C:\\a"), "b\\c", "C:\\a\\b\\c"],
    [EMPTY_PATH, "", ""],
    [fromText("C:\\"), "..", ""],
  ];
  for (const [base, name, expected] of cases) assert.equal(toText(buildPath(base, name, WINDOWS)), expected, `${toText(base)} + ${JSON.stringify(name)}`);
  assert.equal(buildPath(fromText("a"), "b", WINDOWS).kind, PATH_KIND.RELATIVE);
  assert.ok(isEmptyPath(buildPath(EMPTY_PATH, "", WINDOWS)));
});

test("Build Path takes a path as its name too", () => {
  assert.equal(toText(buildPath(fromText("C:\\a"), fromText("b\\c"), WINDOWS)), "C:\\a\\b\\c");
  assert.ok(isNotAPath(buildPath(fromText("C:\\a"), fromText("D:\\z"), WINDOWS)));
});

test("Strip Path gives LabVIEW's stripped path and name", () => {
  const cases = [
    ["C:\\a\\b.txt", "C:\\a", "b.txt"],
    ["C:\\a\\", "C:\\", "a"],
    ["C:\\", "", "C"],
    ["C:", "", "C"],
    ["", "<Not A Path>", ""],
    ["<Not A Path>", "<Not A Path>", ""],
    ["C:\\a", "C:\\", "a"],
    ["a\\b", "a", "b"],
    ["a", ".", "a"],
    ["\\\\server\\share\\f", "\\\\server\\share", "f"],
    ["\\\\server\\share", "<Not A Path>", ""],
  ];
  for (const [input, stripped, name] of cases) {
    const result = stripPath(fromText(input));
    assert.equal(toText(result.stripped), stripped, `stripped path of ${JSON.stringify(input)}`);
    assert.equal(result.name, name, `name of ${JSON.stringify(input)}`);
  }
  assert.ok(isEmptyPath(stripPath(fromText("C:\\")).stripped));
  assert.ok(isEmptyPath(stripPath(fromText("a")).stripped), "the relative \".\" counts as empty");
});

test("Empty? and Not A Path? tell the empty path, \".\" and Not A Path apart", () => {
  assert.deepEqual([isEmptyPath(EMPTY_PATH), isNotAPath(EMPTY_PATH)], [true, false]);
  assert.deepEqual([isEmptyPath(NOT_A_PATH), isNotAPath(NOT_A_PATH)], [false, true]);
  assert.deepEqual([isEmptyPath(fromText(".")), isNotAPath(fromText("."))], [true, false]);
  assert.deepEqual([isEmptyPath(fromText("C:\\a")), isNotAPath(fromText("C:\\a"))], [false, false]);
});

test("Equal? on Windows paths ignores case and a trailing separator, not the kind", () => {
  const cases = [
    ["C:\\a", "c:\\A", true],
    ["C:\\a", "C:\\a\\", true],
    ["", "", true],
    ["<Not A Path>", "<Not A Path>", true],
    ["<Not A Path>", "", false],
    ["a", "A", true],
    ["C:\\a\\b", "C:\\a\\b", true],
    ["C:/a", "C:\\a", false],
    ["", "a", false],
  ];
  for (const [first, second, equal] of cases) assert.equal(pathsEqual(fromText(first), fromText(second), WINDOWS), equal, `${first} = ${second}`);
});

test("Path to Array of Strings and back keeps every path but Not A Path, which comes back empty", () => {
  const cases = [
    ["C:\\a\\b.txt", ["C", "a", "b.txt"], false],
    ["a\\b", ["a", "b"], true],
    ["\\\\server\\share\\f", ["\\\\server\\share", "f"], false],
    ["C:\\", ["C"], false],
    ["", [], false],
    ["<Not A Path>", [], false],
    [".", [], true],
    ["..\\x", ["", "x"], true],
  ];
  for (const [text, components, relative] of cases) {
    const result = pathToArrayOfStrings(fromText(text));
    assert.deepEqual(result, { components, relative }, text);
    const back = toText(arrayOfStringsToPath(result.components, result.relative));
    assert.equal(back, text === "<Not A Path>" ? "" : text, `round trip of ${text}`);
  }
});

test("a path goes through memory as one block and comes back the same; an empty block is the empty path", () => {
  for (const text of ["", "C:\\a\\b.txt", "a\\b", "..\\x", ".", "<Not A Path>", "\\\\server\\share\\f", "C:\\ñandú\\日本"]) {
    const path = fromText(text);
    assert.deepEqual(decodePath(encodePath(path)), path, text);
  }
  assert.equal(encodePath(EMPTY_PATH).length, 0);
  assert.deepEqual(decodePath(new Uint8Array(0)), EMPTY_PATH);
});
