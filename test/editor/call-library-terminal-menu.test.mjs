// The right-click menu of a parameter's terminal on the Call Library Function Node (DT-080), and what its Create ▸ does by
// the parameter's type. Measured in labview-captures/reports/2026-11-15-daqname-menus.md (Q4): a node with one unwired Adapt
// to Type parameter (Handles by Value); the error terminals' Create ▸ was enabled. The captures are local evidence and are
// not committed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as TC from "../../editor/src/block-diagram/terminal-creation.mjs";
import * as DS from "../../editor/src/debugging/debug-state.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";
import { hover, menuRows, shown } from "./menu-rows.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const ROOT = "context.call-library-terminal";

// Q4's node: `void funcName(void *arg1);`, the parameter Adapt to Type, and a typed one next to it.
const ADAPT = { name: "arg1", type: "adapt-to-type", "data-format": "handles-by-value" };
const TYPED = { name: "count", type: "numeric", "data-type": "i32", pass: "value" };

function nodeWith(parameters) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, "call-library", 100, 60);
  const g = Gr.fijarConfig(created.g, created.id, { function: "funcName", parameters });
  return { g, id: created.id, node: g.nodos.find((candidate) => candidate.id === created.id) };
}

const openOn = ({ g, id, node }, port) => ED.abrirMenu({ ...ED.inicial(), g }, D.menuDe(node, port, g, false, CAT), id, 0, 0, port);

test("the terminal menu of a Call Library Function Node parameter has the measured rows", () => {
  const subject = nodeWith([ADAPT]);
  for (const port of ["arg-0-in", "arg-0-out"]) {
    const opened = openOn(subject, port);
    assert.equal(opened.menu.raiz, ROOT, port);
    assert.deepEqual(shown(menuRows(opened)), [
      "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Libraries & Executables Palette", "Create", "---", "Replace", "---",
      "Name Format", "Configure...", "Create C File", "---", "Remove and Rewire", "---", "Properties",
    ], `${port}: Q4's rows in its order`);
    assert.deepEqual(menuRows(opened).filter((row) => row.greyed).map((row) => row.label),
      ["Visible Items", "Help", "Examples", "Description and Tip...", "Libraries & Executables Palette", "Replace", "Create C File", "Remove and Rewire", "Properties"]);
    for (const hole of menuRows(opened).filter((row) => row.greyed)) assert.match(INV.explicacion(INV.resolver(hole.id)).solder, /^Missing: /, hole.label);
  }
  // The error and path terminals and the return value keep the node's menu: their own were not opened.
  assert.equal(D.menuDe(subject.node, "error-in", subject.g, false, CAT), "context.call-library", "(their Create was measured enabled, with Constant: unverified here)");
  assert.equal(D.menuDe(subject.node, null, subject.g, false, CAT), "context.call-library");
  const opened = openOn(subject, "arg-0-in");
  // Name Format ticks No Names, as the node's does; Configure... opens the dialog.
  assert.deepEqual(menuRows(hover(opened, `${ROOT}.name-format`), `${ROOT}.name-format`).map((row) => [row.label, row.checked, row.greyed]), [["No Names", true, false], ["Names", false, true]]);
  assert.equal(ED.orden(opened, `${ROOT}.configure`, CTX).callLibraryDialog.nodo, subject.id);
  // Add Breakpoint is the debugger's row: with a breakpoint on the node it says Remove Breakpoint.
  const state = DS.addBreakpoint(DS.initial(), { node: subject.id });
  assert.equal(DV.menuVariants(state, subject.g, Gr.tipos(subject.g, CAT), opened.menu).rotulos.get(`${ROOT}.add-breakpoint`), "Remove Breakpoint");
  assert.ok(!esHueco(INV.entrada(`${ROOT}.add-breakpoint`)));
});

test("Create on the terminal of a Call Library Function Node parameter is greyed while it adapts and works once it is typed", () => {
  const createRows = (d) => menuRows(hover(d, `${ROOT}.create`), `${ROOT}.create`);
  const subject = nodeWith([ADAPT, TYPED]);

  // Q4: on an unwired Adapt to Type parameter Constant, Control, Indicator and Channel Writer... are greyed; the two "All" items are not.
  for (const port of ["arg-0-in", "arg-0-out"]) {
    const rows = createRows(openOn(subject, port));
    assert.deepEqual(shown(rows), ["Constant", "Control", "Indicator", "Channel Writer...", "---", "All Controls and Indicators", "All Constants"], port);
    assert.deepEqual(rows.map((row) => row.greyed), [true, true, true, true, false, false], `${port}: greyed as LabVIEW greys them`);
    const made = TC.createForTerminal(subject.g, CTX, { nodo: subject.id, puerto: port, kind: "constant" });
    assert.match(made.motivo, /not known yet/, `${port}: and the reason is there if it is asked anyway`);
  }

  // A typed parameter: Constant, Control and Indicator work through Create on a terminal; Channel Writer... is greyed (no channels yet).
  const typedIn = createRows(openOn(subject, "arg-1-in"));
  assert.deepEqual(typedIn.map((row) => [row.label, row.greyed]), [["Constant", false], ["Control", false], ["Indicator", false], ["Channel Writer...", true], ["All Controls and Indicators", false], ["All Constants", false]]);
  assert.match(INV.explicacion(INV.entrada(`${ROOT}.create.channel-writer`)).solder, /^Missing: /);
  for (const [port, kind, tipo] of [["arg-1-in", "constant", "num-const"], ["arg-1-in", "control", "control"], ["arg-1-out", "indicator", "indicator"]]) {
    const made = ED.orden(hover(openOn(subject, port), `${ROOT}.create`), `${ROOT}.create.${kind}`, CTX);
    const [created] = made.g.nodos.filter((candidate) => candidate.id !== subject.id);
    assert.equal(created?.tipo, tipo, `${port} ${kind}`);
    assert.equal(made.g.cables.length, 1, `${port} ${kind}: wired to the terminal`);
    assert.equal(made.menu, null);
  }

  // Once the Adapt to Type parameter is wired its type is known and the rows are enabled.
  const constant = Gr.crearNodo(subject.g, CAT, "const", 0, 0);
  const wired = Gr.conectar(constant.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: subject.id, puerto: "arg-0-in", dir: "in" }).g;
  const adapted = createRows(openOn({ ...subject, g: wired, node: wired.nodos.find((candidate) => candidate.id === subject.id) }, "arg-0-out"));
  assert.deepEqual(adapted.slice(0, 3).map((row) => row.greyed), [false, false, false], "its output takes the wired type");
});
