// The style of one window (DT-058 §1–2): the `.css` with the OVI's name next to its file. It wins over the editor's
// panel style because the page puts it after every other sheet. It is read again whenever it changes on disk, so
// a style is written in any editor and seen at once.

import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { companionStylesheetPath } from "../src/common/ovi-paths.mjs";

/** An editor saves a file in several writes; the style is read once they have settled. */
const SETTLE_MILLISECONDS = 80;

/** The text of an OVI's window style, or "" if the OVI is unsaved or has none. */
export async function readWindowStyle(oviPath) {
  if (!oviPath) return "";
  try {
    return await readFile(companionStylesheetPath(oviPath), "utf8");
  } catch {
    return "";
  }
}

/**
 * Calls `onChange(text)` whenever the window style of the OVI at `oviPath` is created, changed or deleted. The
 * folder is watched rather than the file, so a style created after the OVI was opened is seen too. Returns the
 * function that stops watching.
 */
export function watchWindowStyle(oviPath, onChange) {
  if (!oviPath) return () => {};
  const stylesheet = companionStylesheetPath(oviPath);
  let pending = null;
  let watcher;
  try {
    watcher = watch(path.dirname(stylesheet), (_event, fileName) => {
      if (fileName && fileName !== path.basename(stylesheet)) return;
      clearTimeout(pending);
      pending = setTimeout(async () => onChange(await readWindowStyle(oviPath)), SETTLE_MILLISECONDS);
    });
  } catch {
    return () => {};
  }
  return () => {
    clearTimeout(pending);
    watcher.close();
  };
}
