// The file functions in a Run (DT-067 §6–§7): Open/Create/Replace File, Close File, Write to Text File, Read
// from Text File and Get File Size are external waits answered by the Run's coordinator through solder-io,
// on one thread and on a pool, on files in a temporary folder. The values are LabVIEW's, measured on Windows
// (labview-captures/reports/2026-10-26-file-io-behavior.md); the end of line Convert EOL writes is the
// system's, so here it is the host's.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { MessageChannel } from "node:worker_threads";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { createIoClient, serveSolderIo } from "../../core/runtime/io-protocol.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { EMPTY_PATH, NOT_A_PATH, pathFromText } from "../../core/model/paths.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const THREADS = 2;
const SYSTEM_END_OF_LINE = process.platform === "win32" ? "\r\n" : "\n";
const OPERATION = { open: 0, replace: 1, create: 2, openOrCreate: 3, replaceOrCreate: 4, replaceOrCreateWithConfirmation: 5 };
const ACCESS = { readWrite: 0, readOnly: 1, writeOnly: 2 };
const NO_ERROR = { status: false, code: 0, source: "" };

const pool = createNodePool(THREADS);
const folder = mkdtempSync(join(tmpdir(), "solder-file-io-"));
after(() => {
  pool.close();
  rmSync(folder, { recursive: true, force: true });
});

let fileCount = 0;
/** A new file name in the test's folder, with `content` written to it unless it is undefined. */
function newFile(content) {
  const name = join(folder, `f${fileCount++}.txt`);
  if (content !== undefined) writeFileSync(name, content);
  return name;
}

const errorIndicator = (b, name) => b.node(name, "cluster-indicator", { type: ERROR, style: "error-out" });
/** The source of a file function's error: its name and, after a line break, the file (measured; no VI name in a test). */
const sourceOf = (functionName, fileText) => `${functionName}<APPEND>\n${fileText}`;

/** Runs `vi` with solder-io; the writes come back by the names `vi` gave its nodes. */
async function run(vi, values = {}, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, { io: loadSolderIo(), ...options });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** Open/Create/Replace File with `operation` and `access` on the path control "file", then Close File. */
const openThenClose = (operation, access = ACCESS.readWrite) =>
  buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("operation", "const", { value: operation, type: "u16" });
    b.node("access", "const", { value: access, type: "u16" });
    b.node("open", "open-create-replace-file");
    b.node("close", "close-file");
    b.node("cancelled", "bool-indicator");
    b.node("closedPath", "path-indicator");
    errorIndicator(b, "openError");
    errorIndicator(b, "closeError");
    b.wire("file.result", "open.file-path");
    b.wire("operation.result", "open.operation");
    b.wire("access.result", "open.access");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("open.error-out", "close.error-in");
    b.wire("open.cancelled", "cancelled.value");
    b.wire("open.error-out", "openError.value");
    b.wire("close.path", "closedPath.value");
    b.wire("close.error-out", "closeError.value");
  });

/** Opens "file" with `operation`, writes "text" (a string or lines) at the start, and closes it. */
const openWriteClose = ({ operation = OPERATION.open, access = ACCESS.readWrite, lines = false, convertEol = true } = {}) =>
  buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("operation", "const", { value: operation, type: "u16" });
    b.node("access", "const", { value: access, type: "u16" });
    b.node("open", "open-create-replace-file");
    b.node("text", lines ? "arr-control" : "str-control", lines ? { type: { array: "string" } } : undefined);
    b.node("write", "write-to-text-file", { "convert-eol": convertEol });
    b.node("close", "close-file");
    errorIndicator(b, "writeError");
    b.wire("file.result", "open.file-path");
    b.wire("operation.result", "open.operation");
    b.wire("access.result", "open.access");
    b.wire("open.refnum-out", "write.file");
    b.wire("open.error-out", "write.error-in");
    b.wire("text.result", "write.text");
    b.wire("write.refnum-out", "close.refnum");
    b.wire("write.error-out", "writeError.value");
  });

