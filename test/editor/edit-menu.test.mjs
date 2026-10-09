// The Edit menu of the two windows (labview-captures/create-paste/edit-menu-*.png).

import assert from "node:assert/strict";
import { test } from "node:test";

import { menuContextual } from "../../editor/src/block-diagram/diagram-view.mjs";
import { EDIT_COMMANDS, editMenuId, editMenuVariants } from "../../editor/src/window/edit-menu.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import * as E from "../../editor/src/window/window-state.mjs";
import { INV } from "../helpers.mjs";

/** The rows of the menu as the captures show them, with a "|" before the ones that start a group. */
const rows = (windowName) => INV.hijos(editMenuId(windowName)).map((e) => `${e.separado ? "| " : ""}${e.etiqueta}${e.atajo ? ` ${e.atajo}` : ""}`);

const COMMON_START = ["Undo Ctrl+Z", "Redo Ctrl+Shift+Z", "| Cut Ctrl+X", "Copy Ctrl+C", "Paste Ctrl+V", "Paste Special Ctrl+Shift+V", "Delete", "Select All Ctrl+A"];

test("the Edit menu has LabVIEW's rows in order on the diagram and on the panel", () => {
  assert.deepEqual(rows("block-diagram"), [
    ...COMMON_START,
    "| Make Current Values Default", "Reinitialize Values to Default",
    "| Customize Control...", "Import Picture to Clipboard...", "Set Tabbing Order...",
    "| Remove Broken Wires from Selection Ctrl+B", "Clean Up Selection Ctrl+U", "Remove Breakpoints from Hierarchy", "Create VI Snippet from Selection", "Create SubVI",
    "| Enable Diagram Grid Alignment Ctrl+#", "Show Hidden Controls While Editing", "Align Items Ctrl+Shift+A", "Distribute Items Ctrl+Shift+D",
    "| VI Revision History... Ctrl+Y", "Run-Time Menu...", "Adjust Pane Origin",
    "| Find and Replace... Ctrl+F", "Show Search Results Ctrl+Shift+F",
  ]);
  assert.deepEqual(rows("front-panel"), [
    ...COMMON_START,
    "| Make Selected Values Default", "Reinitialize Selected Values to Default",
    "| Customize Control...", "Import Picture to Clipboard...", "Set Tabbing Order...",
    "| Remove Broken Wires from Selection Ctrl+B", "Clean Up Panel Ctrl+U", "Remove Breakpoints from Hierarchy", "Create VI Snippet from Selection", "Create SubVI",
    "| Disable Panel Grid Alignment Ctrl+#", "Show Hidden Controls While Editing", "Align Items Ctrl+Shift+A", "Distribute Items Ctrl+Shift+D",
    "| VI Revision History... Ctrl+Y", "Run-Time Menu...", "Adjust Pane Origin",
    "| Find and Replace... Ctrl+F", "Show Search Results Ctrl+Shift+F",
  ]);
  for (const windowName of ["block-diagram", "front-panel"]) {
    const built = INV.hijos(editMenuId(windowName)).filter((e) => !esHueco(e)).map((e) => ultimo(e.id));
    assert.deepEqual(built.sort(), [...EDIT_COMMANDS].sort(), `${windowName}: what is done is what the window can run`);
    // The menu opens under its title, as File does.
    const opened = E.abrirMenuBarra(E.inicial(), INV, editMenuId(windowName), { x: 10, y: 20 });
    assert.equal(opened.menuBarra.id, editMenuId(windowName));
  }
});

test("Undo and Redo are greyed when there is no step to go to", () => {
  const nothing = { canUndo: false, canRedo: false, canCopy: false, hasSelection: false, clipboardFilled: true };
  const row = (name) => `${editMenuId("block-diagram")}.${name}`;
  const greyed = editMenuVariants("block-diagram", nothing).desactivados;
  assert.ok(greyed.has(row("undo")) && greyed.has(row("redo")));
  const some = editMenuVariants("block-diagram", { ...nothing, canUndo: true }).desactivados;
  assert.ok(!some.has(row("undo")) && some.has(row("redo")));
});

test("Cut Copy and Delete are greyed with nothing selected and Paste with nothing copied", () => {
  const row = (windowName, name) => `${editMenuId(windowName)}.${name}`;
  const empty = { canUndo: true, canRedo: true, canCopy: false, hasSelection: false, clipboardFilled: false };
  for (const windowName of ["block-diagram", "front-panel"]) {
    const { desactivados } = editMenuVariants(windowName, empty);
    for (const name of ["cut", "copy", "delete", "paste"]) assert.ok(desactivados.has(row(windowName, name)), `${windowName} ${name}`);
    assert.ok(!desactivados.has(row(windowName, "select-all")), "Select All is always enabled");
    const selected = editMenuVariants(windowName, { ...empty, canCopy: true, hasSelection: true, clipboardFilled: true }).desactivados;
    assert.equal(selected.size, 0);
  }
  // A selected wire can be deleted but not copied.
  assert.ok(editMenuVariants("block-diagram", { ...empty, hasSelection: true }).desactivados.has(row("block-diagram", "copy")));
  assert.ok(!editMenuVariants("block-diagram", { ...empty, hasSelection: true }).desactivados.has(row("block-diagram", "delete")));

  // "...from Selection" rows change name on the diagram with nothing selected.
  const { rotulos } = editMenuVariants("block-diagram", empty);
  assert.equal(rotulos.get(row("block-diagram", "remove-broken-wires-from-selection")), "Remove Broken Wires");
  assert.equal(rotulos.get(row("block-diagram", "clean-up-selection")), "Clean Up Diagram");
  assert.equal(editMenuVariants("block-diagram", { ...empty, hasSelection: true }).rotulos.size, 0);

  // The painted menu greys those rows and writes the new names.
  const html = menuContextual(INV, { raiz: editMenuId("block-diagram"), x: 0, y: 0 }, new Set(), undefined, editMenuVariants("block-diagram", empty));
  assert.match(html, /<div class="[^"]*\bdesactivado\b[^"]*" data-id="window\.block-diagram\.menu\.edit\.cut"/);
  assert.doesNotMatch(html, /<div class="[^"]*\bdesactivado\b[^"]*" data-id="window\.block-diagram\.menu\.edit\.select-all"/);
  assert.match(html, /Clean Up Diagram/);
  assert.doesNotMatch(html, /Clean Up Selection/);
});
