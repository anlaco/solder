// File ▸ Close (Ctrl+W) and File ▸ Close All: what LabVIEW asks and does
// (labview-captures/reports/2026-10-15-file-close.md).
//
// Close on the Front Panel takes the whole VI out of memory, asking first only
// when it has unsaved changes; on the Block Diagram it only hides that window.
// Close All asks once for the VI created last, with "Apply same action to the
// remaining N affected items" checked; unchecked, each VI is asked about on its
// own. The VIs without changes are not asked about but close all the same.
//
// Pure: the dialog and the disk are given by the main process, so the flow is
// tested without Electron.

import { EXIT_ANSWERS } from "./exit-flow.mjs";

/** The answers of the dialogs: the same three as Exit's. */
export const CLOSE_ANSWERS = EXIT_ANSWERS;

/** The buttons of the Close dialog, in LabVIEW's order, with the answer each gives; Save is the default. */
export const CLOSE_BUTTONS = ["Save", "Don't Save", "Cancel"];
/** The buttons of Close All while its "Apply same action" box is checked. */
export const CLOSE_ALL_BUTTONS = ["Save - All", "Don't Save - All", "Cancel"];
export const CLOSE_BUTTON_ANSWERS = [CLOSE_ANSWERS.save, CLOSE_ANSWERS.dontSave, CLOSE_ANSWERS.cancel];

const leavingMemoryText = (name) => ({
  message: `${name} has unsaved changes.`,
  detail: `${name} is about to leave memory. Its unsaved changes will be lost.`,
});

/** The texts of LabVIEW's Close dialog for the VI called `name`. */
export const closeDialogText = (name) => ({ title: "Save changes before closing?", ...leavingMemoryText(name) });

/**
 * The texts of the Close All dialog for the VI called `name`, with
 * `remaining` other VIs still to ask about; without any, there is no box.
 */
export const closeAllDialogText = (name, remaining) => ({
  title: "Save changes? (Close All)",
  ...leavingMemoryText(name),
  checkboxLabel: remaining > 0 ? `Apply same action to the remaining ${remaining} affected items` : null,
});

/** Close All asks about the VI created last first, not the one in front. */
export const closeAllOrder = (openVIs, creationOrder) => [...openVIs].sort((first, second) => creationOrder(second) - creationOrder(first));

/**
 * Asks about each VI of `openVIs` with unsaved changes, in that order.
 * `ask(vi, remaining)` gives `{ answer, applyToRemaining }`, `answer` one of
 * `CLOSE_ANSWERS`; `save(vi)` saves it and says whether it was (a cancelled
 * Save As cancels the whole Close All). Returns whether every VI may close.
 */
export async function confirmCloseAll(openVIs, { isDirty, ask, save }) {
  const affected = openVIs.filter(isDirty);
  let answerForTheRest = null;
  for (const [position, vi] of affected.entries()) {
    let answer = answerForTheRest;
    if (!answer) {
      const reply = await ask(vi, affected.length - position - 1);
      if (reply.answer === CLOSE_ANSWERS.cancel) return false;
      answer = reply.answer;
      if (reply.applyToRemaining) answerForTheRest = answer;
    }
    if (answer === CLOSE_ANSWERS.save && !(await save(vi))) return false;
  }
  return true;
}
