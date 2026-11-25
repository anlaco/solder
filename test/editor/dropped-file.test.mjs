// An `.octl` dragged from the Project Explorer's tree onto an OVI (DT-107 §4), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-25-placing-a-control.md Q3, local evidence never committed). Unverified: the drag
// between two Electron windows, the "no" cursor over a file that places nothing, the diagram's exact position.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ITEM_KINDS } from "../../core/model/project.mjs";
import { DBL } from "../../core/model/types.mjs";
import { typeDefinitionText } from "../../core/model/type-definition.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import { FILE_DRAG_TYPE, carriesFile, constantDroppedOnDiagram, controlDroppedOnPanel, draggableFilePath } from "../../editor/src/common/dropped-file.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { fromProject, storedPathOfRow } from "../../editor/src/project-explorer/project-explorer-state.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const octl = (kind, objects) => typeDefinitionText(kind, objects);
const numeric = (label = "Numeric") => ({ tipo: "control", label: { text: label }, config: { type: DBL, value: 3 }, x: 0, y: 0 });
const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

/** The panel after the file `text` is dropped at `point`, as the page does it. */
function dropOnPanel(panel, text, point) {
  const placed = controlDroppedOnPanel(text, CAT, "defs/One.octl", point);
  if (!placed) return panel;
  const carried = P.coger(panel, placed.bloque, placed.config, { ...placed.placement, arrastrado: true });
  return P.soltar(carried, CTX, true, point);
}

test("a file of one object dropped on the panel has its box at the drop point minus (32, 10)", () => {
  const dropped = dropOnPanel(P.inicial(), octl("type-def", [numeric()]), { x: 300, y: 200 });
  const node = dropped.g.nodos.at(-1);
  assert.deepEqual([node.panel.x, node.panel.y], [268, 190]);
  assert.deepEqual(node.config.typedef, { path: "defs/One.octl", strict: false }, "a type definition is linked");
  assert.equal(node.label.text, "Numeric");
});

test("a dropped control is copied, and its label is numbered when taken", () => {
  const first = dropOnPanel(P.inicial(), octl("control", [numeric()]), { x: 300, y: 200 });
  assert.equal(first.g.nodos[0].config.typedef, undefined);
  const second = dropOnPanel(first, octl("control", [numeric()]), { x: 500, y: 200 });
  assert.equal(second.g.nodos.at(-1).label.text, "Numeric 2");
});

test("a file of none or of several objects places nothing, silently", () => {
  const empty = P.inicial();
  assert.equal(dropOnPanel(empty, octl("control", []), { x: 300, y: 200 }), empty);
  assert.equal(dropOnPanel(empty, octl("type-def", [numeric(), numeric("Other")]), { x: 300, y: 200 }), empty);
  assert.equal(constantDroppedOnDiagram(octl("type-def", [numeric(), numeric()]), CAT, "T.octl"), null);
});

test("a type definition of one numeric dropped on the diagram places the linked constant at the drop point", () => {
  const placed = constantDroppedOnDiagram(octl("type-def", [numeric()]), CAT, "defs/One.octl");
  const carried = ED.coger(ED.inicial(), placed.bloque, placed.config);
  const dropped = ED.soltar({ ...carried, accion: { ...carried.accion, arrastrado: true } }, CTX, true, { x: 200, y: 150 });
  const node = dropped.g.nodos.at(-1);
  assert.equal(node.tipo, "num-const");
  assert.deepEqual(node.config.typedef, { path: "defs/One.octl", strict: false });
  assert.ok(Math.abs(node.x - 200) < 100 && Math.abs(node.y - 150) < 50, "near the drop point");
  assert.equal(constantDroppedOnDiagram(octl("control", [numeric()]), CAT, "One.octl"), null, "a plain control makes no constant");
});

test("the tree carries an octl's absolute path and nothing else", () => {
  assert.equal(draggableFilePath("defs/One.octl", "/work/p.sdproj"), "/work/defs/One.octl");
  assert.equal(draggableFilePath("/abs/One.OCTL", null), "/abs/One.OCTL", "a project never saved stores absolute paths");
  assert.equal(draggableFilePath("A.ovi", "/work/p.sdproj"), null);
  assert.equal(draggableFilePath(undefined, "/work/p.sdproj"), null, "a virtual folder has no file");
  const project = { items: [{ name: "One.octl", kind: ITEM_KINDS.DOCUMENT, path: "defs/One.octl" }, { name: "V", kind: ITEM_KINDS.FOLDER, items: [] }] };
  const state = fromProject(project, "p");
  assert.equal(draggableFilePath(storedPathOfRow(state, "project/0"), "/work/p.sdproj"), "/work/defs/One.octl");
  assert.equal(draggableFilePath(storedPathOfRow(state, "project/1"), "/work/p.sdproj"), null);
  assert.equal(storedPathOfRow(state, "project/9"), undefined);
});

test("only a drag that carries a file is accepted, and the explorer's own drag stays", () => {
  assert.equal(carriesFile(["text/plain", FILE_DRAG_TYPE]), true);
  assert.equal(carriesFile(["text/plain"]), false);
  assert.equal(carriesFile(undefined), false);
  // The wiring of the two pages, which no test runs in Electron.
  const explorer = source("editor/src/project-explorer/project-explorer.mjs");
  assert.match(explorer, /setData\("text\/plain", draggedKey/);
  assert.match(explorer, /setData\(FILE_DRAG_TYPE, filePath\)/);
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /addEventListener\("dragover"[\s\S]*?dropEffect = "copy"/);
  assert.match(page, /addEventListener\("drop"[\s\S]*?placeDroppedFile\(/);
});