/** Opens "file" with `access`, reads `count` (bytes, or lines with Read Lines), and closes it. */
const openReadClose = ({ count, readLines = false, convertEol = true, access = ACCESS.readWrite } = {}) =>
  buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("access", "const", { value: access, type: "u16" });
    b.node("open", "open-create-replace-file");
    b.node("read", "read-from-text-file", { "read-lines": readLines, "convert-eol": convertEol });
    b.node("close", "close-file");
    // Read Lines gives an array with count wired and a string, the next line, without it (measured).
    const lines = readLines && count !== undefined;
    b.node("text", lines ? "arr-indicator" : "str-indicator", lines ? { type: { array: "string" } } : undefined);
    errorIndicator(b, "readError");
    if (count !== undefined) {
      b.node("count", "const", { value: count, type: "i32" });
      b.wire("count.result", "read.count");
    }
    b.wire("file.result", "open.file-path");
    b.wire("access.result", "open.access");
    b.wire("open.refnum-out", "read.file");
    b.wire("open.error-out", "read.error-in");
    b.wire("read.refnum-out", "close.refnum");
    b.wire("read.text", "text.value");
    b.wire("read.error-out", "readError.value");
  });

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`Write to Text File and Read from Text File by path go through solder-io ${where}`, async () => {
    const name = newFile("old content that is replaced");
    const vi = buildVI(CAT, (b) => {
      b.node("file", "path-control");
      b.node("text", "str-const", { value: "ab\ncd\n" });
      b.node("write", "write-to-text-file");
      b.node("close", "close-file");
      b.node("read", "read-from-text-file");
      b.node("closeRead", "close-file");
      b.node("readText", "str-indicator");
      errorIndicator(b, "readError");
      b.wire("file.result", "write.file");
      b.wire("text.result", "write.text");
      b.wire("write.refnum-out", "close.refnum");
      b.wire("write.error-out", "close.error-in");
      b.wire("close.path", "read.file");
      b.wire("close.error-out", "read.error-in");
      b.wire("read.refnum-out", "closeRead.refnum");
      b.wire("read.text", "readText.value");
      b.wire("read.error-out", "readError.value");
    });
    const shown = await run(vi, { file: pathFromText(name) }, options());
    // A path wired replaces the file (measured), and Close File gives the path the next read opens.
    assert.equal(readFileSync(name, "latin1"), `ab${SYSTEM_END_OF_LINE}cd${SYSTEM_END_OF_LINE}`);
    assert.equal(shown.readText, "ab\ncd\n");
    assert.deepEqual(shown.readError, NO_ERROR);
  });
}

test("each operation of Open/Create/Replace File on an existing and a missing file, with its code and source", async () => {
  const measured = [
    [OPERATION.open, { existing: 0, missing: 7 }],
    [OPERATION.replace, { existing: 0, missing: 7 }],
    [OPERATION.create, { existing: 10, missing: 0 }],
    [OPERATION.openOrCreate, { existing: 0, missing: 0 }],
    [OPERATION.replaceOrCreate, { existing: 0, missing: 0 }],
    // Cancelled until the editor has the confirmation dialog (DT-067, amendment of 2026-10-28).
    [OPERATION.replaceOrCreateWithConfirmation, { existing: 43, missing: 0 }],
  ];
  for (const [operation, codes] of measured) {
    for (const [state, code] of Object.entries(codes)) {
      const name = newFile(state === "existing" ? "hello" : undefined);
      const shown = await run(openThenClose(operation), { file: pathFromText(name) });
      const label = `operation ${operation} on a ${state} file`;
      if (code === 0) {
        assert.deepEqual(shown.openError, NO_ERROR, label);
        assert.deepEqual(shown.closedPath, pathFromText(name), `${label}: Close File gives the file's path`);
      } else {
        assert.deepEqual(shown.openError, { status: true, code, source: sourceOf("Open/Create/Replace File", name) }, label);
        // The error passes downstream: Close File returns it and the empty path (measured).
        assert.deepEqual(shown.closeError, shown.openError, label);
        assert.deepEqual(shown.closedPath, EMPTY_PATH, label);
      }
      assert.equal(shown.cancelled, code === 43, label);
    }
  }
});

test("Write to Text File writes at the current position, with Convert EOL as measured", async () => {
  const name = newFile("hello");
  await run(openWriteClose(), { file: pathFromText(name), text: "XY" });
  assert.equal(readFileSync(name, "latin1"), "XYllo", "measured: 58 59 6c 6c 6f");

  const converted = newFile();
  await run(openWriteClose({ operation: OPERATION.replaceOrCreate }), { file: pathFromText(converted), text: "a\rb\r\nc\n\rd\n\ne" });
  const eol = SYSTEM_END_OF_LINE;
  assert.equal(readFileSync(converted, "latin1"), `a${eol}b${eol}c${eol}d${eol}${eol}e`);

  const raw = newFile();
  await run(openWriteClose({ operation: OPERATION.replaceOrCreate, convertEol: false }), { file: pathFromText(raw), text: "a\rb" });
  assert.equal(readFileSync(raw, "latin1"), "a\rb", "Convert EOL off writes the text as it is (measured)");
});

