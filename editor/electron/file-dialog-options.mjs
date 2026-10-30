// The system's dialogs that answer a Run's file dialogs (DT-067, amendment of 2026-10-29): which of Electron's
// dialogs each mode is and with what options, and what its answer means. The main process shows them.

import path from "node:path";

/** The modes of core/runtime/file-dialogs.mjs, by their names there. */
const MODE = Object.freeze({ EXISTING: "existing", NEW: "new", ANY: "any" });

/** LabVIEW's file dialogs offer every file and their OK button reads "OK" (measured). */
const ALL_FILES = [{ name: "All Files", extensions: ["*"] }];
const OK_LABEL = "OK";
/** Op 5's and Delete's confirmations: OK, the default, and Cancel (measured). */
const CONFIRM_BUTTONS = ["OK", "Cancel"];
const OK_BUTTON = 0;
const CANCEL_BUTTON = 1;

/**
 * Electron's dialog for a Run's `{ title, mode }`, opening in `folder`: `{ kind, options }`, where `kind` is
 * "open" (showOpenDialog) or "save" (showSaveDialog). *new* asks before an existing file; on Linux that is an
 * option, on Windows the save dialog always asks, so *any* asks there too (point 7 of the amendment).
 */
export function systemDialogFor({ title, mode }, folder) {
  const common = { title, defaultPath: folder, buttonLabel: OK_LABEL, filters: ALL_FILES };
  if (mode === MODE.EXISTING) return { kind: "open", options: { ...common, properties: ["openFile"] } };
  if (mode === MODE.NEW) return { kind: "save", options: { ...common, properties: ["showOverwriteConfirmation"] } };
  if (mode === MODE.ANY) return { kind: "save", options: common };
  throw new Error(`Unknown file dialog mode "${mode}".`);
}

/**
 * Electron's dialog for File Dialog's request (core/runtime/file-dialogs.mjs `fileDialogRequest`), opening in
 * `folder` with `name` proposed. Several items or an existing file is an open dialog; a new file a save dialog that
 * asks before an existing one; new or existing a save dialog that does not (on Linux; Windows always asks). A folder
 * is the system's folder picker; departures (point 7 of DT-067's amendment of 2026-10-29): Electron cannot pick a
 * file or a folder in one dialog on Windows and Linux, so File or folder picks folders, and a new folder is the
 * folder picker that may create one, not LabVIEW's own dialog.
 */
export function fileDialogFor(request, folder, name) {
  const defaultPath = name ? path.join(folder, name) : folder;
  const common = { title: request.title, defaultPath, buttonLabel: request.buttonLabel, filters: request.filters };
  if (request.selection !== "file") {
    const createFolder = request.existence === "existing" ? [] : ["createDirectory", "promptToCreate"];
    return { kind: "open", options: { title: request.title, defaultPath, buttonLabel: request.buttonLabel, properties: ["openDirectory", ...createFolder] } };
  }
  if (request.multiple) return { kind: "open", options: { ...common, properties: ["openFile", "multiSelections"] } };
  if (request.existence === "existing") return { kind: "open", options: { ...common, properties: ["openFile"] } };
  if (request.existence === "new") return { kind: "save", options: { ...common, properties: ["showOverwriteConfirmation"] } };
  return { kind: "save", options: common };
}

/** Every file an Electron dialog of `kind` answered (several with multiSelections), or `null` for Cancel. */
export function chosenFilesOf(kind, result) {
  if (result.canceled) return null;
  const chosen = kind === "open" ? (result.filePaths ?? []) : [result.filePath].filter(Boolean);
  return chosen.length ? chosen : null;
}

/** The file an Electron dialog of `kind` answered, or `null` for Cancel. */
export function chosenFileOf(kind, result) {
  if (result.canceled) return null;
  const chosen = kind === "open" ? result.filePaths?.[0] : result.filePath;
  return chosen || null;
}

/** The folder the next dialog opens in after `chosen` (measured: the last file's folder, in any dialog). */
export const folderAfter = (chosen) => path.dirname(chosen);

/** Electron's message box for a Run's confirmation `{ message, detail }`: no title, OK and Cancel (measured). */
export const confirmationBoxFor = ({ message, detail }) => ({
  type: "none",
  title: "",
  message,
  detail,
  buttons: CONFIRM_BUTTONS,
  defaultId: OK_BUTTON,
  cancelId: CANCEL_BUTTON,
  noLink: true,
});

/** Whether the message box's answer is OK. */
export const confirmedBy = ({ response }) => response === OK_BUTTON;
