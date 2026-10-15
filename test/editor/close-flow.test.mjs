// File ▸ Close and File ▸ Close All: what LabVIEW asks and in which order
// (labview-captures/reports/2026-10-15-file-close.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLOSE_ALL_BUTTONS, CLOSE_ANSWERS, CLOSE_BUTTONS, CLOSE_BUTTON_ANSWERS,
  closeAllDialogText, closeAllOrder, closeDialogText, confirmCloseAll,
} from "../../editor/electron/close-flow.mjs";

/** Open VIs as the flow sees them; `replies` gives, by VI name, what the dialog answers. */
function scenario(vis, replies, { saveWorks = true } = {}) {
  const asked = [];
  const saved = [];
  const hooks = {
    isDirty: (vi) => vi.dirty,
    ask: async (vi, remaining) => {
      asked.push([vi.name, remaining]);
      return replies[vi.name];
    },
    save: async (vi) => {
      saved.push(vi.name);
      return saveWorks;
    },
  };
  return { run: () => confirmCloseAll(vis, hooks), asked, saved };
}

const dirty = (name) => ({ name, dirty: true });
const clean = (name) => ({ name, dirty: false });

test("the Close dialog has LabVIEW's title, texts and buttons, without «(Close)» in the title", () => {
  assert.deepEqual(closeDialogText("Untitled 3"), {
    title: "Save changes before closing?",
    message: "Untitled 3 has unsaved changes.",
    detail: "Untitled 3 is about to leave memory. Its unsaved changes will be lost.",
  });
  assert.deepEqual(CLOSE_BUTTONS, ["Save", "Don't Save", "Cancel"]);
  assert.deepEqual(CLOSE_BUTTON_ANSWERS, [CLOSE_ANSWERS.save, CLOSE_ANSWERS.dontSave, CLOSE_ANSWERS.cancel]);
});

test("the Close All dialog offers to apply the answer to the rest, and has no box for the last one", () => {
  assert.deepEqual(closeAllDialogText("Untitled 3", 2), {
    title: "Save changes? (Close All)",
    message: "Untitled 3 has unsaved changes.",
    detail: "Untitled 3 is about to leave memory. Its unsaved changes will be lost.",
    checkboxLabel: "Apply same action to the remaining 2 affected items",
  });
  assert.equal(closeAllDialogText("Untitled 2", 0).checkboxLabel, null);
  assert.deepEqual(CLOSE_ALL_BUTTONS, ["Save - All", "Don't Save - All", "Cancel"]);
});

test("Close All asks about the VI created last first", () => {
  const vis = [{ id: 2 }, { id: 4 }, { id: 3 }];
  assert.deepEqual(closeAllOrder(vis, (vi) => vi.id).map((vi) => vi.id), [4, 3, 2]);
});

test("Don't Save - All answers once for every VI with changes and skips the ones without", async () => {
  const closeAll = scenario([dirty("Untitled 3"), clean("Untitled 4"), dirty("Untitled 2")], {
    "Untitled 3": { answer: CLOSE_ANSWERS.dontSave, applyToRemaining: true },
  });
  assert.equal(await closeAll.run(), true);
  assert.deepEqual(closeAll.asked, [["Untitled 3", 1]]);
  assert.deepEqual(closeAll.saved, []);
});

test("with the box unchecked each VI is asked about on its own", async () => {
  const closeAll = scenario([dirty("Untitled 7"), dirty("Untitled 6")], {
    "Untitled 7": { answer: CLOSE_ANSWERS.dontSave, applyToRemaining: false },
    "Untitled 6": { answer: CLOSE_ANSWERS.save, applyToRemaining: false },
  });
  assert.equal(await closeAll.run(), true);
  assert.deepEqual(closeAll.asked, [["Untitled 7", 1], ["Untitled 6", 0]]);
  assert.deepEqual(closeAll.saved, ["Untitled 6"]);
});

test("Save - All saves every VI with changes; a cancelled Save As cancels the Close All", async () => {
  const replies = { a: { answer: CLOSE_ANSWERS.save, applyToRemaining: true } };
  const saving = scenario([dirty("a"), dirty("b")], replies);
  assert.equal(await saving.run(), true);
  assert.deepEqual(saving.saved, ["a", "b"]);
  const cancelled = scenario([dirty("a"), dirty("b")], replies, { saveWorks: false });
  assert.equal(await cancelled.run(), false);
  assert.deepEqual(cancelled.saved, ["a"]);
});

test("Cancel closes nothing and stops asking", async () => {
  const closeAll = scenario([dirty("a"), dirty("b")], { a: { answer: CLOSE_ANSWERS.cancel, applyToRemaining: true } });
  assert.equal(await closeAll.run(), false);
  assert.deepEqual(closeAll.asked, [["a", 1]]);
});
