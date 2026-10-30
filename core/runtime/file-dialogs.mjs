// Which dialog a file function asks for when its path input is unwired (DT-067, amendment of 2026-10-29): its
// title and its mode. The host shows it with the system's own dialog; the core only says which.
//
// Measured in LabVIEW 2026 Q3 on Windows: labview-captures/reports/2026-10-29-file-dialogs.md.

/**
 * What the dialog lets the user choose. `existing`: only a file that exists (an Open dialog). `new`: any name, and
 * the system asks before an existing file is chosen (a Save dialog). `any`: any name, with no question.
 */
export const DIALOG_MODE = Object.freeze({ EXISTING: "existing", NEW: "new", ANY: "any" });

/** The dialog of each operation of Open/Create/Replace File, by its number (0 open … 5 replace or create with confirmation). */
const OPEN_CREATE_REPLACE_DIALOGS = [
  { title: "Choose or enter path of file to open", mode: DIALOG_MODE.EXISTING },
  { title: "Choose or enter path of file to replace", mode: DIALOG_MODE.EXISTING },
  { title: "Enter path of file to create", mode: DIALOG_MODE.NEW },
  { title: "Choose or enter path of file to open or create", mode: DIALOG_MODE.ANY },
  { title: "Choose or enter path of file to replace or create", mode: DIALOG_MODE.ANY },
  { title: "Choose or enter path of file to replace or create", mode: DIALOG_MODE.NEW },
];

/** The dialog of each of the other file functions, by the name its errors carry. */
const FUNCTION_DIALOGS = Object.freeze({
  "Write to Text File": { title: "Choose or enter path of text file to write", mode: DIALOG_MODE.NEW },
  "Read from Text File": { title: "Choose or enter path of text file to read", mode: DIALOG_MODE.EXISTING },
  "Write Delimited Spreadsheet": { title: "Choose file to write.", mode: DIALOG_MODE.ANY },
  "Read Delimited Spreadsheet": { title: "Choose file to read.", mode: DIALOG_MODE.EXISTING },
  // Unverified on Windows' side: LabVIEW's Delete dialog also picks folders ("Current Folder"); the system's open
  // dialog picks one or the other, so here it picks files (amendment of 2026-10-29, point 7).
  Delete: { title: "Choose or enter path of file to delete", mode: DIALOG_MODE.EXISTING },
});

/**
 * The dialog `functionName` asks for: `{ title, mode }`. `operation` is Open/Create/Replace File's; `prompt` is the
 * text of a wired prompt input, which is the title (measured), or `null` when it is unwired.
 */
export function fileDialogOf(functionName, { operation, prompt = null } = {}) {
  const dialog = functionName === "Open/Create/Replace File" ? OPEN_CREATE_REPLACE_DIALOGS[operation] : FUNCTION_DIALOGS[functionName];
  if (!dialog) throw new Error(`No file dialog for ${functionName}${operation === undefined ? "" : ` with operation ${operation}`}.`);
  return { title: prompt ?? dialog.title, mode: dialog.mode };
}

/** Op 5's question on a wired path that exists: a message box with no title, OK and Cancel (measured). */
export const replaceConfirmation = (fileName) => ({ message: fileName, detail: "This file already exists.\nDo you want to replace it?" });

/** The prompt Delete's confirmation starts with when its prompt input is unwired (measured: "Delete <path>?"). */
const DELETE_PROMPT = "Delete";
/** Delete's question with `confirm` true. Unverified: the text with a wired prompt. */
export const deleteConfirmation = (fileName, prompt = null) => ({ message: `${prompt ?? DELETE_PROMPT} ${fileName}?`, detail: "" });

/** File Dialog's title when its prompt is unwired or empty, by what it selects (measured). */
const FILE_DIALOG_TITLES = Object.freeze({
  file: "Choose or Enter Path of File",
  folder: "Choose or Enter Path of Folder",
  "file-or-folder": "Choose or Enter Path of Folder or File",
  several: "Choose or Enter Path of File(s)",
});
/** And its OK button when the button label is unwired or empty (measured). */
const FILE_DIALOG_BUTTON = "OK";
/** The filter LabVIEW always offers (measured: "All Files (*.*)", first in the list). */
export const ALL_FILES_FILTER = Object.freeze({ name: "All Files", extensions: ["*"] });

/**
 * File Dialog's request to the host (DT-069, DT-067 (d2)): its configuration (`selection` file, folder or
 * file-or-folder; `existence` existing, new or new-or-existing; `multiple`) and its inputs, as texts or `null` when
 * unwired. The host decides whether `startPath` is a folder or a file in one (measured: a file opens its folder with
 * the name box empty). `filters` puts the wired pattern first and keeps All Files (measured: both offered, the
 * pattern selected); a pattern "*.txt" with the label "Text" is the filter "Text (*.txt)" (measured).
 */
export function fileDialogRequest(config, { prompt, buttonLabel, startPath, defaultName, pattern, patternLabel }) {
  const patterns = (pattern ?? "").split(";").map((one) => one.trim()).filter(Boolean);
  const extensions = patterns.map((one) => one.replace(/^\*\.?/, "") || "*");
  const patternName = patternLabel ? `${patternLabel} (${patterns.join(";")})` : patterns.join(";");
  return {
    title: prompt || (config.multiple ? FILE_DIALOG_TITLES.several : FILE_DIALOG_TITLES[config.selection]),
    buttonLabel: buttonLabel || FILE_DIALOG_BUTTON,
    selection: config.selection,
    existence: config.existence,
    multiple: Boolean(config.multiple),
    startPath: startPath || null,
    defaultName: defaultName || null,
    filters: patterns.length ? [{ name: patternName, extensions }, ALL_FILES_FILTER] : [ALL_FILES_FILTER],
  };
}

/** The host of a Run with no window, as the command line: every dialog answers Cancel (DT-067, amendment of 2026-10-28). */
export const CANCELLING_DIALOGS = Object.freeze({
  chooseFile: async () => null,
  confirm: async () => false,
  fileDialog: async () => null,
});
