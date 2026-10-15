// The routing of the window's modal dialogs (`editor/src/window/modal-dialog.mjs`): which dialog
// is open and what a key or a click does to it. This is the seam that `editor-window.mjs` used to
// hold, where nothing could be tested without a browser; the two defects it let through with every
// test green (the review of #32, 2026-10-14) are the first two tests here.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CH from "../../editor/src/front-panel/chart-history-dialog.mjs";
import * as EI from "../../editor/src/block-diagram/edit-items-dialog.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import { INV } from "../helpers.mjs";

const ENUM_NODE = { id: "n1", tipo: "enum-const", config: { type: { enum: ["Init", "Heat"] }, value: 0 } };
const vi = (node) => ({ nodos: [node], cables: [] });
/** The items dialog open on the diagram, with the name of row 0 being written. */
const escribiendo = (texto) => {
  let dialog = EI.act(EI.open(ENUM_NODE), `${EI.DIALOG_ID}.row-0`, 2);
  for (const character of texto) dialog = EI.type(dialog, character);
  return dialog;
};

test("the chart dialog is never handed to the items dialog's module", () => {
  // Both used to live in `pan.dialogo`: a digit typed into Chart History Length reached
  // `EI.view` and threw, which broke the whole window.
  const graphDialog = CH.open({ id: "g1", config: {} }, 1024);
  const abierto = MD.openDialog(null, { g: vi(ENUM_NODE), graphDialog });
  assert.equal(abierto.mod, CH, "the chart dialog is driven by its own module");
  assert.equal(abierto.field, "graphDialog");
  assert.notEqual(abierto.field, "itemsDialog", "the two dialogs do not share a field");
  // And the field it does not use stays free for the items dialog of the same panel.
  const conLosDos = MD.openDialog(null, { g: vi(ENUM_NODE), itemsDialog: EI.open(ENUM_NODE), graphDialog });
  assert.equal(conLosDos.mod, EI);
  assert.equal(conLosDos.field, "itemsDialog");
});

test("Enter while a row is being written commits it and opens another: it is not OK", () => {
  // The window used to take Enter for OK before the dialog saw it, so the measured Enter —
  // commit the name and insert an empty row below — could not be reached in the editor at all.
  const abierto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: escribiendo("Start") }, null);
  const intent = MD.keyIntent(abierto, { key: "Enter" });
  assert.ok(intent.dialog, "it edits the dialog");
  assert.ok(!intent.accept, "it does not accept it");
  assert.deepEqual(intent.dialog.filas.map((f) => f.texto), ["Start", "", "Heat"], "the name is kept and a row comes after it");
  assert.equal(intent.dialog.edicion.fila, 1, "the editor moves to the new row");
  // With no row being written, Enter is the default button: OK.
  const quieto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: EI.open(ENUM_NODE) }, null);
  assert.deepEqual(MD.keyIntent(quieto, { key: "Enter" }), { accept: true });
});

test("Escape drops the row being written and keeps the dialog; with none, it cancels", () => {
  const abierto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: escribiendo("Start") }, null);
  const intent = MD.keyIntent(abierto, { key: "Escape" });
  assert.equal(intent.dialog.edicion, null, "the row stops being written");
  assert.deepEqual(intent.dialog.filas.map((f) => f.texto), ["Init", "Heat"], "and keeps the name it had");
  const quieto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: EI.open(ENUM_NODE) }, null);
  assert.deepEqual(MD.keyIntent(quieto, { key: "Escape" }), { cancel: true });
});

test("a key with Ctrl, Meta or Alt is not for the dialog, and a digit is for the chart's field", () => {
  const abierto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: escribiendo("Sta") }, null);
  assert.equal(MD.keyIntent(abierto, { key: "s", ctrlKey: true }), null);
  const conGrafica = MD.openDialog(null, { g: vi(ENUM_NODE), graphDialog: CH.open({ id: "g1", config: {} }, 1024) });
  assert.equal(MD.keyIntent(conGrafica, { key: "5" }).dialog.texto, "5", "the digit reaches its field");
});

test("OK writes the items into the VI, Cancel leaves it as it was", () => {
  const abierto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: escribiendo("Start") }, null);
  assert.deepEqual(MD.clickIntent(abierto, `${EI.DIALOG_ID}.ok`), { accept: true });
  const g = MD.accepted(abierto, vi(ENUM_NODE));
  assert.deepEqual(g.nodos[0].config.type.enum, ["Start", "Heat"], "what was being written is written too");
  assert.deepEqual(MD.clickIntent(abierto, `${EI.DIALOG_ID}.cancel`), { cancel: true });
});

test("a click on a greyed tab asks for its explanation; the enum's greyed checkbox does nothing", () => {
  const abierto = MD.openDialog({ g: vi(ENUM_NODE), itemsDialog: EI.open(ENUM_NODE) }, null);
  // The four tabs that are not Edit Items are holes with their reason (DT-035).
  assert.deepEqual(MD.clickIntent(abierto, `${EI.DIALOG_ID}.tab-appearance`), { explain: true });
  assert.ok(INV.resolver(`${EI.DIALOG_ID}.tab-appearance`).labview, "and the inventory has the reason to show");
  assert.deepEqual(MD.clickIntent(abierto, `${EI.DIALOG_ID}.help`), { explain: true });
  // «Allow undefined values at run time» is greyed by LabVIEW itself on an enum, not by us.
  assert.equal(MD.clickIntent(abierto, `${EI.DIALOG_ID}.allow-undefined`), null);
  // A row edits the list; the veil and the parts with no id are not a click on anything.
  assert.ok(MD.clickIntent(abierto, `${EI.DIALOG_ID}.row-1`).dialog);
  assert.equal(MD.clickIntent(abierto, undefined), null);
  assert.equal(MD.keyIntent(null, { key: "Enter" }), null, "with no dialog open there is no intent");
});
