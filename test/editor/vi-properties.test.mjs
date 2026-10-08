// VI Properties with its Execution page (DT-045, spec/05 §12), measured in
// LabVIEW 2026 Q3: labview-captures/subvi/vi-properties-execution-default.png.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as E from "../../editor/src/window/window-state.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as VP from "../../editor/src/window/vi-properties.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV, buildAdder } from "../helpers.mjs";

test("VI Properties opens on Execution with the reentrancy of the VI and OK writes it into vi execution", () => {
  const { g } = buildAdder();
  let dialog = VP.open(g);
  assert.deepEqual(dialog, { page: "execution", reentrancy: "non-reentrant" }, "a new VI is non-reentrant");

  dialog = VP.choose(dialog, "preallocated");
  const preallocated = VP.apply(g, dialog);
  assert.deepEqual(preallocated.vi.execution, { reentrancy: "preallocated" });
  assert.equal(Q.escribir(preallocated, CAT).execution.reentrancy, "preallocated", "it is written to the file");
  assert.equal(Q.leer(Q.aTexto(preallocated, CAT), CAT).vi.execution.reentrancy, "preallocated", "and read back");
  assert.equal(VP.open(preallocated).reentrancy, "preallocated", "the dialog shows what the VI has");

  // Back to the default: nothing is stored, and a VI with nothing else has no `vi` at all.
  const back = VP.apply(preallocated, VP.choose(VP.open(preallocated), "non-reentrant"));
  assert.equal(back.vi, undefined);
  assert.equal("execution" in Q.escribir(back, CAT), false);
  // The rest of `vi` is kept.
  const withConnector = { ...preallocated, vi: { ...preallocated.vi, connector: { inputs: [], outputs: [] } } };
  assert.deepEqual(VP.apply(withConnector, VP.choose(VP.open(withConnector), "non-reentrant")).vi, { connector: { inputs: [], outputs: [] } });

  // The dialog is where File ▸ VI Properties (Ctrl+I) and the right-click menus lead.
  for (const id of ["window.front-panel.menu.file.vi-properties", "window.block-diagram.menu.file.vi-properties", "context.connector-pane.vi-properties", "context.vi-icon.vi-properties"]) {
    assert.equal(INV.entrada(id).estado, "built", id);
  }
  assert.equal(INV.entrada("window.front-panel.menu.file.vi-properties").atajo, "Ctrl+I");
});

test("shared clone reentrancy cannot be chosen and its option is declared as not done", () => {
  const dialog = VP.open(buildAdder().g);
  assert.equal(VP.choose(dialog, "shared-clone"), dialog, "it changes nothing");
  const shared = INV.entrada("dialog.vi-properties.execution.shared-clone-reentrant-execution");
  assert.equal(shared.estado, "todo");
  assert.equal(shared.necesita, "clones-compartidos");
  assert.match(INV.explicacion(shared).solder, /clones compartidos/i);
  // A click on it explains why instead of choosing it (rule 53).
  const state = E.clic(E.inicial(), INV, shared.id, { x: 10, y: 10 });
  assert.equal(state.abierta.id, shared.id);
});

test("the dialog is drawn from the inventory with the unfinished settings greyed out", () => {
  const html = VP.view(INV, VP.choose(VP.open(buildAdder().g), "preallocated"));
  const classOf = (id) => new RegExp(`class="([^"]*)" data-id="${id.replaceAll(".", "\\.")}"`).exec(html)?.[1] ?? "";
  // The options that work are not holes; the selected one is marked.
  assert.ok(!classOf("dialog.vi-properties.execution.non-reentrant-execution").includes("hueco"));
  assert.ok(classOf("dialog.vi-properties.execution.preallocated-clone-reentrant-execution").includes("marcada"));
  assert.ok(!classOf("dialog.vi-properties.execution.non-reentrant-execution").includes("marcada"));
  // What is not done is greyed out.
  for (const id of ["shared-clone-reentrant-execution", "allow-debugging", "inline-subvi-into-calling-vis", "priority", "preferred-execution-system", "enable-automatic-error-handling", "run-when-opened", "suspend-when-called", "clear-indicators-when-called", "auto-handle-menus-at-launch"]) {
    assert.ok(classOf(`dialog.vi-properties.execution.${id}`).includes("hueco"), id);
    assert.ok(esHueco(INV.entrada(`dialog.vi-properties.execution.${id}`)), id);
  }
  // The defaults of the capture: debugging and automatic error handling on, the rest off.
  assert.ok(classOf("dialog.vi-properties.execution.allow-debugging").includes("marcada"));
  assert.ok(classOf("dialog.vi-properties.execution.enable-automatic-error-handling").includes("marcada"));
  assert.ok(!classOf("dialog.vi-properties.execution.run-when-opened").includes("marcada"));
  assert.match(html, /Preallocated clone reentrant execution/);
  // The category list is what the capture shows, with only Execution done.
  assert.deepEqual(INV.hijos(VP.CATEGORIES_ID).map((e) => e.etiqueta), ["General", "Memory Usage", "Documentation", "Revision History", "Editor Options", "Protection", "Window Appearance", "Window Size", "Window Run-Time Position", "Execution", "Print Options"]);
  assert.deepEqual(INV.hijos(VP.CATEGORIES_ID).filter((e) => !esHueco(e)).map((e) => e.etiqueta), ["Execution"]);
});