test("Write to Text File writes an array of strings as lines, each with its end of line", async () => {
  const eol = SYSTEM_END_OF_LINE;
  const measured = [
    [["x", "y"], `x${eol}y${eol}`],
    [["x"], `x${eol}`],
    [[], ""],
    [["", ""], `${eol}${eol}`],
    [["a\nb", "c"], `a${eol}b${eol}c${eol}`],
  ];
  for (const [lines, bytes] of measured) {
    const name = newFile();
    await run(openWriteClose({ operation: OPERATION.replaceOrCreate, lines: true }), { file: pathFromText(name), text: lines });
    assert.equal(readFileSync(name, "latin1"), bytes, JSON.stringify(lines));
  }
});

test("Read from Text File gives LabVIEW's text and error for each count", async () => {
  const measured = [
    [-1, "ab\ncd\n", 0],
    [undefined, "ab\ncd\n", 0],
    [0, "", 0],
    [3, "ab\n", 0],
    [8, "ab\ncd\n", 0],
    [9, "ab\ncd\n", 4],
    [100, "ab\ncd\n", 4],
  ];
  for (const [count, text, code] of measured) {
    const name = newFile("ab\r\ncd\r\n");
    const shown = await run(openReadClose({ count }), { file: pathFromText(name) });
    assert.equal(shown.text, text, `count ${count}`);
    // Past the end the text read still comes, with error 4 (measured).
    const error = code === 0 ? NO_ERROR : { status: true, code, source: sourceOf("Read from Text File", name) };
    assert.deepEqual(shown.readError, error, `count ${count}`);
  }
});

test("Read from Text File with Read Lines gives the lines as an array", async () => {
  const measured = [
    ["ab\r\ncd\r\n", 1, ["ab"], 0],
    ["ab\r\ncd\r\n", 3, ["ab", "cd"], 4],
    ["ab\ncd", -1, ["ab", "cd"], 0],
    ["ab\n\ncd\n", -1, ["ab", "", "cd"], 0],
    ["", 1, [], 4],
  ];
  for (const [content, count, lines, code] of measured) {
    const name = newFile(content);
    const shown = await run(openReadClose({ count, readLines: true }), { file: pathFromText(name) });
    assert.deepEqual(shown.text, lines, `${JSON.stringify(content)} count ${count}`);
    assert.equal(shown.readError.code, code, `${JSON.stringify(content)} count ${count}`);
  }
});

test("the access mode refuses a write or a read with error 8", async () => {
  const readOnly = newFile("hello");
  const written = await run(openWriteClose({ access: ACCESS.readOnly }), { file: pathFromText(readOnly), text: "XY" });
  assert.deepEqual(written.writeError, { status: true, code: 8, source: sourceOf("Write to Text File", readOnly) });
  assert.equal(readFileSync(readOnly, "latin1"), "hello");
  const writeOnly = newFile("hello");
  const read = await run(openReadClose({ access: ACCESS.writeOnly }), { file: pathFromText(writeOnly) });
  assert.deepEqual(read.readError, { status: true, code: 8, source: sourceOf("Read from Text File", writeOnly) });
  assert.equal(read.text, "");
});

test("Close File of a closed refnum is error 1, and an unwired file answers as a cancelled dialog", async () => {
  const name = newFile("hello");
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.node("close", "close-file");
    b.node("closeAgain", "close-file");
    b.node("text", "str-const", { value: "x" });
    b.node("unwired", "write-to-text-file");
    b.node("unwiredCancelled", "bool-indicator");
    errorIndicator(b, "closeAgainError");
    errorIndicator(b, "unwiredError");
    b.wire("file.result", "open.file-path");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("open.refnum-out", "closeAgain.refnum");
    b.wire("close.error-out", "closeAgain.error-in");
    b.wire("closeAgain.error-out", "closeAgainError.value");
    b.wire("text.result", "unwired.text");
    b.wire("unwired.cancelled", "unwiredCancelled.value");
    b.wire("unwired.error-out", "unwiredError.value");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.deepEqual(shown.closeAgainError, { status: true, code: 1, source: "Close File" }, "no path in its source (measured)");
  assert.equal(shown.unwiredCancelled, true);
  assert.deepEqual(shown.unwiredError, { status: true, code: 43, source: sourceOf("Write to Text File", "<Not A Path>") });
});

