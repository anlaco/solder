// The connector pane on the Front Panel and its menus (DT-045, spec/05 §12),
// measured in LabVIEW 2026 Q3 (labview-captures/subvi/). No browser needed:
// connector.mjs, connector-pane.mjs and the menu code are pure functions.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CP from "../../editor/src/front-panel/connector-pane.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import { assignPanelElement, cellAnchor, cellAt, cellRect, connectorTerminals, pruneConnector } from "../../core/model/connector.mjs";
import { CAT, INV, buildAdder } from "../helpers.mjs";

const filas = (raiz) => INV.hijos(raiz).map((e) => `${e.etiqueta}${e.separado ? " |" : ""}`);

/** The Front Panel state of the adder, with `x` in cell 0, `y` in cell 1 and `sum` in cell 8, as in connector-assigned-zoom8x.png. */
function connectedAdder() {
  const { g, ids } = buildAdder();
  let panel = P.inicial(g);
  for (const [id, cell] of [[ids.x, 0], [ids.y, 1], [ids.sum, 8]]) {
    panel = CP.selectCell(panel, cell);
    panel = CP.assignClicked(panel, CAT, id);
  }
  return { panel, ids };
}

test("the cells of the pattern 4-2-2-4 are the ones of the capture", () => {
  assert.deepEqual(cellRect(0), { x: 0, y: 0, width: 8, height: 8 });
  assert.deepEqual(cellRect(3), { x: 0, y: 24, width: 8, height: 8 });
  assert.deepEqual(cellRect(4), { x: 8, y: 0, width: 8, height: 16 }, "the middle columns have two tall cells");
  assert.deepEqual(cellRect(7), { x: 16, y: 16, width: 8, height: 16 });
  assert.deepEqual(cellRect(11), { x: 24, y: 24, width: 8, height: 8 });
  assert.equal(cellAt({ x: 4, y: 12 }), 1);
  assert.equal(cellAt({ x: 12, y: 20 }), 5);
  assert.equal(cellAt({ x: 28, y: 30 }), 11);
  assert.equal(cellAt({ x: 40, y: 4 }), null);
  assert.deepEqual(cellAnchor(2), { side: "left", x: 0, y: 20 });
  assert.deepEqual(cellAnchor(9), { side: "right", x: 32, y: 12 });
});

test("assigning a control and an indicator to cells writes the connector with its pattern cells and connections", () => {
  const { panel, ids } = connectedAdder();
  assert.equal(panel.conector, null, "the selected cell is let go once it has its element");
  const file = Q.escribir(panel.g, CAT);
  const nameOf = (id) => panel.g.nodos.find((n) => n.id === id).name;
  assert.deepEqual(file.connector, {
    pattern: "4-2-2-4",
    inputs: [{ name: nameOf(ids.x), cell: 0 }, { name: nameOf(ids.y), cell: 1 }],
    outputs: [{ name: nameOf(ids.sum), cell: 8 }],
  }, "a new terminal is Recommended, which is not written");

  // The file reads back the same and its ports sit on the cells (DT-045).
  const back = Q.leer(JSON.stringify(file), CAT);
  assert.deepEqual(connectorTerminals(back.vi.connector).map((t) => [t.dir, t.cell, t.connection]), [["in", 0, "recommended"], ["in", 1, "recommended"], ["out", 8, "recommended"]]);

  // Clicking an element that is already assigned moves it; clicking a cell that has one takes it over.
  const moved = assignPanelElement(panel.g, CAT, ids.x, 3);
  assert.deepEqual(connectorTerminals(moved.vi.connector).map((t) => [t.name === nameOf(ids.x), t.cell]).filter(([isX]) => isX), [[true, 3]]);
  const taken = assignPanelElement(panel.g, CAT, ids.y, 0);
  assert.deepEqual(connectorTerminals(taken.vi.connector).filter((t) => t.cell === 0).map((t) => t.name), [nameOf(ids.y)]);
  assert.equal(connectorTerminals(taken.vi.connector).length, 2, "x lost its cell and y left cell 1");

  // A click on the background only lets go of the selected cell.
  const waiting = CP.selectCell(P.inicial(buildAdder().g), 5);
  assert.deepEqual(waiting.conector, { celda: 5 });
  assert.equal(CP.assignClicked(waiting, CAT, null).conector, null);
  assert.equal(CP.selectCell(waiting, 5).conector, null, "clicking the selected cell again lets it go");
});

