// The system's dialogs that answer a Run's file dialogs (DT-067, amendment of 2026-10-29): each mode is the
// Electron dialog that behaves as LabVIEW's, with its title, "OK", every file and the last folder.

import assert from "node:assert/strict";
import { test } from "node:test";

import { chosenFileOf, confirmationBoxFor, confirmedBy, folderAfter, systemDialogFor } from "../../editor/electron/file-dialog-options.mjs";
import { DIALOG_MODE } from "../../core/runtime/file-dialogs.mjs";

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