test("with an error in, a file function does nothing and passes the error on", async () => {
  const name = newFile("hello");
  const incoming = { status: true, code: 5, source: "my source" };
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("incoming", "error-cluster-constant", { value: incoming });
    b.node("text", "str-const", { value: "XY" });
    b.node("write", "write-to-text-file");
    errorIndicator(b, "writeError");
    b.wire("file.result", "write.file");
    b.wire("incoming.result", "write.error-in");
    b.wire("text.result", "write.text");
    b.wire("write.error-out", "writeError.value");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.deepEqual(shown.writeError, incoming);
  assert.equal(readFileSync(name, "latin1"), "hello");
});

test("Get File Size of an open file, and Not A Number/Path/Refnum? on a file refnum", async () => {
  const name = newFile("ab\r\ncd\r\n");
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.node("size", "get-file-size");
    b.node("close", "close-file");
    b.node("shownSize", "indicator", { type: "u64" });
    b.node("isNotARefnum", "not-a-number-path-refnum");
    b.node("notARefnum", "bool-indicator");
    b.wire("file.result", "open.file-path");
    b.wire("open.refnum-out", "size.file");
    b.wire("open.error-out", "size.error-in");
    b.wire("size.refnum-out", "close.refnum");
    b.wire("size.size", "shownSize.value");
    b.wire("open.refnum-out", "isNotARefnum.number");
    b.wire("isNotARefnum.result", "notARefnum.value");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.equal(Number(shown.shownSize), 8);
  assert.equal(shown.notARefnum, false);
});

test("a Run reaches the files through a message port to the I/O, as in the editor", async () => {
  const { port1, port2 } = new MessageChannel();
  serveSolderIo(loadSolderIo(), { onRequest: (listener) => (port2.onmessage = ({ data }) => listener(data)), answer: (message) => port2.postMessage(message) });
  const io = createIoClient(port1);
  try {
    const name = newFile("ab\r\ncd\r\n");
    const shown = await run(openReadClose({ count: 3 }), { file: pathFromText(name) }, { io });
    assert.equal(shown.text, "ab\n");
  } finally {
    io.disconnect();
    port2.close();
  }
});

/** Get File Size on the path control "file", its refnum out closed afterwards. */
const sizeByPath = () =>
  buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("size", "get-file-size");
    b.node("close", "close-file");
    b.node("shownSize", "indicator", { type: "i64" });
    errorIndicator(b, "sizeError");
    errorIndicator(b, "closeError");
    b.wire("file.result", "size.file");
    b.wire("size.refnum-out", "close.refnum");
    b.wire("size.size", "shownSize.value");
    b.wire("size.error-out", "sizeError.value");
    b.wire("close.error-out", "closeError.value");
  });

test("Get File Size by path opens the file, with LabVIEW's codes for what it cannot open", async () => {
  const existing = newFile("hello");
  const missing = join(folder, "missing.txt");
  const measured = [
    [pathFromText(existing), 5, NO_ERROR],
    [pathFromText(missing), 0, { status: true, code: 7, source: sourceOf("Get File Size", missing) }],
    [pathFromText(folder), 0, { status: true, code: 1059, source: sourceOf("Get File Size", folder) }],
    [EMPTY_PATH, 0, { status: true, code: 1430, source: sourceOf("Get File Size", "") }],
    [NOT_A_PATH, 0, { status: true, code: 1430, source: sourceOf("Get File Size", "<Not A Path>") }],
  ];
  for (const [file, size, error] of measured) {
    const shown = await run(sizeByPath(), { file });
    assert.equal(Number(shown.shownSize), size, error.source);
    assert.deepEqual(shown.sizeError, error, error.source);
    // The refnum out is open when the size came, and Not A Refnum when it did not: Close File says so (measured).
    assert.equal(shown.closeError.code, error.status ? 1 : 0, error.source);
  }
});

