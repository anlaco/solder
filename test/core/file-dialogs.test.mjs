// The dialogs of the file functions (DT-067, amendment of 2026-10-29): an unwired path input asks the Run's
// `dialogs` host with the title and mode LabVIEW uses, and the function goes on with the file chosen or gives
// LabVIEW's outputs for a Cancel; op 5 and Delete's confirm ask before they replace or delete. The host here is
// scripted. Values measured in LabVIEW on Windows: labview-captures/reports/2026-10-29-file-dialogs.md and
// 2026-10-29-file-dialog-express.md §8–§10.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { DIALOG_MODE, fileDialogOf } from "../../core/runtime/file-dialogs.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { NOT_A_PATH, hostPathRules, pathFromText } from "../../core/model/paths.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const OPERATION = { open: 0, replace: 1, create: 2, openOrCreate: 3, replaceOrCreate: 4, replaceOrCreateWithConfirmation: 5 };
const NO_ERROR = { status: false, code: 0, source: "" };
const CANCELLED = 43;
const ALREADY_EXISTS = 10;

const folder = mkdtempSync(join(tmpdir(), "solder-file-dialogs-"));
after(() => rmSync(folder, { recursive: true, force: true }));

let fileCount = 0;
/** A new file name in the test's folder, with `content` written to it unless it is undefined. */
function newFile(content) {
  const name = join(folder, `d${fileCount++}.txt`);
  if (content !== undefined) writeFileSync(name, content);
  return name;
}
const pathOf = (name) => pathFromText(name, hostPathRules());

/**
 * A scripted `dialogs` host: `chosen` is what every file dialog answers (a file name, or `null` for Cancel), and
 * `confirmed` what every confirmation answers. It keeps what it was asked.
 */
function scriptedDialogs({ chosen = null, confirmed = false } = {}) {
  const asked = { files: [], confirmations: [] };
  return {
    asked,
    chooseFile: async (request) => {
      asked.files.push(request);
      return chosen;
    },
    confirm: async (question) => {
      asked.confirmations.push(question);
      return confirmed;
    },
  };
}

/** Runs `vi` with solder-io and `dialogs`; the writes come back by the names `vi` gave its nodes. */
async function run(vi, dialogs, values = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, { io: loadSolderIo(), dialogs });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

const errorIndicator = (b, name) => b.node(name, "cluster-indicator", { type: ERROR, style: "error-out" });

/** Open/Create/Replace File with `operation`, its path wired from the control "file" or unwired, then Close File. */
const openThenClose = ({ operation, pathWired = false, prompt }) =>
  buildVI(CAT, (b) => {
    b.node("operation", "const", { value: operation, type: "u16" });
    b.node("open", "open-create-replace-file");
    b.node("close", "close-file");
    b.node("isNotARefnum", "not-a-number-path-refnum");
    b.node("notARefnum", "bool-indicator");
    b.node("cancelled", "bool-indicator");
    b.node("closedPath", "path-indicator");
    errorIndicator(b, "openError");
    errorIndicator(b, "closeError");
    if (pathWired) {
      b.node("file", "path-control");
      b.wire("file.result", "open.file-path");
    }
    if (prompt !== undefined) {
      b.node("prompt", "str-const", { value: prompt });
      b.wire("prompt.result", "open.prompt");
    }
    b.wire("operation.result", "open.operation");
    b.wire("open.refnum-out", "close.refnum");
    b.wire("open.error-out", "close.error-in");
    b.wire("close.error-out", "closeError.value");
    b.wire("open.refnum-out", "isNotARefnum.number");
    b.wire("isNotARefnum.result", "notARefnum.value");
    b.wire("open.cancelled", "cancelled.value");
    b.wire("open.error-out", "openError.value");
    b.wire("close.path", "closedPath.value");
  });

test("each function asks with the title and mode LabVIEW uses, and a wired prompt is the title", () => {
  const measured = [
    [["Open/Create/Replace File", { operation: OPERATION.open }], "Choose or enter path of file to open", DIALOG_MODE.EXISTING],
    [["Open/Create/Replace File", { operation: OPERATION.replace }], "Choose or enter path of file to replace", DIALOG_MODE.EXISTING],
    [["Open/Create/Replace File", { operation: OPERATION.create }], "Enter path of file to create", DIALOG_MODE.NEW],
    [["Open/Create/Replace File", { operation: OPERATION.openOrCreate }], "Choose or enter path of file to open or create", DIALOG_MODE.ANY],
    [["Open/Create/Replace File", { operation: OPERATION.replaceOrCreate }], "Choose or enter path of file to replace or create", DIALOG_MODE.ANY],
    [["Open/Create/Replace File", { operation: OPERATION.replaceOrCreateWithConfirmation }], "Choose or enter path of file to replace or create", DIALOG_MODE.NEW],
    [["Write to Text File"], "Choose or enter path of text file to write", DIALOG_MODE.NEW],
    [["Read from Text File"], "Choose or enter path of text file to read", DIALOG_MODE.EXISTING],
    [["Write Delimited Spreadsheet"], "Choose file to write.", DIALOG_MODE.ANY],
    [["Read Delimited Spreadsheet"], "Choose file to read.", DIALOG_MODE.EXISTING],
    [["Delete"], "Choose or enter path of file to delete", DIALOG_MODE.EXISTING],
  ];
  for (const [[functionName, options], title, mode] of measured) assert.deepEqual(fileDialogOf(functionName, options), { title, mode }, functionName);
  assert.equal(fileDialogOf("Write to Text File", { prompt: "My prompt" }).title, "My prompt");
});

