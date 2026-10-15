// Select Item… of an enum (finding C5), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-10-15-select-item.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SI from "../../editor/src/block-diagram/select-item-dialog.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const ITEMS = ["Init", "Heat", "Hold", "Cool", "Done"];

/** An enum constant at Heat, and an enum control, both with ITEMS. */
function diagramWithEnums() {
  const constant = Gr.crearNodo(Gr.nuevo(), CAT, "enum-const", 100, 100);
  let g = Gr.fijarValor(Gr.editarItemsEnum(constant.g, constant.id, ITEMS), constant.id, 1);
  const control = Gr.crearEnPanel(g, CAT, "control", 300, 100, "state", { type: { enum: ITEMS } });
  return { g: control.g, constantId: constant.id, controlId: control.id };
}

const key = (dialog, name) => SI.key(dialog, { key: name });
const typed = (dialog, text) => [...text].reduce((current, character) => key(current, character).dialog, dialog);
const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

test("Select Item opens with an empty filter and no row highlighted, from the constant, the control and the indicator", () => {
  const { g, constantId } = diagramWithEnums();
  const opened = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, "context.enum-constant", constantId, 0, 0), "context.enum-constant.select-item", CTX);
  assert.equal(opened.menu, null);
  assert.deepEqual([opened.selectItemDialog.filtro, opened.selectItemDialog.resaltado], ["", null], "the current item, Heat, is not preselected");
  assert.deepEqual(SI.shownItems(opened.selectItemDialog), [0, 1, 2, 3, 4]);
  for (const row of ["context.enum-constant.select-item", "context.enum-control.select-item", "context.enum-indicator.select-item"]) assert.equal(INV.resolver(row).estado, "built", row);
  assert.equal(MD.openDialog(opened, null).field, "selectItemDialog");
  const menu = D.menuContextual(INV, { raiz: "context.enum-constant", x: 0, y: 0 }, new Set());
  assert.doesNotMatch(menu, /data-id="context\.enum-constant\.select-item"[^>]*>(?:(?!<\/div>).)*flecha-menu/, "it opens a window, so it has no submenu arrow");
});

test("the filter keeps the items that contain it, ignoring case, and highlights the first", () => {
  const dialog = SI.open({ id: "e", config: { type: { enum: ITEMS } } });
  assert.deepEqual(SI.shownItems(typed(dialog, "o")).map((index) => ITEMS[index]), ["Hold", "Cool", "Done"]);
  assert.deepEqual(SI.shownItems(typed(dialog, "O")), SI.shownItems(typed(dialog, "o")));
  assert.equal(typed(dialog, "h").resaltado, 1, "Heat, the first of Heat and Hold");
  assert.equal(key(typed(dialog, "ox"), "Backspace").dialog.filtro, "o");
});

test("with no match one greyed row is left, the last highlighted item, and Enter picks it", () => {
  const dialog = SI.open({ id: "e", config: { type: { enum: ITEMS } } });
  assert.equal(SI.greyedItem(typed(dialog, "x")), 0, "the first item when nothing was highlighted");
  const down = (current) => key(current, "ArrowDown").dialog;
  const afterDone = typed(down(down(typed(dialog, "o"))), "x");
  assert.equal(SI.greyedItem(afterDone), 4, "Done, highlighted last");
  assert.deepEqual(key(afterDone, "Enter"), { accept: true });
  assert.equal(SI.pickedItem(afterDone), 4);
});

test("Up and Down move the highlight within the shown rows and wrap around", () => {
  const filtered = typed(SI.open({ id: "e", config: { type: { enum: ITEMS } } }), "o");
  const down = (dialog) => key(dialog, "ArrowDown").dialog;
  assert.deepEqual([down(filtered).resaltado, down(down(filtered)).resaltado, down(down(down(filtered))).resaltado], [3, 4, 2]);
  assert.equal(key(filtered, "ArrowUp").dialog.resaltado, 4, "up from the first goes to the last");
});

test("a click highlights a row, a double click picks it, and Escape and the X close with no change", () => {
  const dialog = SI.open({ id: "e", config: { type: { enum: ITEMS } } });
  assert.deepEqual(SI.click(dialog, `${SI.DIALOG_ID}.item-3`), { dialog: { ...dialog, resaltado: 3, ultimoResaltado: 3 } });
  assert.equal(SI.click(dialog, `${SI.DIALOG_ID}.item-3`, 2).accept, true);
  assert.deepEqual(SI.click(dialog, `${SI.DIALOG_ID}.close`), { cancel: true });
  assert.deepEqual(key(dialog, "Escape"), { cancel: true });
});

test("picking sets the constant's value, which the file saves, and only the control's current value", () => {
  const { g, constantId, controlId } = diagramWithEnums();
  const onConstant = SI.apply(g, { ...SI.open(nodeOf(g, constantId)), resaltado: 3 });
  assert.equal(nodeOf(onConstant, constantId).config.value, 3);
  assert.notEqual(Q.aTexto(onConstant, CAT), Q.aTexto(g, CAT), "the constant marks the VI modified");
  const onControl = SI.apply(g, { ...SI.open(nodeOf(g, controlId)), resaltado: 2 });
  assert.equal(CV.currentValue(nodeOf(onControl, controlId)), 2);
  assert.equal(Q.aTexto(onControl, CAT), Q.aTexto(g, CAT), "the control does not (DT-053)");
});

test("the window is drawn with the measured layout, the highlight on the text only", () => {
  const html = SI.view(INV, key(SI.open({ id: "e", config: { type: { enum: ITEMS } } }), "h").dialog);
  assert.match(html, /width:304px;height:215px/);
  assert.match(html, /seleccion-item-fila resaltada" data-id="dialog\.select-item\.item-1"/);
  assert.doesNotMatch(html, /item-0"/, "Init does not contain h");
});
