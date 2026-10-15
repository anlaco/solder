// A control has a default value, which the file saves, and a current value,
// which typing into it changes (DT-053; measured in LabVIEW 2026 Q3,
// labview-captures/reports/2026-10-15-editor-gestures.md §5).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import { CAT } from "../helpers.mjs";

/** A panel with a numeric control whose default is 5 and an empty string control. */
function panelWithTwoControls() {
  const number = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 100, 100, "n");
  const text = Gr.crearEnPanel(Gr.fijarValor(number.g, number.id, 5), CAT, "str-control", 300, 100, "s");
  return { g: text.g, numberId: number.id, textId: text.id };
}

const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

test("a typed value is the current value: the Run starts with it and the file keeps the default", () => {
  const { g, numberId } = panelWithTwoControls();
  const typed = CV.setCurrentValue(g, numberId, 9);
  assert.equal(CV.startValue(nodeOf(typed, numberId)), 9);
  assert.equal(CV.defaultValue(nodeOf(typed, numberId)), 5);
  assert.equal(Q.aTexto(typed, CAT), Q.aTexto(g, CAT));
});

test("a control with no current value starts with its default, or the empty value of its type", () => {
  const { g, numberId, textId } = panelWithTwoControls();
  assert.equal(CV.startValue(nodeOf(g, numberId)), 5);
  assert.equal(CV.startValue(nodeOf(g, textId)), "");
});

test("Make Current Values Default makes every current value the default the file saves", () => {
  const { g, numberId, textId } = panelWithTwoControls();
  const typed = CV.setCurrentValue(CV.setCurrentValue(g, numberId, 9), textId, "hi");
  const madeDefault = CV.makeCurrentValuesDefault(typed);
  assert.equal(CV.hasCurrentValue(nodeOf(madeDefault, numberId)), false);
  assert.equal(CV.defaultValue(nodeOf(madeDefault, numberId)), 9);
  assert.equal(CV.defaultValue(nodeOf(madeDefault, textId)), "hi");
  const reopened = Q.leer(Q.aTexto(madeDefault, CAT), CAT);
  assert.equal(CV.startValue(nodeOf(reopened, numberId)), 9);
});

test("Make Current Value Default and Reinitialize to Default of one control leave the others alone", () => {
  const { g, numberId, textId } = panelWithTwoControls();
  const typed = CV.setCurrentValue(CV.setCurrentValue(g, numberId, 9), textId, "hi");
  const oneDefault = CV.makeCurrentValuesDefault(typed, [numberId]);
  assert.equal(CV.defaultValue(nodeOf(oneDefault, numberId)), 9);
  assert.equal(CV.startValue(nodeOf(oneDefault, textId)), "hi");
  const oneReset = CV.reinitializeToDefault(typed, [textId]);
  assert.equal(CV.startValue(nodeOf(oneReset, textId)), "");
  assert.equal(CV.startValue(nodeOf(oneReset, numberId)), 9);
});

test("Reinitialize Values to Default puts every control back to its default", () => {
  const { g, numberId } = panelWithTwoControls();
  const reset = CV.reinitializeToDefault(CV.setCurrentValue(g, numberId, 9));
  assert.equal(CV.startValue(nodeOf(reset, numberId)), 5);
});

test("with every value at its default, the two commands return the same graph", () => {
  const { g } = panelWithTwoControls();
  assert.equal(CV.makeCurrentValuesDefault(g), g);
  assert.equal(CV.reinitializeToDefault(g), g);
});

test("Representation converts the current value with the default", () => {
  const { g, numberId } = panelWithTwoControls();
  const converted = Gr.fijarRepresentacion(CV.setCurrentValue(g, numberId, 9.7), numberId, "i32");
  assert.equal(CV.startValue(nodeOf(converted, numberId)), 10);
});
