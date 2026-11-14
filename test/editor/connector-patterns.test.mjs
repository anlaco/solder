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
import { cellRect, connectorTerminals } from "../../core/model/connector.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CONNECTOR_PATTERNS, gridPosition, patternNamed, patternNumbered } from "../../core/model/connector-patterns.mjs";
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
  assert.equal(cellRect(7).x, 8, "LabVIEW's index 7 is the top of the left middle column");
});

// DT-075: the table of NI's Connector Pane Pattern Reference.vi (reports/2026-11-05-connector-4833.md).
test("each pattern's terminals, by LabVIEW's connector index, cover its 32 × 32 pane once, and the known ones sit where measured", () => {
  for (const pattern of CONNECTOR_PATTERNS) {
    const covered = new Map();
    pattern.terminals.forEach(({ x, y, width, height }, index) => {
      for (let column = x; column < x + width; column++) for (let row = y; row < y + height; row++) covered.set(`${column},${row}`, (covered.get(`${column},${row}`) ?? 0) + 1);
    });
    assert.equal(covered.size, 32 * 32, `${pattern.number} covers the pane`);
    assert.ok([...covered.values()].every((count) => count === 1), `${pattern.number}'s terminals do not overlap`);
  }
  assert.deepEqual(CONNECTOR_PATTERNS.map((pattern) => pattern.number).slice(30), [4814, 4829, 4815, 4833, 4834, 4835], "the last row of the grid");
  const p4833 = patternNumbered(4833).terminals.map(({ x, y }) => [x, y]);
  assert.deepEqual([0, 5, 7, 9, 11].map((index) => p4833[index]), [[0, 0], [0, 7], [0, 13], [0, 19], [0, 25]], "4833's left column, top to bottom");
  assert.deepEqual([1, 2, 3].map((index) => p4833[index]), [[7, 0], [13, 0], [19, 0]], "its top middle cells");
  assert.deepEqual([12, 13, 14].map((index) => p4833[index]), [[7, 16], [13, 16], [19, 16]], "its bottom middle cells");
  assert.deepEqual([4, 6, 8, 10, 15].map((index) => p4833[index]), [[25, 0], [25, 7], [25, 13], [25, 19], [25, 25]], "its right column, top to bottom");
});

test("the Patterns row opens a 6 by 6 grid of 36 thumbnails and the current one is outlined", () => {
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
  assert.equal(cells.filter((cell) => cell[1].includes("hueco")).length, 0, "every pattern can be chosen");

  // Choosing the current one closes the menu and changes nothing.
  const chosen = ED.orden(panel, CP.currentPatternRow(panel.g), {});
  assert.equal(chosen.menu, null);
  assert.equal(chosen.g, panel.g);
});

// Measured in LabVIEW 2026 Q3 (reports/2026-11-13-connector-pattern-change.md §1): a 4-2-2-4 pane with controls on
// indices 0, 3, 8 and 11 and an indicator on 4, changed from Patterns; each result is `index: name` after the change.
const FIVE_TERMINALS = { 0: "c0", 3: "c3", 4: "i4", 8: "c8", 11: "c11" };
const MEASURED_FROM_4815 = {
  4833: { 0: "c11", 4: "c3", 11: "c8", 14: "i4", 15: "c0" },
  4835: { 0: "c11", 6: "c8", 15: "i4", 20: "c3", 26: "c0" },
  4834: { 0: "c11", 5: "c8", 11: "i4", 14: "c3", 19: "c0" },
  4816: { 0: "c11", 1: "c3", 3: "c8", 4: "i4", 5: "c0" },
  4800: { 0: "i4" },
  4806: { 0: "i4", 1: "c0", 2: "c11", 3: "c3" },
  4801: { 0: "i4", 1: "c8" },
  4803: { 0: "i4", 1: "c0", 2: "c3" },
  4805: { 0: "i4", 1: "c3", 2: "c8", 3: "c11" },
  4830: { 0: "c0", 1: "i4", 2: "c8", 3: "c11" },
  4804: { 0: "i4", 1: "c8", 2: "c0", 3: "c11" },
};
// The same report, §2: one control on each index 0–11 of 4-2-2-4 in turn, and the index it ends on.
const MEASURED_SINGLE_FROM_4815 = {
  4806: [0, 1, 2, 3, 0, 2, 0, 2, 0, 1, 2, 3],
  4801: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
  4830: [0, 0, 0, 0, 1, 1, 2, 3, 2, 2, 3, 3],
};

const paneWith = (byCell) => ({
  ...Gr.nuevo(),
  vi: { connector: { pattern: 4815, inputs: Object.entries(byCell).filter(([, name]) => name.startsWith("c")).map(([cell, name]) => ({ name, cell: Number(cell) })), outputs: Object.entries(byCell).filter(([, name]) => name.startsWith("i")).map(([cell, name]) => ({ name, cell: Number(cell) })) } },
});
const cellsByName = (g) => Object.fromEntries(connectorTerminals(g.vi.connector).map((terminal) => [terminal.cell, terminal.name]));
const choosePattern = (g, number) => {
  const menu = CP.openMenu({ ...P.inicial(), g }, CP.MENU_ROOT, 100, 50, null);
  return ED.orden(menu, `${PATTERNS_ROW}.${patternNumbered(number).id}`, {});
};

test("choosing a pattern moves each terminal to the nearest cell as LabVIEW does", () => {
  for (const [number, expected] of Object.entries(MEASURED_FROM_4815)) {
    const chosen = choosePattern(paneWith(FIVE_TERMINALS), Number(number));
    assert.equal(chosen.menu, null);
    assert.equal(chosen.g.vi.connector.pattern, Number(number));
    assert.deepEqual(cellsByName(chosen.g), expected, `4815 → ${number}`);
  }
  for (const [number, ends] of Object.entries(MEASURED_SINGLE_FROM_4815)) {
    const landed = ends.map((_, cell) => Number(Object.keys(cellsByName(choosePattern(paneWith({ [cell]: "c" }), Number(number)).g))[0]));
    assert.deepEqual(landed, ends, `one control on each cell of 4815 → ${number}`);
  }
});

test("a terminal that loses its cell keeps its role elsewhere and its panel object", () => {
  const chosen = choosePattern(paneWith(FIVE_TERMINALS), 4800);
  assert.deepEqual(connectorTerminals(chosen.g.vi.connector).map(({ name, dir }) => [name, dir]), [["i4", "out"]]);
  // An empty pane keeps a pattern of its own, as LabVIEW does.
  const empty = choosePattern(Gr.nuevo(), 4833);
  assert.equal(empty.g.vi.connector.pattern, 4833);
  assert.deepEqual(connectorTerminals(empty.g.vi.connector), []);
});