test("Get File Size of a closed refnum is error 1 with no file in its source", async () => {
  const name = newFile("hello");
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.node("close", "close-file");
    b.node("size", "get-file-size");
    errorIndicator(b, "sizeError");
    b.wire("file.result", "open.file-path");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("open.refnum-out", "size.file");
    b.wire("close.error-out", "size.error-in");
    b.wire("size.error-out", "sizeError.value");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.deepEqual(shown.sizeError, { status: true, code: 1, source: "Get File Size" });
});

/** Delete of the path control "file", with the Booleans given. */
const deleteOf = ({ entireHierarchy = false, confirm = false } = {}) =>
  buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("entireHierarchy", "bool-const", { value: entireHierarchy });
    b.node("confirm", "bool-const", { value: confirm });
    b.node("delete", "delete");
    b.node("deletedPath", "path-indicator");
    b.node("cancelled", "bool-indicator");
    errorIndicator(b, "deleteError");
    b.wire("entireHierarchy.result", "delete.entire-hierarchy");
    b.wire("confirm.result", "delete.confirm");
    b.wire("delete.deleted-path", "deletedPath.value");
    b.wire("delete.cancelled", "cancelled.value");
    b.wire("delete.error-out", "deleteError.value");
    b.wire("file.result", "delete.path");
  });

test("Delete gives LabVIEW's deleted path, cancelled and codes", async () => {
  const deletedFile = newFile("hello");
  const missing = join(folder, "gone.txt");
  const emptyFolder = mkdtempSync(join(folder, "empty-"));
  const fullFolder = mkdtempSync(join(folder, "full-"));
  writeFileSync(join(fullFolder, "a.txt"), "a");
  const measured = [
    [deletedFile, {}, pathFromText(deletedFile), false, NO_ERROR],
    [missing, {}, pathFromText(missing), false, { status: true, code: 7, source: sourceOf("Delete", missing) }],
    [emptyFolder, {}, pathFromText(emptyFolder), false, NO_ERROR],
    [fullFolder, {}, pathFromText(fullFolder), false, { status: true, code: 6, source: sourceOf("Delete", fullFolder) }],
    [fullFolder, { entireHierarchy: true }, pathFromText(fullFolder), false, NO_ERROR],
  ];
  for (const [name, booleans, deletedPath, cancelled, error] of measured) {
    const shown = await run(deleteOf(booleans), { file: pathFromText(name) });
    const label = `${name} ${JSON.stringify(booleans)}`;
    assert.deepEqual(shown.deletedPath, deletedPath, label);
    assert.equal(shown.cancelled, cancelled, label);
    assert.deepEqual(shown.deleteError, error, label);
    // What failed is kept (measured: a folder that is not empty stays with its contents).
    assert.equal(existsSync(name), error.status && error.code !== 7, label);
  }
  const notAPath = await run(deleteOf(), { file: NOT_A_PATH });
  assert.deepEqual(notAPath.deletedPath, EMPTY_PATH);
  assert.deepEqual(notAPath.deleteError, { status: true, code: 1430, source: sourceOf("Delete", "<Not A Path>") });
});

test("Delete keeps a file that is open (error 5) and, until the dialogs, one it must confirm (error 43)", async () => {
  const name = newFile("hello");
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.node("delete", "delete");
    b.node("clear", "clear-errors");
    b.node("close", "close-file");
    errorIndicator(b, "deleteError");
    b.wire("file.result", "open.file-path");
    b.wire("file.result", "delete.path");
    b.wire("open.error-out", "delete.error-in");
    b.wire("delete.error-out", "deleteError.value");
    b.wire("delete.error-out", "clear.error-in");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("clear.error-out", "close.error-in");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.deepEqual(shown.deleteError, { status: true, code: 5, source: sourceOf("Delete", name) });
  assert.equal(existsSync(name), true);

  const confirmed = await run(deleteOf({ confirm: true }), { file: pathFromText(name) });
  assert.equal(confirmed.cancelled, true);
  assert.deepEqual(confirmed.deleteError, { status: true, code: 43, source: sourceOf("Delete", name) });
  assert.equal(existsSync(name), true);
});

test("Read Lines with count unwired gives a string with the next line and its end of line", async () => {
  for (const [content, line] of [["ab\r\ncd\r\n", "ab\n"], ["a\n\rb", "a\n"]]) {
    const name = newFile(content);
    const shown = await run(openReadClose({ readLines: true }), { file: pathFromText(name) });
    assert.equal(shown.text, line, JSON.stringify(content));
    assert.deepEqual(shown.readError, NO_ERROR);
  }
});

