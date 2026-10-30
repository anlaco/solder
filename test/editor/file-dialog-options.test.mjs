// The system's dialogs that answer a Run's file dialogs (DT-067, amendment of 2026-10-29): each mode is the
// Electron dialog that behaves as LabVIEW's, with its title, "OK", every file and the last folder.

import assert from "node:assert/strict";
import { test } from "node:test";

import { chosenFileOf, chosenFilesOf, confirmationBoxFor, confirmedBy, fileDialogFor, folderAfter, systemDialogFor } from "../../editor/electron/file-dialog-options.mjs";
import { DIALOG_MODE, fileDialogRequest } from "../../core/runtime/file-dialogs.mjs";

const FOLDER = "/home/user/data";
const common = (title) => ({ title, defaultPath: FOLDER, buttonLabel: "OK", filters: [{ name: "All Files", extensions: ["*"] }] });

test("existing is an open dialog, new a save dialog that asks before an existing file, any one that does not", () => {
  assert.deepEqual(systemDialogFor({ title: "Read", mode: DIALOG_MODE.EXISTING }, FOLDER), { kind: "open", options: { ...common("Read"), properties: ["openFile"] } });
  assert.deepEqual(systemDialogFor({ title: "Write", mode: DIALOG_MODE.NEW }, FOLDER), { kind: "save", options: { ...common("Write"), properties: ["showOverwriteConfirmation"] } });
  assert.deepEqual(systemDialogFor({ title: "Any", mode: DIALOG_MODE.ANY }, FOLDER), { kind: "save", options: common("Any") });
  assert.throws(() => systemDialogFor({ title: "?", mode: "folder" }, FOLDER), /Unknown file dialog mode/);
});

test("the answer is the file chosen or null for Cancel, and the next dialog opens in its folder", () => {
  assert.equal(chosenFileOf("open", { canceled: false, filePaths: ["/a/b.txt"] }), "/a/b.txt");
  assert.equal(chosenFileOf("save", { canceled: false, filePath: "/a/c.txt" }), "/a/c.txt");
  assert.equal(chosenFileOf("open", { canceled: true, filePaths: [] }), null);
  assert.equal(chosenFileOf("save", { canceled: false, filePath: "" }), null);
  assert.equal(folderAfter("/a/b.txt"), "/a");
});

test("a confirmation is a message box with no title, OK by default and Cancel", () => {
  const box = confirmationBoxFor({ message: "/a/b.txt", detail: "This file already exists.\nDo you want to replace it?" });
  assert.equal(box.title, "");
  assert.deepEqual(box.buttons, ["OK", "Cancel"]);
  assert.equal(box.defaultId, 0);
  assert.equal(box.cancelId, 1);
  assert.equal(confirmedBy({ response: 0 }), true);
  assert.equal(confirmedBy({ response: 1 }), false);
});

const requestOf = (config, inputs = {}) => fileDialogRequest({ selection: "file", existence: "new-or-existing", multiple: false, ...config }, inputs);

test("File Dialog's modes are the open, save or folder dialog that behaves as LabVIEW's", () => {
  assert.equal(fileDialogFor(requestOf({ existence: "existing" }), FOLDER).kind, "open");
  assert.deepEqual(fileDialogFor(requestOf({ existence: "new" }), FOLDER).options.properties, ["showOverwriteConfirmation"]);
  assert.equal(fileDialogFor(requestOf({}), FOLDER).kind, "save");
  assert.equal(fileDialogFor(requestOf({}), FOLDER).options.properties, undefined, "new or existing asks nothing (measured)");
  assert.deepEqual(fileDialogFor(requestOf({ multiple: true, existence: "existing" }), FOLDER).options.properties, ["openFile", "multiSelections"]);
  assert.deepEqual(fileDialogFor(requestOf({ selection: "folder", existence: "existing" }), FOLDER).options.properties, ["openDirectory"]);
  assert.deepEqual(fileDialogFor(requestOf({ selection: "folder" }), FOLDER).options.properties, ["openDirectory", "createDirectory", "promptToCreate"]);
});

test("File Dialog's title, button, proposed name and filters reach the system's dialog", () => {
  const { options } = fileDialogFor(requestOf({}, { prompt: "Pick", buttonLabel: "Pick it", pattern: "*.txt", patternLabel: "Text" }), FOLDER, "proposal.txt");
  assert.equal(options.title, "Pick");
  assert.equal(options.buttonLabel, "Pick it");
  assert.equal(options.defaultPath, `${FOLDER}/proposal.txt`);
  assert.deepEqual(options.filters, [{ name: "Text (*.txt)", extensions: ["txt"] }, { name: "All Files", extensions: ["*"] }]);
  assert.deepEqual(chosenFilesOf("open", { canceled: false, filePaths: ["/a", "/b"] }), ["/a", "/b"]);
  assert.equal(chosenFilesOf("save", { canceled: true }), null);
});
