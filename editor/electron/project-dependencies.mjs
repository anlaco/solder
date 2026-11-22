// What a project's Dependencies shows (DT-099 §4): every file its items call, at any depth, that is not an item itself
// (measured: labview-captures/reports/2026-11-17-project-explorer-s1.md Q4). The `.sdproj` never stores it, so it is
// read again from the files whenever the project is opened, changed or refreshed. Pure but for `readText`, which the
// main process gives (the disk, or an open OVI's unsaved text): the rules are tested without files.

import { dependencyKeys, itemKindOf, ITEM_KINDS } from "../../core/model/project.mjs";
import { resolveRelative, storedCalleePaths } from "../src/common/ovi-paths.mjs";

/** Only an OVI, a polymorphic OVI or a type definition can call anything; a document is never read. */
const canCall = (key) => itemKindOf(key) === ITEM_KINDS.OVI;

/**
 * The keys each file calls directly, read one level after another from `itemKeys` (absolute keys): `readText(key)`
 * gives a file's text or null when it cannot be read; `oviLib` is what `<ovilib>/…` paths resolve against. Returns
 * `{ callees, missing }`: a Map from each file read to the keys it calls, and the keys that could not be read.
 */
async function readCallees(itemKeys, readText, oviLib) {
  const callees = new Map();
  const missing = new Set();
  const pending = [...itemKeys];
  while (pending.length) {
    const key = pending.pop();
    if (callees.has(key) || missing.has(key) || !canCall(key)) continue;
    const text = await readText(key);
    if (text === null) {
      missing.add(key);
      continue;
    }
    const called = calleesInText(key, text, oviLib);
    callees.set(key, called);
    pending.push(...called);
  }
  return { callees, missing };
}

/** The absolute keys a file's text calls; a text that is not JSON calls nothing. */
function calleesInText(key, text, oviLib) {
  try {
    return storedCalleePaths(key, JSON.parse(text)).map((stored) => resolveRelative(key, stored, oviLib));
  } catch {
    return [];
  }
}

/**
 * Dependencies of the items at `itemKeys`: `{ library, others, missing }`, the keys of Solder's library (shown in the
 * `ovi.lib` folder, as LabVIEW groups `vi.lib`), the other keys, each sorted by file name, and the dependencies that
 * could not be read. `isLibraryKey(key)` says whether a key is in ovi.lib.
 */
export async function projectDependencies(itemKeys, readText, oviLib, isLibraryKey) {
  const { callees, missing } = await readCallees(itemKeys, readText, oviLib);
  const { library, others } = dependencyKeys(itemKeys, (key) => callees.get(key), isLibraryKey);
  const items = new Set(itemKeys);
  return { library, others, missing: [...missing].filter((key) => !items.has(key)) };
}
