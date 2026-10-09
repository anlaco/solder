// File ▸ Exit (Ctrl+Q): what LabVIEW asks and does
// (labview-captures/editor-checks/REPORT.md §3). Every VI with unsaved changes
// is asked about, one after the other: Save saves it, Don't Save lets it go and
// Cancel keeps everything open. Once all have answered the application quits;
// there is no new blank VI afterwards.
//
// Pure: the dialog and the disk are given by the main process, so the flow is
// tested without Electron.

/** The answers of the dialog. */
export const EXIT_ANSWERS = { save: "save", dontSave: "dont-save", cancel: "cancel" };

/** The buttons in LabVIEW's order, with the answer each gives. */
export const EXIT_BUTTONS = ["Save", "Don't Save", "Cancel"];
export const EXIT_BUTTON_ANSWERS = [EXIT_ANSWERS.save, EXIT_ANSWERS.dontSave, EXIT_ANSWERS.cancel];

/** The texts of LabVIEW's "Save changes? (Exit)" dialog for the VI called `name`. */
export const exitDialogText = (name) => ({
  title: "Save changes? (Exit)",
  message: `${name} has unsaved changes.`,
  detail: `${name} is about to leave memory. Its unsaved changes will be lost.`,
});

/**
 * Asks about each VI in `openVIs` that has unsaved changes. `ask(vi)` gives one
 * of `EXIT_ANSWERS`; `save(vi)` saves it and says whether it was (a cancelled
 * Save As is a cancelled Exit). Returns whether the application may quit.
 */
export async function confirmExit(openVIs, { isDirty, ask, save }) {
  for (const vi of openVIs) {
    if (!isDirty(vi)) continue;
    const answer = await ask(vi);
    if (answer === EXIT_ANSWERS.cancel) return false;
    if (answer === EXIT_ANSWERS.save && !(await save(vi))) return false;
  }
  return true;
}
