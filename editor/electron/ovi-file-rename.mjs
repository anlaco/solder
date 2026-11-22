// Rename... of an OVI item of a project moves its file at once (measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-18-project-explorer-s4.md "Rename"). The paths of its subOVIs are stored relative to
// the file (spec/05 rule 69), so a file moved to another folder has them rebased, as a Save As does.

import { readFile, rename, writeFile } from "node:fs/promises";
import { pathKey, rebaseText } from "../src/common/ovi-paths.mjs";

/** What rebases an OVI's text from `oldPath` to `newPath`. */
export const rebaserFor = (oldPath, newPath) => (oviText) => rebaseText(oviText, pathKey(oldPath), pathKey(newPath));

/** Moves the OVI file at `oldPath` to `newPath`, its subOVIs' paths rebased to the new folder. */
export async function moveOVIFile(oldPath, newPath) {
  const text = await readFile(oldPath, "utf8");
  const rebased = rebaserFor(oldPath, newPath)(text);
  await rename(oldPath, newPath);
  if (rebased !== text) await writeFile(newPath, rebased);
}