test("Open/Create/Replace File unwired opens the file chosen with its operation", async () => {
  const name = newFile("hello");
  const dialogs = scriptedDialogs({ chosen: name });
  const shown = await run(openThenClose({ operation: OPERATION.replace, prompt: "My prompt" }), dialogs);
  assert.deepEqual(dialogs.asked.files, [{ title: "My prompt", mode: DIALOG_MODE.EXISTING }]);
  assert.deepEqual(shown.openError, NO_ERROR);
  assert.equal(shown.cancelled, false);
  assert.equal(shown.notARefnum, false);
  assert.deepEqual(shown.closedPath, pathOf(name), "the refnum names the file chosen (measured)");
  assert.equal(readFileSync(name, "latin1"), "", "op 1 replaces without asking (measured)");
});

test("a cancelled Open/Create/Replace File dialog gives cancelled, Not A Refnum and a source with no file", async () => {
  const shown = await run(openThenClose({ operation: OPERATION.open }), scriptedDialogs());
  assert.equal(shown.cancelled, true);
  assert.equal(shown.notARefnum, true);
  assert.deepEqual(shown.openError, { status: true, code: CANCELLED, source: "Open/Create/Replace File" });
});

test("after the dialog op 5 does not ask again, and op 2 on an existing file is error 10", async () => {
  const replaced = newFile("hello");
  const dialogs = scriptedDialogs({ chosen: replaced });
  const shown = await run(openThenClose({ operation: OPERATION.replaceOrCreateWithConfirmation }), dialogs);
  assert.deepEqual(shown.openError, NO_ERROR);
  assert.deepEqual(dialogs.asked.confirmations, [], "the system's question took the place of LabVIEW's (measured)");
  assert.equal(readFileSync(replaced, "latin1"), "");

  const kept = newFile("hello");
  const created = await run(openThenClose({ operation: OPERATION.create }), scriptedDialogs({ chosen: kept }));
  assert.deepEqual(created.openError, { status: true, code: ALREADY_EXISTS, source: `Open/Create/Replace File<APPEND>\n${kept}` });
  assert.equal(readFileSync(kept, "latin1"), "hello");
});

test("op 5 on a wired path that exists asks, and replaces on OK or cancels with the path", async () => {
  const name = newFile("hello");
  const refused = scriptedDialogs({ confirmed: false });
  const cancelled = await run(openThenClose({ operation: OPERATION.replaceOrCreateWithConfirmation, pathWired: true }), refused, { file: pathOf(name) });
  assert.deepEqual(refused.asked.confirmations, [{ message: name, detail: "This file already exists.\nDo you want to replace it?" }]);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.notARefnum, true);
  assert.deepEqual(cancelled.openError, { status: true, code: CANCELLED, source: `Open/Create/Replace File<APPEND>\n${name}` });
  assert.equal(readFileSync(name, "latin1"), "hello");

  const replaced = await run(openThenClose({ operation: OPERATION.replaceOrCreateWithConfirmation, pathWired: true }), scriptedDialogs({ confirmed: true }), { file: pathOf(name) });
  assert.deepEqual(replaced.openError, NO_ERROR);
  assert.equal(replaced.cancelled, false);
  assert.equal(readFileSync(name, "latin1"), "");
});

/** Write to Text File of "XY" with its file unwired, and Read from Text File with its file unwired. */
const writeAndRead = () =>
  buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "XY" });
    b.node("write", "write-to-text-file");
    b.node("read", "read-from-text-file");
    b.node("writeCancelled", "bool-indicator");
    b.node("readText", "str-indicator");
    errorIndicator(b, "writeError");
    errorIndicator(b, "readError");
    b.wire("text.result", "write.text");
    b.wire("write.cancelled", "writeCancelled.value");
    b.wire("write.error-out", "writeError.value");
    // Read after Write, by the error wire.
    b.wire("write.error-out", "read.error-in");
    b.wire("read.text", "readText.value");
    b.wire("read.error-out", "readError.value");
  });