test("an array of strings ends every element with the system's end of line even with Convert EOL off", async () => {
  const name = newFile();
  await run(openWriteClose({ operation: OPERATION.replaceOrCreate, lines: true, convertEol: false }), { file: pathFromText(name), text: ["a\rb", "y"] });
  assert.equal(readFileSync(name, "latin1"), `a\rb${SYSTEM_END_OF_LINE}y${SYSTEM_END_OF_LINE}`, "measured: 61 0d 62 0d 0a 79 0d 0a");
});

test("a relative path is error 1430 and nothing is created", async () => {
  const shown = await run(openThenClose(OPERATION.openOrCreate), { file: pathFromText("relnew.txt") });
  assert.deepEqual(shown.openError, { status: true, code: 1430, source: sourceOf("Open/Create/Replace File", "relnew.txt") });
  assert.equal(existsSync("relnew.txt"), false);
});

test("Write and Read on a closed refnum are error 1 with no file, and Write with an error in gives Not A Refnum", async () => {
  const name = newFile("hello");
  const incoming = { status: true, code: 5, source: "src" };
  const vi = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.node("close", "close-file");
    b.node("text", "str-const", { value: "XY" });
    b.node("write", "write-to-text-file");
    b.node("read", "read-from-text-file");
    b.node("reopen", "open-create-replace-file");
    b.node("incoming", "error-cluster-constant", { value: incoming });
    b.node("writeWithError", "write-to-text-file");
    b.node("readWithError", "read-from-text-file");
    b.node("writeRefnumGone", "not-a-number-path-refnum");
    b.node("readRefnumGone", "not-a-number-path-refnum");
    b.node("writeGone", "bool-indicator");
    b.node("readGone", "bool-indicator");
    errorIndicator(b, "writeError");
    errorIndicator(b, "readError");
    b.wire("file.result", "open.file-path");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("open.refnum-out", "write.file");
    b.wire("close.error-out", "write.error-in");
    b.wire("text.result", "write.text");
    b.wire("open.refnum-out", "read.file");
    b.wire("close.error-out", "read.error-in");
    b.wire("write.error-out", "writeError.value");
    b.wire("read.error-out", "readError.value");
    b.wire("file.result", "reopen.file-path");
    b.wire("reopen.refnum-out", "writeWithError.file");
    b.wire("incoming.result", "writeWithError.error-in");
    b.wire("text.result", "writeWithError.text");
    b.wire("reopen.refnum-out", "readWithError.file");
    b.wire("incoming.result", "readWithError.error-in");
    b.wire("writeWithError.refnum-out", "writeRefnumGone.number");
    b.wire("readWithError.refnum-out", "readRefnumGone.number");
    b.wire("writeRefnumGone.result", "writeGone.value");
    b.wire("readRefnumGone.result", "readGone.value");
    // Wired, so that LabVIEW's automatic error handling does not stop the Run on them.
    errorIndicator(b, "writeWithErrorOut");
    errorIndicator(b, "readWithErrorOut");
    b.wire("writeWithError.error-out", "writeWithErrorOut.value");
    b.wire("readWithError.error-out", "readWithErrorOut.value");
  });
  const shown = await run(vi, { file: pathFromText(name) });
  assert.deepEqual(shown.writeError, { status: true, code: 1, source: "Write to Text File" });
  assert.deepEqual(shown.readError, { status: true, code: 1, source: "Read from Text File" });
  assert.equal(shown.writeGone, true, "Write with an error in gives Not A Refnum (measured)");
  assert.equal(shown.readGone, false, "Read with an error in passes its refnum (measured)");
  assert.equal(readFileSync(name, "latin1"), "hello");
});

test("the files a Run leaves open are closed when it finishes", async () => {
  const name = newFile("hello");
  const leaveOpen = buildVI(CAT, (b) => {
    b.node("file", "path-control");
    b.node("open", "open-create-replace-file");
    b.wire("file.result", "open.file-path");
  });
  await run(leaveOpen, { file: pathFromText(name) });
  const shown = await run(deleteOf(), { file: pathFromText(name) });
  assert.deepEqual(shown.deleteError, NO_ERROR, "an open file would be error 5");
  assert.equal(existsSync(name), false);
});
