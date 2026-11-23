// A caller sees its subOVIs as they are in memory (GitHub issue #20). LabVIEW looks for a subVI first in memory, then at
// its path (DT-045 §8): an open subVI's unsaved edits are what its callers show and run. The main process keeps the
// current text of every open OVI (ovi-registry.mjs `recordChange`), so it serves that text before the file's.
//
// Unlike LabVIEW, an OVI is found in memory by its path, not by its name alone: two open OVIs with the same name in
// different folders are not cross-linked (unverified how LabVIEW resolves that case in 2026 Q3).

import { pathKey, untitledKey } from "../src/common/ovi-paths.mjs";
import { withoutWindows } from "./saved-windows.mjs";
import { textSeenByCallers } from "./type-definition-publishing.mjs";

/** The key an entry is reached by: its path, or, with no file yet, its untitled key (a type definition made by Make Type Def. is linked by it, DT-104). */
const keyOfEntry = (entry) => (entry.path ? pathKey(entry.path) : untitledKey(entry.id));

/** A reader of OVI texts by key: an open entry's current text, with its unsaved changes (a type definition's, as published), else the file's (`readFromDisk`). */
export function memoryFirstReader(registry, readFromDisk) {
  return async (key) => {
    const open = registry.list().find((entry) => entry.current !== null && keyOfEntry(entry) === key);
    return open ? textSeenByCallers(open) : readFromDisk(key);
  };
}

/** Whether an edit changes what an OVI's callers see: its content, never where its windows are (DT-078). */
export const changesWhatCallersSee = (previous, text) => previous === null || withoutWindows(previous) !== withoutWindows(text);
