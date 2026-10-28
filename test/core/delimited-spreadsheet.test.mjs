// Write and Read Delimited Spreadsheet in a Run (DT-067 §9), on files in a temporary folder through solder-io, with
// the values LabVIEW gave on Windows (labview-captures/reports/2026-10-26-file-io-behavior.md §5–§7 and
// 2026-10-28-delimited-spreadsheet.md); the end of line written is the system's, so here it is the host's.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { hostPathRules, pathFromText } from "../../core/model/paths.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const EOL = process.platform === "win32" ? "\r\n" : "\n";
const NO_ERROR = { status: false, code: 0, source: "" };
const folder = mkdtempSync(join(tmpdir(), "solder-delimited-"));
after(() => rmSync(folder, { recursive: true, force: true }));

let fileCount = 0;
function newFile(content) {
  const name = join(folder, `s${fileCount++}.csv`);
  if (content !== undefined) writeFileSync(name, content);
  return name;
}
const pathOf = (name) => pathFromText(name, hostPathRules());

async function run(vi, values = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, { io: loadSolderIo() });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

const errorIndicator = (b, name) => b.node(name, "cluster-indicator", { type: ERROR, style: "error-out" });

/** Write Delimited Spreadsheet of the 2D control "data" (and the 1D control "row" if given) with `inputs` as constants. */
const writer = ({ twoD = { array: "number", dims: 2 }, oneD, format, delimiter = ",", append, transpose, pathWired = true } = {}) =>
  buildVI(CAT, (b) => {
    b.node("write", "write-delimited-spreadsheet-vi");
    if (pathWired) {
      b.node("file", "path-control");
      b.wire("file.result", "write.file-path");
    }
    b.node("data", "arr-control", { type: twoD });
    b.wire("data.result", "write.2d-data");
    if (oneD) {
      b.node("row", "arr-control", { type: oneD });
      b.wire("row.result", "write.1d-data");
    }
    for (const [port, value, block] of [["format", format, "str-const"], ["delimiter", delimiter, "str-const"], ["append", append, "bool-const"], ["transpose", transpose, "bool-const"]]) {
      if (value === undefined) continue;
      b.node(port, block, { value });
      b.wire(`${port}.result`, `write.${port}`);
    }
    b.node("newPath", "path-indicator");
    errorIndicator(b, "error");
    b.wire("write.new-file-path", "newPath.value");
    b.wire("write.error-out", "error.value");
  });

test("§5: DBL with the format unwired is %.3f, and every row ends with the end of line", async () => {
  const name = newFile();
  const out = await run(writer(), { file: pathOf(name), data: [[1, 2.5], [3, 4]] });
  assert.equal(readFileSync(name, "latin1"), `1.000,2.500${EOL}3.000,4.000${EOL}`);
  assert.deepEqual(out.newPath, pathOf(name));
  assert.deepEqual(out.error, NO_ERROR);
});

test("§5 and Q2: transpose, 1D data over 2D, and I32 written by the I64 instance with %d", async () => {
  const name = newFile();
  await run(writer({ transpose: true }), { file: pathOf(name), data: [[1, 2.5], [3, 4]] });
  assert.equal(readFileSync(name, "latin1"), `1.000,3.000${EOL}2.500,4.000${EOL}`);
  await run(writer({ oneD: { array: "number" } }), { file: pathOf(name), data: [[1, 2.5], [3, 4]], row: [7, 8, 9] });
  assert.equal(readFileSync(name, "latin1"), `7.000,8.000,9.000${EOL}`, "the 1D wins when it is not empty");
  await run(writer({ oneD: { array: "number" }, transpose: true }), { file: pathOf(name), data: [], row: [7, 8, 9] });
  assert.equal(readFileSync(name, "latin1"), `7.000${EOL}8.000${EOL}9.000${EOL}`, "a transposed 1D is a column");
  await run(writer({ oneD: { array: "number" } }), { file: pathOf(name), data: [[1, 2.5]], row: [] });
  assert.equal(readFileSync(name, "latin1"), `1.000,2.500${EOL}`, "an empty 1D leaves the 2D");
  await run(writer({ twoD: { array: "i32", dims: 2 } }), { file: pathOf(name), data: [[1, -2], [300, 4]] });
  assert.equal(readFileSync(name, "latin1"), `1,-2${EOL}300,4${EOL}`);
});

test("Q6: append writes right after what the file had, and a string array is written as it is", async () => {
  const name = newFile("zz");
  const strings = writer({ twoD: { array: "string", dims: 2 }, append: true });
  await run(strings, { file: pathOf(name), data: [["a", "b c"], ["", "d,e"]] });
  await run(strings, { file: pathOf(name), data: [["x", "y"]] });
  assert.equal(readFileSync(name, "latin1"), `zza,b c${EOL},d,e${EOL}x,y${EOL}`);
  await run(writer({ twoD: { array: "string", dims: 2 }, append: false }), { file: pathOf(name), data: [["x", "y"]] });
  assert.equal(readFileSync(name, "latin1"), `x,y${EOL}`, "without append the file is replaced");
});

