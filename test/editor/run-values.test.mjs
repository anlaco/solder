// A Run does not change the VI: a control operated while it runs (or a Latch that is
// reset after being read) is not what the file saves. run-values.mjs holds the
// default of each control apart so the window can save it and put it back when
// the Run ends (labview-captures/windows-install-0.2.1/, flow2).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as RV from "../../editor/src/window/run-values.mjs";
import { CAT } from "../helpers.mjs";

/** A graph with a Stop button (Latch When Released, FALSE) and a numeric control (5). */
function panelWithStopAndNumber() {
  let { g } = Gr.crearEnPanel(Gr.nuevo(), CAT, "bool-control", 100, 100, "stop", { style: "stop-button", mechanical: "latch-when-released" });
  const stopId = g.nodos[0].id;
  const created = Gr.crearEnPanel(g, CAT, "control", 300, 100, "n");
  g = Gr.fijarValor(created.g, created.id, 5);
  return { g, stopId, numberId: created.id };
}

const valueOf = (g, id) => g.nodos.find((n) => n.id === id).config?.value;

test("the defaults are restored after the controls were operated, and only the controls that changed", () => {
  const { g, stopId, numberId } = panelWithStopAndNumber();
  const defaults = RV.controlValues(g);
  const operated = Gr.fijarValor(Gr.fijarValor(g, stopId, true), numberId, 9);
  const restored = RV.withControlValues(operated, defaults);
  assert.equal(valueOf(restored, stopId) ?? false, false);
  assert.equal(valueOf(restored, numberId), 5);
  assert.equal(RV.withControlValues(g, defaults), g, "a graph already at its defaults is returned as it is");
});

test("the file saved in the middle of a Run has the defaults, not the Stop button that was pressed", () => {
  const { g, stopId } = panelWithStopAndNumber();
  const defaults = RV.controlValues(g);
  const pressed = Gr.fijarValor(g, stopId, true);
  const text = (graph) => Q.aTexto(graph, CAT);
  assert.notEqual(text(pressed), text(g), "the pressed button is a different VI");
  assert.equal(text(RV.withControlValues(pressed, defaults)), text(g), "saved as defaults, so it is not modified and the next Run does not end at once");
});

test("a latch read as TRUE and reset leaves the graph as it was before the Run", () => {
  const { g, stopId } = panelWithStopAndNumber();
  const defaults = RV.controlValues(g);
  const latchedThenReset = Gr.fijarValor(Gr.fijarValor(g, stopId, true), stopId, false);
  assert.equal(Q.aTexto(RV.withControlValues(latchedThenReset, defaults), CAT), Q.aTexto(g, CAT));
});
