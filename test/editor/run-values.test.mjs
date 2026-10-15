// A Run does not change the VI: a control operated while it runs changes its current
// value, not the default the file saves. When the Run ends the controls keep what was
// operated and the indicators keep what they show, as their current value (DT-053;
// labview-captures/reports/2026-10-15-default-values.md, stage 2).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as RV from "../../editor/src/window/run-values.mjs";
import { CAT } from "../helpers.mjs";

/** A graph with a Stop button (Latch When Released, FALSE), a numeric control (5) and a numeric indicator. */
function panelWithStopNumberAndIndicator() {
  let { g } = Gr.crearEnPanel(Gr.nuevo(), CAT, "bool-control", 100, 100, "stop", { style: "stop-button", mechanical: "latch-when-released" });
  const stopId = g.nodos[0].id;
  const number = Gr.crearEnPanel(g, CAT, "control", 300, 100, "n");
  const indicator = Gr.crearEnPanel(Gr.fijarValor(number.g, number.id, 5), CAT, "indicator", 500, 100, "double");
  return { g: indicator.g, stopId, numberId: number.id, indicatorId: indicator.id };
}

const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

test("the controls keep what was operated during the Run, and the file keeps their defaults", () => {
  const { g, numberId } = panelWithStopNumberAndIndicator();
  const operated = CV.setCurrentValue(g, numberId, 8);
  const { graph } = RV.afterRun(operated, {});
  assert.equal(CV.startValue(nodeOf(graph, numberId)), 8);
  assert.equal(Q.aTexto(graph, CAT), Q.aTexto(g, CAT), "a Run does not mark the VI modified");
});

test("what an indicator shows when the Run ends becomes its current value, and Make Current Values Default saves it", () => {
  const { g, indicatorId } = panelWithStopNumberAndIndicator();
  const { graph, shownValues } = RV.afterRun(g, { [indicatorId]: 16, chart: [1, 2] });
  assert.equal(CV.currentValue(nodeOf(graph, indicatorId)), 16);
  assert.deepEqual(shownValues, { chart: [1, 2] }, "only the indicators that hold a value leave the shown values");
  const reopened = Q.leer(Q.aTexto(CV.makeCurrentValuesDefault(graph), CAT), CAT);
  assert.equal(CV.currentValue(nodeOf(reopened, indicatorId)), 16);
});

test("a Latch still TRUE when the Run ends is FALSE again", () => {
  const { g, stopId } = panelWithStopNumberAndIndicator();
  const { graph } = RV.afterRun(CV.setCurrentValue(g, stopId, true), {});
  assert.equal(CV.currentValue(nodeOf(graph, stopId)), false);
});

test("a Run that changed nothing leaves the graph as it was", () => {
  const { g } = panelWithStopNumberAndIndicator();
  assert.equal(RV.afterRun(g, {}).graph, g);
});
