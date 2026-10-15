// Several VIs open at once (DT-045 consequence b): each with its own file, its
// own number and its own unsaved changes. The main process only adds windows to
// what vi-registry.mjs decides, so the rules are tested without Electron.

import assert from "node:assert/strict";
import { test } from "node:test";

import { WINDOW_KINDS, createRegistry, isDirty, recordChange, recordSave, viName, windowTitle } from "../../editor/electron/vi-registry.mjs";

test("several VIs can be open, each with its own file, number and unsaved changes", () => {
  const registry = createRegistry();
  const first = registry.open().entry;
  const second = registry.open().entry;
  const fromDisk = registry.open({ path: "/vis/add2.qvi", initialText: "{}" }).entry;
  assert.deepEqual([first.id, second.id, fromDisk.id], ["1", "2", "3"]);
  assert.deepEqual([viName(first), viName(second), viName(fromDisk)], ["Untitled 1", "Untitled 2", "add2.qvi"], "LabVIEW numbers the new VIs");
  assert.equal(registry.list().length, 3);
  assert.deepEqual(WINDOW_KINDS, ["front-panel", "block-diagram"], "each VI has its two windows");

  // The first thing the windows report is the saved version; what differs afterwards is a change.
  recordChange(first, "a");
  assert.equal(isDirty(first), false);
  recordChange(first, "b");
  assert.equal(isDirty(first), true);
  assert.equal(isDirty(second), false, "the other VIs are not touched");
  assert.equal(windowTitle(first, "front-panel"), "Untitled 1 Front Panel *");
  assert.equal(windowTitle(first, "block-diagram"), "Untitled 1 Block Diagram *");
  assert.equal(windowTitle(second, "front-panel"), "Untitled 2 Front Panel");

  // Saving gives it a file and a name, and clears the asterisk; its number stays.
  recordSave(first, "/vis/main.qvi", "b");
  assert.equal(isDirty(first), false);
  assert.equal(windowTitle(first, "front-panel"), "main.qvi Front Panel");
  assert.equal(first.untitledNumber, 1);
  assert.equal(registry.findByPath("/vis/main.qvi"), first);
});

test("opening a VI that is already open gives back its windows", () => {
  const registry = createRegistry();
  const { entry } = registry.open({ path: "/vis/add2.qvi", initialText: "{}" });
  const again = registry.open({ path: "/vis/add2.qvi", initialText: "{}" });
  assert.equal(again.alreadyOpen, true);
  assert.equal(again.entry, entry);
  assert.equal(registry.list().length, 1);
});

test("closing a VI leaves the others open", () => {
  const registry = createRegistry();
  const a = registry.open().entry;
  const b = registry.open({ path: "/vis/add2.qvi" }).entry;
  registry.close(a.id);
  assert.deepEqual(registry.list().map((entry) => entry.id), [b.id]);
  assert.equal(registry.get(a.id), undefined);
  // A VI closed can be opened again, as a new one.
  assert.equal(registry.open({ path: "/vis/add2.qvi" }).alreadyOpen, true);
  registry.close(b.id);
  assert.equal(registry.open({ path: "/vis/add2.qvi" }).alreadyOpen, false);
});

test("an Untitled number is never given again, even after its VI closes", () => {
  const registry = createRegistry();
  const first = registry.open().entry;
  registry.close(first.id);
  assert.equal(viName(registry.open().entry), "Untitled 2");
});