test("Write and Read Text File unwired work on the file chosen, and a Cancel names Not A Path", async () => {
  const name = newFile();
  const dialogs = scriptedDialogs({ chosen: name });
  const shown = await run(writeAndRead(), dialogs);
  assert.deepEqual(dialogs.asked.files.map(({ mode }) => mode), [DIALOG_MODE.NEW, DIALOG_MODE.EXISTING]);
  assert.deepEqual(shown.writeError, NO_ERROR);
  assert.deepEqual(shown.readError, NO_ERROR);
  assert.equal(shown.readText, "XY");

  const cancelled = await run(writeAndRead(), scriptedDialogs());
  assert.equal(cancelled.writeCancelled, true);
  assert.deepEqual(cancelled.writeError, { status: true, code: CANCELLED, source: "Write to Text File<APPEND>\n<Not A Path>" });
});

/** Delete with its path unwired, `confirm` as given. */
const deleteUnwired = (confirm = false) =>
  buildVI(CAT, (b) => {
    b.node("confirm", "bool-const", { value: confirm });
    b.node("delete", "delete");
    b.node("deletedPath", "path-indicator");
    b.node("cancelled", "bool-indicator");
    errorIndicator(b, "deleteError");
    b.wire("confirm.result", "delete.confirm");
    b.wire("delete.deleted-path", "deletedPath.value");
    b.wire("delete.cancelled", "cancelled.value");
    b.wire("delete.error-out", "deleteError.value");
  });

test("Delete unwired deletes the file chosen, and a Cancel gives Not A Path and a source with no file", async () => {
  const name = newFile("hello");
  const shown = await run(deleteUnwired(), scriptedDialogs({ chosen: name }));
  assert.deepEqual(shown.deleteError, NO_ERROR);
  assert.deepEqual(shown.deletedPath, pathOf(name));
  assert.equal(existsSync(name), false);

  const cancelled = await run(deleteUnwired(), scriptedDialogs());
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.deletedPath, NOT_A_PATH);
  assert.deepEqual(cancelled.deleteError, { status: true, code: CANCELLED, source: "Delete" });
});

test("Delete with confirm asks \"Delete <path>?\" and deletes only on OK", async () => {
  const name = newFile("hello");
  const refused = scriptedDialogs({ chosen: name, confirmed: false });
  const kept = await run(deleteUnwired(true), refused);
  assert.deepEqual(refused.asked.confirmations, [{ message: `Delete ${name}?`, detail: "" }]);
  assert.equal(kept.cancelled, true);
  assert.deepEqual(kept.deleteError, { status: true, code: CANCELLED, source: `Delete<APPEND>\n${name}` });
  assert.equal(existsSync(name), true);

  const deleted = await run(deleteUnwired(true), scriptedDialogs({ chosen: name, confirmed: true }));
  assert.deepEqual(deleted.deleteError, NO_ERROR);
  assert.equal(existsSync(name), false);
});

test("Write and Read Delimited Spreadsheet unwired use the file chosen and give it as new file path", async () => {
  const name = newFile("old");
  const write = buildVI(CAT, (b) => {
    b.node("write", "write-delimited-spreadsheet-vi");
    b.node("data", "arr-control", { type: { array: "number", dims: 2 } });
    b.node("newPath", "path-indicator");
    errorIndicator(b, "error");
    b.wire("data.result", "write.2d-data");
    b.wire("write.new-file-path", "newPath.value");
    b.wire("write.error-out", "error.value");
  });
  const dialogs = scriptedDialogs({ chosen: name });
  const written = await run(write, dialogs, { data: [[1, 2]] });
  assert.deepEqual(dialogs.asked.files, [{ title: "Choose file to write.", mode: DIALOG_MODE.ANY }]);
  assert.deepEqual(written.error, NO_ERROR);
  assert.deepEqual(written.newPath, pathOf(name));
  assert.match(readFileSync(name, "latin1"), /^1\.000\t2\.000/, "replaced with no question (measured)");

  const read = buildVI(CAT, (b) => {
    b.node("read", "read-delimited-spreadsheet-vi");
    b.node("newPath", "path-indicator");
    b.node("all", "arr-indicator", { type: { array: "number", dims: 2 } });
    errorIndicator(b, "error");
    b.wire("read.new-file-path", "newPath.value");
    b.wire("read.all-rows", "all.value");
    b.wire("read.error-out", "error.value");
  });
  const shown = await run(read, scriptedDialogs({ chosen: name }));
  assert.deepEqual(shown.error, NO_ERROR);
  assert.deepEqual(shown.newPath, pathOf(name));
  assert.deepEqual(shown.all, [[1, 2]]);
});

