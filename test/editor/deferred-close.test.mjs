// Closing an OVI that an open caller calls (measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-19-subvi-checks-0.14-labview.md §3): Save, Defer Decision, Cancel, and Don't Save
// only when the last caller closes and the OVI is about to leave memory.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFER_BUTTONS, canDefer, heldInMemoryText, releasedBy } from "../../editor/electron/deferred-close.mjs";

const keyOf = (entry) => entry.path;
const opened = (id, path, calls = []) => ({ entry: { id, path }, calls });

test("an OVI an open caller calls offers Defer Decision instead of Don't Save, with LabVIEW's words", () => {
  assert.deepEqual(DEFER_BUTTONS, ["Save", "Defer Decision", "Cancel"]);
  assert.deepEqual(heldInMemoryText("Sub14.ovi"), {
    title: "Save changes before closing?",
    message: "Sub14.ovi has unsaved changes.",
    detail: "Sub14.ovi has unsaved changes that will remain in memory until all references to it are closed.",
  });
  const sub = opened("2", "/a/sub.ovi");
  const caller = opened("1", "/a/caller.ovi", ["/a/sub.ovi"]);
  assert.equal(canDefer(sub, [caller, sub], keyOf), true);
  assert.equal(canDefer(sub, [sub], keyOf), false, "nothing calls it: it leaves memory, with Don't Save");
  assert.equal(canDefer(opened("3", null), [caller], keyOf), false, "an untitled OVI is called by no path");
  assert.equal(canDefer(opened("4", "/a/self.ovi", ["/a/self.ovi"]), [opened("4", "/a/self.ovi", ["/a/self.ovi"])], keyOf), false, "an OVI does not hold itself");
});

test("a deferred OVI is asked about again when its last caller closes, and Close All or Exit asks about all of them", () => {
  const deferred = [{ id: "2", path: "/a/sub.ovi" }];
  const first = opened("1", "/a/caller.ovi", ["/a/sub.ovi"]);
  const second = opened("3", "/a/other.ovi", ["/a/sub.ovi"]);
  assert.deepEqual(releasedBy(deferred, [first, second], keyOf, "1"), [], "the other caller still holds it");
  assert.deepEqual(releasedBy(deferred, [first], keyOf, "1"), deferred);
  assert.deepEqual(releasedBy(deferred, [first, second], keyOf, null), deferred);
});

test("the main process keeps a deferred OVI in memory for its callers and opens it again as it is in memory", () => {
  const main = readFileSync(new URL("../../editor/electron/main.mjs", import.meta.url), "utf8");
  assert.match(main, /if \(open\.deferring\) return deferredEntries\.set\(open\.entry\.id, open\.entry\);\n  registry\.close/, "its entry stays in the registry, which callers read first");
  assert.match(main, /deferredEntries\.delete\(existing\.id\)\) return openWindows\(Object\.assign\(existing, \{ initialText: existing\.current \}\)\)/);
  assert.match(main, /confirmExit\([^\n]*\n  if \(!\(await releaseDeferred\(null, owner\)\)\) return;/, "Exit asks about deferred OVIs too");
  assert.match(main, /confirmCloseAll\([^\n]*\n  if \(!\(await releaseDeferred\(null, owner\)\)\) return;/, "and Close All");
});
