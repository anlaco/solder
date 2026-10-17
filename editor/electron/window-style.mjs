// The style of one window (DT-058 §1–2): the `.css` with the VI's name next to its file. It wins over the editor's
// panel style because the page puts it after every other sheet. It is read again whenever it changes on disk, so
// a style is written in any editor and seen at once.

import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { companionStylesheetPath } from "../src/common/vi-paths.mjs";

/** An editor saves a file in several writes; the style is read once they have settled. */
const SETTLE_MILLISECONDS = 80;

/** The text of a VI's window style, or "" if the VI is unsaved or has none. */
export async function readWindowStyle(viPath) {
  if (!viPath) return "";
  try {
    return await readFile(companionStylesheetPath(viPath), "utf8");
  } catch {
    return "";
  }
}

/**
 * Calls `onChange(text)` whenever the window style of the VI at `viPath` is created, changed or deleted. The
 * folder is watched rather than the file, so a style created after the VI was opened is seen too. Returns the
 * function that stops watching.
 */
export function watchWindowStyle(viPath, onChange) {
  if (!viPath) return () => {};
  const stylesheet = companionStylesheetPath(viPath);
  let pending = null;
  let watcher;
  try {
    watcher = watch(path.dirname(stylesheet), (_event, fileName) => {
      if (fileName && fileName !== path.basename(stylesheet)) return;
      clearTimeout(pending);
      pending = setTimeout(async () => onChange(await readWindowStyle(viPath)), SETTLE_MILLISECONDS);
    });
  } catch {
    return () => {};
  }
  return () => {
    clearTimeout(pending);
    watcher.close();
  };
}
