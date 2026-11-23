// The Front Panel's window edits the unfolded graph and shows everyone else the folded one (DT-106 §3).

import assert from "node:assert/strict";
import { test } from "node:test";

import { createPanelGraphs } from "../../editor/src/window/panel-graphs.mjs";
import { unfoldedElementId } from "../../editor/src/front-panel/cluster-unfolding.mjs";
import { withDerivedCluster } from "../../core/model/user-cluster.mjs";
import { CAT } from "../helpers.mjs";

const numeric = (label, value) => ({ tipo: "control", label: { text: label }, config: { type: "number", value }, x: 4, y: 19 });
const folded = () => ({ nodos: [withDerivedCluster(CAT, { id: "n1", name: "cluster_1", tipo: "cluster-control", label: { text: "Cluster" }, config: { elements: [numeric("a", 1), numeric("b", 2)] }, panel: { x: 10, y: 10 } })], cables: [] });

test("what the window receives is unfolded, and what it holds gives back, folded, the graph it came from", () => {
  const graphs = createPanelGraphs(() => CAT);
  const received = folded();
  const unfolded = graphs.unfold(received);
  assert.deepEqual(unfolded.nodos.map((node) => node.id), ["n1", unfoldedElementId("n1", 0), unfoldedElementId("n1", 1)]);
  assert.equal(graphs.fold(unfolded), received, "the same graph, so that nothing is taken for a change");
  assert.equal(graphs.unfold(received), unfolded, "and the unfolded one is not made twice");
  assert.equal(graphs.fold(received), received);
});

test("an edit of the unfolded graph is folded into its cluster, once", () => {
  const graphs = createPanelGraphs(() => CAT);
  const unfolded = graphs.unfold(folded());
  const edited = { ...unfolded, nodos: unfolded.nodos.filter((node) => node.id !== unfoldedElementId("n1", 0)) };
  const result = graphs.fold(edited);
  assert.deepEqual(result.nodos[0].config.elements.map((element) => element.label.text), ["b"]);
  assert.equal(graphs.fold(edited), result);
  assert.equal(graphs.fold(result), result);
  assert.equal(graphs.unfold(result), edited, "an undo to it gives the unfolded graph it was edited as");
});
