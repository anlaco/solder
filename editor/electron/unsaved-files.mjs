// Saving a file that refers to new files never saved (measured in LabVIEW 2026 Q3). A project with new VIs
// (reports/2026-11-19-project-new-vi.md Q5) and a VI that follows a type definition made by Make Type Def. and not
// saved yet (reports/2026-11-22-control-editor-window.md, "Ctrl+S on the VI with the typedef untitled") ask the same:
// '"p1.vi" refers to new, unsaved files…', Yes / Cancel; Yes names each new file ("Name the Control (Control 1)") and
// then saves the one asked for.
//
// Pure: the main process gives the questions, the saving and the waiting, so the order is tested without Electron.

import { isUntitledKey, typeDefinitionPathsInFile } from "../src/common/ovi-paths.mjs";

/** A box with no title, Yes (the default) and Cancel (measured). */
export const NEW_FILES_BUTTONS = ["Yes", "Cancel"];
export const newUnsavedFilesText = (ownerName) => ({
  title: "",
  message: `"${ownerName}" refers to new, unsaved files. You must save these files in order to save "${ownerName}".`,
  detail: "Do you want to save the new, unsaved files?",
});

/** The untitled keys of the type definitions an OVI's text follows, each once, in the order they appear. */
export function untitledDefinitionsOf(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return [];
  }
  if (!file || typeof file !== "object" || file["solder-polymorphic"] !== undefined) return [];
  return [...new Set(typeDefinitionPathsInFile(file).filter(isUntitledKey))];
}

/**
 * The text an OVI is saved with once the untitled type definitions it follows have files. With none, `text` itself.
 * Otherwise `ask` shows LabVIEW's question (resolves true on Yes); `saveDefinition(key)` saves one, asking where, and
 * resolves to its new key or null when cancelled; `followSaved(text, moves)` gives the OVI's text following the files
 * (`moves` are `[untitledKey, savedKey]` pairs), or null when it cannot. Resolves to null when anything was cancelled:
 * the OVI is then not saved.
 */
export async function saveUntitledDefinitionsFirst(text, { ownerName, ask, saveDefinition, followSaved }) {
  const untitled = untitledDefinitionsOf(text);
  if (untitled.length === 0) return text;
  if (!(await ask(newUnsavedFilesText(ownerName)))) return null;
  const moves = [];
  for (const key of untitled) {
    const savedKey = await saveDefinition(key);
    if (savedKey === null) return null;
    moves.push([key, savedKey]);
  }
  return followSaved(text, moves);
}

/**
 * Waiting for an entry's text to come to a state: the page of an OVI reports each edit, and following a saved type
 * definition is one (editor-window.mjs `followSavedTypeDefinition`). `changed(entry)` is called on every report;
 * `until(entry, accepts, timeoutMs)` resolves true once `accepts(entry.current)`, false when the time is over.
 */
export function createTextWaiters() {
  const waiting = new Set();
  const settle = (waiter, outcome) => {
    waiting.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(outcome);
  };
  return {
    changed(entry) {
      for (const waiter of [...waiting]) if (waiter.entry === entry && waiter.accepts(entry.current)) settle(waiter, true);
    },
    until(entry, accepts, timeoutMs) {
      if (accepts(entry.current)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const waiter = { entry, accepts, resolve };
        waiter.timer = setTimeout(() => settle(waiter, false), timeoutMs);
        waiting.add(waiter);
      });
    },
  };
}
