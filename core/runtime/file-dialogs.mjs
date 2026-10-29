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

/** The host of a Run with no window, as the command line: every dialog answers Cancel (DT-067, amendment of 2026-10-28). */
export const CANCELLING_DIALOGS = Object.freeze({
  chooseFile: async () => null,
  confirm: async () => false,
});
