// The default value of a control and its current value in the editor (DT-053),
// as measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-15-default-values.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

/** A diagram with a numeric control whose default is 5 and whose current value is 9. */
function diagramWithTypedControl() {
  const created = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 100, 100, "n");
  const g = CV.setCurrentValue(Gr.fijarValor(created.g, created.id, 5), created.id, 9);
  return { d: { ...ED.inicial(), g }, id: created.id };
}

const nodeOf = (d, id) => d.g.nodos.find((node) => node.id === id);
const MENU = "context.numeric-control";

test("Data Operations makes the current value the default or puts it back", () => {
  const { d, id } = diagramWithTypedControl();
  const labels = INV.hijos(`${MENU}.data-operations`).map((entry) => entry.etiqueta);
  assert.deepEqual(labels, ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data", "Copy Data", "Paste Data"]);
  for (const row of ["cut-data", "copy-data", "paste-data"]) assert.ok(esHueco(INV.resolver(`${MENU}.data-operations.${row}`)), `${row} is greyed with its reason`);

  const madeDefault = ED.orden(ED.abrirMenu(d, MENU, id, 0, 0), `${MENU}.data-operations.make-current-value-default`, CTX);
  assert.deepEqual([CV.defaultValue(nodeOf(madeDefault, id)), CV.startValue(nodeOf(madeDefault, id))], [9, 9]);

  const reinitialized = ED.orden(ED.abrirMenu(d, MENU, id, 0, 0), `${MENU}.data-operations.reinitialize-to-default-value`, CTX);
  assert.deepEqual([CV.defaultValue(nodeOf(reinitialized, id)), CV.startValue(nodeOf(reinitialized, id))], [5, 5]);
});

test("Data Operations of an indicator makes what it shows its default", () => {
  const created = Gr.crearEnPanel(Gr.nuevo(), CAT, "indicator", 100, 100, "double");
  const d = { ...ED.inicial(), g: CV.setCurrentValue(created.g, created.id, 16) };
  const menu = "context.numeric-indicator";
  assert.deepEqual(INV.hijos(`${menu}.data-operations`).map((entry) => entry.etiqueta), ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data", "Copy Data", "Paste Data"]);
  const madeDefault = ED.orden(ED.abrirMenu(d, menu, created.id, 0, 0), `${menu}.data-operations.make-current-value-default`, CTX);
  assert.equal(CV.defaultValue(nodeOf(madeDefault, created.id)), 16);
});