test("§7 and Q3: a missing folder is error 7 through LabVIEW's subVIs; an unwired path is a cancelled dialog", async () => {
  const name = join(folder, "missing", "s.csv");
  const out = await run(writer(), { file: pathOf(name), data: [[1]] });
  assert.deepEqual(out.error, { status: true, code: 7, source: `Open/Create/Replace File in Write Spreadsheet String.vi->Write Delimited Spreadsheet (DBL).vi<APPEND>\n${name}` });
  assert.equal(existsSync(name), false);
  const cancelled = await run(writer({ pathWired: false }), { data: [[1]] });
  assert.deepEqual(cancelled.error, { status: true, code: 43, source: "Open/Create/Replace File in Write Spreadsheet String.vi->Write Delimited Spreadsheet (DBL).vi" });
});

/** Read Delimited Spreadsheet of the path control "file" with `inputs` as constants, all outputs to indicators. */
const reader = ({ instance, rows, offset, maxCharacters, transpose, delimiter = ",", format } = {}) =>
  buildVI(CAT, (b) => {
    b.node("read", "read-delimited-spreadsheet-vi", instance ? { instance } : undefined);
    b.node("file", "path-control");
    b.wire("file.result", "read.file-path");
    for (const [port, value, block, type] of [
      ["number-of-rows", rows, "const", "i32"], ["start-of-read-offset", offset, "const", "i32"], ["max-characters", maxCharacters, "const", "i32"],
      ["transpose", transpose, "bool-const"], ["delimiter", delimiter, "str-const"], ["format", format, "str-const"],
    ]) {
      if (value === undefined) continue;
      b.node(port, block, type ? { value, type } : { value });
      b.wire(`${port}.result`, `read.${port}`);
    }
    const element = { double: "number", integer: "i64", string: "string" }[instance ?? "double"];
    b.node("all", "arr-indicator", { type: { array: element, dims: 2 } });
    b.node("first", "arr-indicator", { type: { array: element } });
    b.node("mark", "indicator", { type: "i32" });
    b.node("eof", "bool-indicator");
    errorIndicator(b, "error");
    b.wire("read.all-rows", "all.value");
    b.wire("read.first-row", "first.value");
    b.wire("read.mark-after-read", "mark.value");
    b.wire("read.eof", "eof.value");
    b.wire("read.error-out", "error.value");
  });

const outputs = (out) => [out.all, out.first, out.mark, out.eof];

test("§6: rows, the mark after read, and EOF? with warning 4 only past the end", async () => {
  const name = newFile("1,2.5\r\n3,4\r\n");
  const file = pathOf(name);
  assert.deepEqual(outputs(await run(reader(), { file })), [[[1, 2.5], [3, 4]], [1, 2.5], 12, false]);
  assert.deepEqual(outputs(await run(reader({ rows: 1 }), { file })), [[[1, 2.5]], [1, 2.5], 7, false]);
  const past = await run(reader({ rows: 3 }), { file });
  assert.deepEqual(outputs(past), [[[1, 2.5], [3, 4]], [1, 2.5], 12, true]);
  assert.deepEqual(past.error, { status: false, code: 4, source: "Read File+ (string): Read File" });
  assert.deepEqual(outputs(await run(reader({ rows: 0 }), { file })), [[], [], 0, false]);
});

test("Q4 and Q5: offset, max characters per row and transpose", async () => {
  const file = pathOf(newFile("1,2.5\r\n3,4\r\n"));
  assert.deepEqual(outputs(await run(reader({ offset: 3 }), { file })), [[[0.5, 0], [3, 4]], [0.5, 0], 12, false]);
  assert.deepEqual(outputs(await run(reader({ rows: 1, maxCharacters: 3 }), { file })), [[[1, 2]], [1, 2], 3, false]);
  assert.deepEqual(outputs(await run(reader({ rows: 1, offset: 7, maxCharacters: 2 }), { file })), [[[3, 0]], [3, 0], 9, false]);
  const square = pathOf(newFile("1,2\r\n3,4\r\n"));
  assert.deepEqual(outputs(await run(reader({ transpose: true }), { file: square })), [[[1, 3], [2, 4]], [1, 3], 10, false]);
  assert.deepEqual(outputs(await run(reader({ transpose: true, rows: 1 }), { file: square })), [[[1], [2]], [1], 5, false]);
});

test("§6: a missing file is error 7 from Open File+ with mark -1; the String instance reads text", async () => {
  const missing = await run(reader(), { file: pathOf(join(folder, "nothing.csv")) });
  assert.deepEqual(outputs(missing), [[], [], -1, false]);
  assert.deepEqual(missing.error, { status: true, code: 7, source: "Open File+.vi:Open File" });
  const strings = await run(reader({ instance: "string", format: "%s" }), { file: pathOf(newFile("a,b c\n,d\n")) });
  assert.deepEqual(strings.all, [["a", "b c"], ["", "d"]]);
});