/** A File Dialog configured with `config`, its prompt wired when given, its outputs to indicators; `errorIn` wired when given. */
const fileDialogVI = ({ config = {}, prompt, pattern, patternLabel, errorIn } = {}) =>
  buildVI(CAT, (b) => {
    b.node("dialog", "file-dialog", { ...config, configured: true });
    const several = Boolean(config.multiple);
    b.node("selected", several ? "arr-indicator" : "path-indicator", several ? { type: { array: "path" } } : undefined);
    b.node("exists", "bool-indicator");
    b.node("cancelled", "bool-indicator");
    errorIndicator(b, "error");
    b.wire("dialog.selected-path", "selected.value");
    b.wire("dialog.exists", "exists.value");
    b.wire("dialog.cancelled", "cancelled.value");
    b.wire("dialog.error-out", "error.value");
    for (const [port, value] of [["prompt", prompt], ["pattern", pattern], ["pattern-label", patternLabel]]) {
      if (value === undefined) continue;
      b.node(port, "str-const", { value });
      b.wire(`${port}.result`, `dialog.${port}`);
    }
    if (errorIn) {
      b.node("incoming", "error-cluster-constant", { value: errorIn });
      b.wire("incoming.result", "dialog.error-in");
    }
  });

/** A scripted host whose File Dialog answers `answer` (`{ paths, exists }` or `null`) and keeps what it was asked. */
function scriptedFileDialog(answer) {
  const asked = [];
  return { ...scriptedDialogs(), asked, fileDialog: async (request) => (asked.push(request), answer) };
}

test("File Dialog asks with LabVIEW's title for its selection mode, its button and its filters", async () => {
  const titles = [
    [{}, "Choose or Enter Path of File"],
    [{ selection: "folder" }, "Choose or Enter Path of Folder"],
    [{ selection: "file-or-folder" }, "Choose or Enter Path of Folder or File"],
    [{ multiple: true }, "Choose or Enter Path of File(s)"],
  ];
  for (const [config, title] of titles) {
    const dialogs = scriptedFileDialog(null);
    await run(fileDialogVI({ config }), dialogs);
    assert.equal(dialogs.asked[0].title, title, JSON.stringify(config));
    assert.equal(dialogs.asked[0].buttonLabel, "OK");
  }
  const dialogs = scriptedFileDialog(null);
  await run(fileDialogVI({ prompt: "My prompt", pattern: "*.txt;*.csv", patternLabel: "Data" }), dialogs);
  assert.equal(dialogs.asked[0].title, "My prompt");
  assert.deepEqual(dialogs.asked[0].filters, [{ name: "Data (*.txt;*.csv)", extensions: ["txt", "csv"] }, { name: "All Files", extensions: ["*"] }]);
});

test("File Dialog gives the path chosen and whether it exists, and a Cancel LabVIEW's outputs", async () => {
  const name = newFile("x");
  const chosen = await run(fileDialogVI(), scriptedFileDialog({ paths: [name], exists: true }));
  assert.deepEqual(chosen.selected, pathOf(name));
  assert.equal(chosen.exists, true);
  assert.equal(chosen.cancelled, false);
  assert.deepEqual(chosen.error, NO_ERROR);

  const cancelled = await run(fileDialogVI(), scriptedFileDialog(null));
  assert.deepEqual(cancelled.selected, NOT_A_PATH);
  assert.equal(cancelled.exists, false);
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.error, { status: true, code: CANCELLED, source: "File Dialog\r\n" }, "measured: `File Dialog->fd.vi` and CR LF");
});

test("File Dialog with several items gives an array, empty on a Cancel", async () => {
  const [first, second] = [newFile("a"), newFile("b")];
  const shown = await run(fileDialogVI({ config: { multiple: true, existence: "existing" } }), scriptedFileDialog({ paths: [first, second], exists: true }));
  assert.deepEqual(shown.selected, [pathOf(first), pathOf(second)]);
  const cancelled = await run(fileDialogVI({ config: { multiple: true } }), scriptedFileDialog(null));
  assert.deepEqual(cancelled.selected, []);
});

test("File Dialog with an error in shows no dialog; a warning passes on an OK and a Cancel replaces it", async () => {
  const error = { status: true, code: 5000, source: "x" };
  const dialogs = scriptedFileDialog({ paths: ["/a"], exists: true });
  const withError = await run(fileDialogVI({ errorIn: error }), dialogs);
  assert.equal(dialogs.asked.length, 0);
  assert.deepEqual(withError.error, error);
  assert.deepEqual(withError.selected, NOT_A_PATH);
  assert.equal(withError.cancelled, false);

  const warning = { status: false, code: 5000, source: "w" };
  const name = newFile("x");
  assert.deepEqual((await run(fileDialogVI({ errorIn: warning }), scriptedFileDialog({ paths: [name], exists: true }))).error, warning);
  assert.equal((await run(fileDialogVI({ errorIn: warning }), scriptedFileDialog(null))).error.code, CANCELLED);
});