test("disconnecting terminals and This Connection Is change the connector and an output cannot be Required", () => {
  const { panel, ids } = connectedAdder();
  const open = (cell) => CP.openMenu(panel, CP.MENU_ROOT, 10, 10, cell);
  const nameOf = (id) => panel.g.nodos.find((n) => n.id === id).name;

  let state = ED.orden(open(0), `${CP.MENU_ROOT}.this-connection-is.required`);
  assert.equal(state.menu, null, "the order closes the menu");
  assert.deepEqual(state.g.vi.connector.inputs[0], { name: nameOf(ids.x), cell: 0, connection: "required" });
  state = ED.orden(open(0), `${CP.MENU_ROOT}.this-connection-is.optional`);
  assert.equal(state.g.vi.connector.inputs[0].connection, "optional");
  state = ED.orden({ ...open(0), g: state.g }, `${CP.MENU_ROOT}.this-connection-is.recommended`);
  assert.equal(state.g.vi.connector.inputs[0].connection, undefined, "Recommended is the default and is not written");

  // An output is never Required.
  const attempt = ED.orden(open(8), `${CP.MENU_ROOT}.this-connection-is.required`);
  assert.equal(attempt.g, panel.g);

  state = ED.orden(open(1), `${CP.MENU_ROOT}.disconnect-this-terminal`);
  assert.deepEqual(connectorTerminals(state.g.vi.connector).map((t) => t.cell), [0, 8]);
  // Nothing under the cursor: the order does nothing.
  assert.equal(ED.orden(open(5), `${CP.MENU_ROOT}.disconnect-this-terminal`).g, panel.g);

  state = ED.orden(open(5), `${CP.MENU_ROOT}.disconnect-all-terminals`);
  assert.equal(state.g.vi, undefined, "with no terminals left there is no connector");
});

test("the connector menu greys what needs a terminal under the cursor", () => {
  const { panel } = connectedAdder();
  const variants = (cell) => ED.variantes(CP.openMenu(panel, CP.MENU_ROOT, 0, 0, cell));
  assert.deepEqual([...variants(5).desactivados].sort(), [`${CP.MENU_ROOT}.disconnect-this-terminal`, `${CP.MENU_ROOT}.this-connection-is`]);
  assert.deepEqual([...variants(0).desactivados], [], "an input: everything available");
  assert.deepEqual([...variants(8).desactivados], [`${CP.MENU_ROOT}.this-connection-is.required`], "an output cannot be Required");
  const marks = (cell) => [...ED.marcados(CP.openMenu(panel, CP.MENU_ROOT, 0, 0, cell))];
  assert.deepEqual(marks(0), [CP.CURRENT_PATTERN_ROW, `${CP.MENU_ROOT}.this-connection-is.recommended`], "Recommended is checked by default, and the pattern in use");
  assert.deepEqual(marks(5), [CP.CURRENT_PATTERN_ROW]);

  const html = D.menuContextual(INV, CP.openMenu(panel, CP.MENU_ROOT, 0, 0, 5).menu, new Set(), undefined, variants(5));
  assert.match(html, /class="item-menu desactivado"[^>]*data-id="context\.connector-pane\.disconnect-this-terminal"/);
  assert.match(html, /class="item-menu hueco"[^>]*data-id="context\.connector-pane\.add-terminal"/, "what is not done is a hole");
});

test("the connector pane is drawn with a cell per terminal in the colour of its type", () => {
  const { panel } = connectedAdder();
  const glyph = CP.paneGlyph(panel.g, CAT);
  const orange = "#ff7f00";
  assert.equal(glyph.split(orange).length - 1, 3, "two input cells filled, and the square inside the black cell of the output");
  assert.match(glyph, /fill="#141414"/, "an output is a black cell");
  assert.equal(CP.paneGlyph(P.inicial(buildAdder().g).g, CAT).includes(orange), false, "with no terminals, no colour");
  assert.match(CP.paneGlyph(panel.g, CAT, 6), /stroke="#0078d7"/, "the selected cell is marked");
  // Where a click falls: the pane is drawn at 32 × 32 and a click is scaled to it.
  assert.equal(CP.cellUnderPointer({ left: 100, top: 50, width: 32 }, { clientX: 104, clientY: 62 }), 1);
});

test("a deleted control or indicator leaves the connector", () => {
  const { panel, ids } = connectedAdder();
  const without = P.borrarSeleccion({ ...panel, seleccion: [ids.y] });
  const pruned = pruneConnector(without.g, CAT);
  assert.deepEqual(connectorTerminals(pruned.vi.connector).map((t) => t.cell), [0, 8]);
  assert.equal(pruneConnector(panel.g, CAT), panel.g, "nothing to drop: the same graph");
});

test("the menus of the connector pane and of the icon are declared in the order of LabVIEW", () => {
  assert.deepEqual(filas("context.connector-pane"), [
    "VI Properties", "Set Icon to VI Name", "Find All Instances", "Add Terminal |", "Remove Terminal", "Patterns", "Rotate 90 Degrees", "Flip Horizontal", "Flip Vertical",
    "Disconnect All Terminals", "Disconnect This Terminal |", "This Connection Is",
  ]);
  assert.deepEqual(filas("context.connector-pane.this-connection-is"), ["Required", "Recommended", "Optional"]);
  assert.deepEqual(filas("context.vi-icon"), ["VI Properties", "Edit Icon...", "Set Icon to VI Name", "Find All Instances |"]);
  // What works is built; what needs the other patterns or the icon editor says why not.
  for (const id of ["vi-properties", "disconnect-all-terminals", "disconnect-this-terminal"]) assert.equal(INV.entrada(`context.connector-pane.${id}`).estado, "built");
  assert.equal(INV.entrada("context.connector-pane.patterns").estado, "built");
  assert.equal(INV.entrada("context.connector-pane.add-terminal").necesita, "patrones-del-connector");
  assert.equal(INV.entrada("context.vi-icon.edit-icon").necesita, "icono-del-vi");
  assert.equal(INV.entrada("window.front-panel.connector-pane").estado, "built");
  assert.equal(INV.entrada("window.block-diagram.icon").estado, "built");
});
