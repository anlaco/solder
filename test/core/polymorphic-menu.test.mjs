// The instance menu of a polymorphic OVI and the lines of its selector, as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-poly-selector.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Menu from "../../core/model/polymorphic-menu.mjs";

const instance = (menuName, selectorName = menuName) => ({ path: `${menuName}.sdg`, menuName, selectorName });
const polymorphic = (menuNames, adaptToDataType = true) => ({ instances: menuNames.map((name) => instance(name)), adaptToDataType });

/** The menu as text: labels, ▸ for submenus, — for separators, ✓ for checked rows. */
const shown = (rows) => rows.map((row) => (row.separator ? "—" : `${row.checked ? "✓" : ""}${row.label}${row.children ? ` ▸ [${shown(row.children).join(", ")}]` : ""}`));

// DAQmx Read's Analog branch, as far as the report opened it.
const DAQMX_READ = polymorphic([
  "Analog:Single Channel:Single Sample:DBL",
  "Analog:Single Channel:Single Sample:Waveform",
  "Analog:Single Channel:Multiple Samples:1D DBL",
  "Analog:Unscaled:2D I16",
  "Digital:1Chan 1Samp:Boolean (1 Line)",
], false);

test("':' in a menu name makes submenus, in the order of the list, the leaf named by its last level", () => {
  assert.deepEqual(shown(Menu.selectorMenu(DAQMX_READ, { automatic: false, instance: 0 })), [
    "✓Analog ▸ [✓Single Channel ▸ [✓Single Sample ▸ [✓DBL, Waveform], Multiple Samples ▸ [1D DBL]], Unscaled ▸ [2D I16]]",
    "Digital ▸ [1Chan 1Samp ▸ [Boolean (1 Line)]]",
  ], "measured: every row on the path to the current instance is ticked");
});

test("an OVI that adapts to the data type has Automatic and a separator first, ticked while the node is on it", () => {
  const user = polymorphic(["A:B", "A:C"]);
  assert.deepEqual(shown(Menu.selectorMenu(user, { automatic: true, instance: 0 })), ["✓Automatic", "—", "A ▸ [B, C]"], "measured");
  assert.deepEqual(shown(Menu.selectorMenu(user, { automatic: false, instance: 1 })), ["Automatic", "—", "✓A ▸ [B, ✓C]"]);
  assert.equal(Menu.selectorMenu(DAQMX_READ, { automatic: false, instance: 0 })[0].label, "Analog", "measured: DAQmx Read, which does not adapt, has no Automatic");
});

test("a trailing ':' is dropped and an empty level gives a separator and ends the path, as seen", () => {
  assert.deepEqual(shown(Menu.instanceMenuTree(polymorphic(["A:"]))), ["A"]);
  assert.deepEqual(shown(Menu.instanceMenuTree(polymorphic(["A::C"]))), ["A ▸ [—]"]);
});

test("a selector name breaks into lines at its line breaks, each line 15 px taller than one", () => {
  assert.deepEqual(Menu.selectorLines("Analog DBL\n1Chan 1Samp"), ["Analog DBL", "1Chan 1Samp"]);
  assert.equal(Menu.selectorHeight("One line"), 19, "measured");
  assert.equal(Menu.selectorHeight("Top\nBot"), 34, "measured");
});
