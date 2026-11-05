// The windows saved with an OVI (DT-078), as LabVIEW 2026 Q3 saves them with a VI
// (labview-captures/reports/2026-11-05-scrollbars-and-window-bounds.md §B).

import assert from "node:assert/strict";
import { test } from "node:test";

import { restoredBounds, savedWindows, windowRecord, withWindows, withoutWindows } from "../../editor/electron/saved-windows.mjs";
import { createRegistry, isDirty, recordChange, recordSave } from "../../editor/electron/vi-registry.mjs";

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };
const FALLBACK = { x: 527, y: 153, width: 1090, height: 696 };
const OVI_TEXT = `${JSON.stringify({ solder: 3, "block-diagram": { nodes: [] }, layout: { diagram: {} } }, null, 2)}\n`;
const WINDOWS = { "front-panel": { x: 200, y: 150, width: 900, height: 550, origin: { x: 123, y: 77 } }, "block-diagram": { x: 300, y: 250, width: 900, height: 500 } };

test("a Save writes both windows into the layout, and the next opening reads them back", () => {
  const saved = withWindows(OVI_TEXT, WINDOWS);
  assert.deepEqual(savedWindows(saved), WINDOWS);
  assert.equal(withoutWindows(saved), OVI_TEXT);
  assert.equal(savedWindows(OVI_TEXT), null);
  assert.equal(savedWindows(null), null);
});

test("moving or scrolling a window never makes the OVI modified, but an edit still does (measured)", () => {
  const registry = createRegistry();
  const { entry } = registry.open({ path: "/tmp/a.sdg", initialText: OVI_TEXT });
  recordChange(entry, OVI_TEXT);
  recordSave(entry, "/tmp/a.sdg", withWindows(OVI_TEXT, WINDOWS));
  recordChange(entry, OVI_TEXT);
  assert.equal(isDirty(entry), false);
  recordChange(entry, OVI_TEXT.replace('"nodes": []', '"nodes": [{"name":"a","type":"add"}]'));
  assert.equal(isDirty(entry), true);
});

test("a window opens where it was saved while that is on a screen, or else where a new VI's opens", () => {
  assert.deepEqual(restoredBounds(WINDOWS["front-panel"], [SCREEN], FALLBACK), { x: 200, y: 150, width: 900, height: 550 });
  assert.deepEqual(restoredBounds({ x: 5000, y: 150, width: 900, height: 550 }, [SCREEN], FALLBACK), FALLBACK);
  assert.deepEqual(restoredBounds(undefined, [SCREEN], FALLBACK), FALLBACK);
});

test("a window records its origin only when it was scrolled", () => {
  assert.deepEqual(windowRecord({ x: 1, y: 2, width: 3, height: 4 }, { x: 0, y: 0 }), { x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual(windowRecord({ x: 1, y: 2, width: 3, height: 4 }, { x: -183, y: 0 }), { x: 1, y: 2, width: 3, height: 4, origin: { x: -183, y: 0 } });
});
