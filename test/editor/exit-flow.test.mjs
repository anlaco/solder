// File ▸ Exit (Ctrl+Q): LabVIEW asks about each VI with unsaved changes and
// then quits, with no blank VI afterwards (labview-captures/editor-checks/REPORT.md §3).

import assert from "node:assert/strict";
import { test } from "node:test";

import { EXIT_ANSWERS, EXIT_BUTTONS, EXIT_BUTTON_ANSWERS, confirmExit, exitDialogText } from "../../editor/electron/exit-flow.mjs";

/** An open VI as the flow sees it, and a record of what was asked and saved. */
function scenario(vis, answers, { saveWorks = true } = {}) {
  const asked = [];
  const saved = [];
  const hooks = {
    isDirty: (vi) => vi.dirty,
    ask: async (vi) => {
      asked.push(vi.name);
      return answers[vi.name];
    },
    save: async (vi) => {
      saved.push(vi.name);
      return saveWorks;
    },
  };
  return { run: () => confirmExit(vis, hooks), asked, saved };
}

test("the Exit dialog has LabVIEW's texts and buttons", () => {
  assert.deepEqual(exitDialogText("Untitled 3"), {
    title: "Save changes? (Exit)",
    message: "Untitled 3 has unsaved changes.",
    detail: "Untitled 3 is about to leave memory. Its unsaved changes will be lost.",
  });
  assert.deepEqual(EXIT_BUTTONS, ["Save", "Don't Save", "Cancel"]);
  assert.deepEqual(EXIT_BUTTON_ANSWERS, [EXIT_ANSWERS.save, EXIT_ANSWERS.dontSave, EXIT_ANSWERS.cancel]);
});

test("Exit with every VI saved quits at once, without a question", async () => {
  const exit = scenario([{ name: "add2.vi", dirty: false }], {});
  assert.equal(await exit.run(), true);
  assert.deepEqual(exit.asked, []);
});

test("Exit asks only about the VIs with unsaved changes, and Don't Save lets the application quit", async () => {
  const exit = scenario([{ name: "Untitled 3", dirty: true }, { name: "add2.vi", dirty: false }], { "Untitled 3": EXIT_ANSWERS.dontSave });
  assert.equal(await exit.run(), true);
  assert.deepEqual(exit.asked, ["Untitled 3"]);
  assert.deepEqual(exit.saved, []);
});

test("Save saves that VI before quitting; a cancelled Save As cancels the Exit", async () => {
  const works = scenario([{ name: "a", dirty: true }], { a: EXIT_ANSWERS.save });
  assert.equal(await works.run(), true);
  assert.deepEqual(works.saved, ["a"]);
  const cancelled = scenario([{ name: "a", dirty: true }], { a: EXIT_ANSWERS.save }, { saveWorks: false });
  assert.equal(await cancelled.run(), false);
});

test("Cancel keeps everything open and stops asking", async () => {
  const exit = scenario([{ name: "a", dirty: true }, { name: "b", dirty: true }], { a: EXIT_ANSWERS.cancel, b: EXIT_ANSWERS.dontSave });
  assert.equal(await exit.run(), false);
  assert.deepEqual(exit.asked, ["a"]);
});
