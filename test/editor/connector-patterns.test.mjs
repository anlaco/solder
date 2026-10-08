// The Patterns submenu of the connector pane's right-click menu: 36 icon-only
// thumbnails in a 6 × 6 grid, the current pattern outlined in blue (spec/05 §12,
// labview-captures/subvi/connector-menu-patterns.png and
// connector-patterns-grid-zoom2x.png). Pure functions, no browser.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CP from "../../editor/src/front-panel/connector-pane.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { cellRect } from "../../core/model/connector.mjs";
import { CONNECTOR_PATTERNS, gridPosition, patternNamed } from "../../core/model/connector-patterns.mjs";
import { INV } from "../helpers.mjs";

const PATTERNS_ROW = `${CP.MENU_ROOT}.patterns`;
const CURRENT_ID = "pattern-33";

// Cells counted by eye on connector-patterns-grid-zoom2x.png, row by row.
const CELLS_PER_PATTERN_IN_THE_CAPTURE = [1, 3, 4, 2, 3, 4, 4, 4, 5, 5, 6, 6, 5, 6, 7, 8, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 7, 8, 9, 10, 11, 12, 16, 20, 28];

const submenuHtml = () => {
  const panel = ED.sobreMenu(CP.openMenu(P.inicial(), CP.MENU_ROOT, 100, 50, null), PATTERNS_ROW, true);
  const marks = ED.marcados(panel);
  return { panel, html: D.menuContextual(INV, panel.menu, marks, undefined, ED.variantes(panel)) };
};

test("the 36 connector patterns are in the order of the grid and 4-2-2-4 is at row 6, column 3 with 12 cells", () => {
  assert.equal(CONNECTOR_PATTERNS.length, 36);
  assert.equal(new Set(CONNECTOR_PATTERNS.map((pattern) => pattern.id)).size, 36);
  assert.deepEqual(CONNECTOR_PATTERNS.map((pattern) => pattern.cells.length), CELLS_PER_PATTERN_IN_THE_CAPTURE);
  const current = patternNamed("4-2-2-4");
  assert.equal(current.id, CURRENT_ID);
  assert.deepEqual(gridPosition(current.id), { row: 6, column: 3 });
  assert.equal(current.cells.length, 12);
  assert.equal(CONNECTOR_PATTERNS.filter((pattern) => pattern.name).length, 1, "only the one outlined in blue has a known name");
});

test("the cells of every pattern tile its 32 × 32 thumbnail and those of 4-2-2-4 are the ones of the connector", () => {
  for (const pattern of CONNECTOR_PATTERNS) {
    const area = pattern.cells.reduce((sum, { left, top, right, bottom }) => sum + (right - left - 1) * (bottom - top - 1), 0);
    const walls = 30 * 30 - area;
    assert.ok(walls >= 0 && pattern.cells.every((cell) => cell.left < cell.right && cell.top < cell.bottom), `${pattern.id} has valid cells`);
    for (const cell of pattern.cells) assert.ok(cell.left >= 0 && cell.right <= 31 && cell.top >= 0 && cell.bottom <= 31, `${pattern.id} stays inside the frame`);
  }
  // The pane of 4-2-2-4 has its cells at multiples of 8 (cellRect): the thumbnail's lines are at the same places.
  const lines = new Set(patternNamed("4-2-2-4").cells.flatMap((cell) => [cell.left, cell.right]));
  assert.deepEqual([...lines].sort((a, b) => a - b), [0, 8, 16, 24, 31]);
  assert.equal(cellRect(4).x, 8);
});

test("the Patterns row opens a 6 by 6 grid of 36 thumbnails and only 4-2-2-4 can be chosen", () => {
  const { panel, html } = submenuHtml();
  assert.equal(panel.menu.abierto, PATTERNS_ROW, "hovering Patterns opens the submenu");
  assert.equal(INV.resolver(PATTERNS_ROW).estado, "built");
  assert.equal(INV.hijos(PATTERNS_ROW).length, 36);

  const grid = html.slice(html.indexOf(`menu-contextual rejilla" data-menu="${PATTERNS_ROW}"`));
  assert.ok(grid.includes("rejilla"), "an icon grid, not a list");
  assert.match(grid, /width:302px;height:301px/, "the size measured in the capture");
  const cells = [...grid.matchAll(/class="item-menu celda-rep celda-patron([^"]*)" data-id="[^"]*\.patterns\.(pattern-\d\d)" style="left:([\d.]+)px;top:([\d.]+)px"/g)];
  assert.equal(cells.length, 36);
  assert.equal(grid.match(/<svg/g).length, 36, "one thumbnail per cell");
  assert.ok(!grid.includes("texto-menu") && !grid.includes("nombre-celda"), "icon-only, no labels");
  // 6 columns, 48 px apart, 9 px from the border: the thumbnails of the capture at 1:1.
  const lefts = cells.slice(0, 6).map((cell) => Number(cell[3]));
  assert.deepEqual(lefts, [9, 57, 105, 153, 201, 249]);
  assert.deepEqual([0, 6, 12, 18, 24, 30].map((i) => Number(cells[i][4])), [9, 57, 105, 153, 201, 249]);

  assert.deepEqual(cells.filter((cell) => cell[1].includes("marcado")).map((cell) => cell[2]), [CURRENT_ID], "the current one is outlined");
  assert.deepEqual(cells.filter((cell) => !cell[1].includes("hueco")).map((cell) => cell[2]), [CURRENT_ID], "the other 35 are greyed");

  // Choosing the current one closes the menu and changes nothing; a greyed one does nothing.
  const chosen = ED.orden(panel, CP.CURRENT_PATTERN_ROW, {});
  assert.equal(chosen.menu, null);
  assert.equal(chosen.g, panel.g);
  const other = ED.orden(panel, `${PATTERNS_ROW}.pattern-01`, {});
  assert.equal(other.g, panel.g);
});

test("a greyed pattern says why it cannot be chosen", () => {
  const entry = INV.resolver(`${PATTERNS_ROW}.pattern-01`);
  assert.equal(entry.estado, "todo");
  assert.equal(entry.necesita, "patrones-del-connector");
  assert.ok(INV.explicacion(entry).solder.length > 0);
  for (const row of INV.hijos(PATTERNS_ROW)) assert.equal(row.estado === "built", row.id.endsWith(CURRENT_ID));
});
