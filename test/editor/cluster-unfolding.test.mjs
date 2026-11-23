// The Front Panel's unfolded view of a user's clusters (DT-106): while the panel is edited each element is a panel
// object of its own, and folding gives the cluster back with its elements in order. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-23-cluster-elements.md): Delete keeps the others' order, a control put in a cluster
// comes last, one dragged out keeps its label and value.

import assert from "node:assert/strict";
import { test } from "node:test";

import { foldClusters, isUnfoldedElement, unfoldClusters, unfoldedElementId } from "../../editor/src/front-panel/cluster-unfolding.mjs";
import { interiorBox, shellBox } from "../../editor/src/front-panel/cluster-panel.mjs";
import { withDerivedCluster } from "../../core/model/user-cluster.mjs";
import { CAT } from "../helpers.mjs";

const numeric = (label, value, x = 4, y = 19) => ({ tipo: "control", label: { text: label }, config: { type: "number", value }, x, y });
const boolean = (label, value) => ({ tipo: "bool-control", label: { text: label }, config: { style: "push-button", value }, x: 25, y: 48 });
const string = (label) => ({ tipo: "str-control", label: { text: label }, config: { value: "" }, x: 3, y: 64, w: 90 });

const cluster = (id, elements, extra = {}) => withDerivedCluster(CAT, { id, name: `cluster_${id}`, tipo: "cluster-control", label: { text: "Cluster" }, config: { elements }, panel: { x: 100, y: 50, w: 160, h: 140 }, ...extra });

/** A panel with a free numeric and a cluster of a numeric, a Boolean and a string. */
const panel = (extra) => ({ nodos: [{ id: 1, name: "free", tipo: "control", label: { text: "free" }, config: { type: "number" }, panel: { x: 10, y: 10 } }, cluster(2, [numeric("a", 3), boolean("b", true), string("s")], extra)], cables: [] });

test("unfolding gives one object per element, after its cluster, at its place on the panel; folding gives the panel back", () => {
  const g = panel();
  const unfolded = unfoldClusters(g);
  assert.deepEqual(unfolded.nodos.map((node) => node.id), [1, 2, unfoldedElementId(2, 0), unfoldedElementId(2, 1), unfoldedElementId(2, 2)]);
  const interior = interiorBox(shellBox(g.nodos[1]));
  const a = unfolded.nodos[2];
  assert.equal(a.inside, 2);
  assert.deepEqual(a.panel, { x: interior.x + 4, y: interior.y + 19 });
  assert.deepEqual(unfolded.nodos[4].panel.w, 90, "an element's own size goes with it");
  assert.deepEqual(unfolded.nodos[1].config.elements, [], "the shell holds none while unfolded: they are drawn as objects");
  assert.deepEqual(foldClusters(unfolded, CAT), g);
});

test("current values go to the elements and come back to the cluster; none stays none", () => {
  const g = panel({ currentValue: [7, false, "hola"] });
  const unfolded = unfoldClusters(g);
  assert.deepEqual(unfolded.nodos.slice(2).map((node) => node.currentValue), [7, false, "hola"]);
  assert.deepEqual(foldClusters(unfolded, CAT), g);
  const typed = { ...unfolded, nodos: unfolded.nodos.map((node) => (node.id === unfoldedElementId(2, 0) ? { ...node, currentValue: 9 } : node)) };
  const folded = foldClusters(typed, CAT).nodos[1];
  assert.deepEqual(folded.currentValue, [9, false, "hola"]);
  assert.deepEqual(folded.config.value, [3, true, ""], "a typed value is not the default (DT-053)");
});

test("deleting an element keeps the others' order; a new object put inside comes last; one taken out is a free object", () => {
  const unfolded = unfoldClusters(panel());
  const without = { ...unfolded, nodos: unfolded.nodos.filter((node) => node.id !== unfoldedElementId(2, 1)) };
  assert.deepEqual(foldClusters(without, CAT).nodos[1].config.elements.map((element) => element.label.text), ["a", "s"]);
  const interior = interiorBox(shellBox(panel().nodos[1]));
  const pasted = { id: 9, tipo: "control", label: { text: "a 2" }, config: { type: "number" }, inside: 2, panel: { x: interior.x + 30, y: interior.y + 5 } };
  const withPasted = foldClusters({ ...unfolded, nodos: [...unfolded.nodos, pasted] }, CAT).nodos[1];
  assert.deepEqual(withPasted.config.elements.map((element) => element.label.text), ["a", "b", "s", "a 2"]);
  assert.deepEqual({ x: withPasted.config.elements[3].x, y: withPasted.config.elements[3].y }, { x: 30, y: 5 });
  assert.deepEqual(withPasted.config.type.cluster.map((element) => element.name), ["a", "b", "s", "a 2"], "the type is derived again");
  const takenOut = { ...unfolded, nodos: unfolded.nodos.map((node) => (node.id === unfoldedElementId(2, 0) ? (({ inside: _inside, ...free }) => ({ ...free, panel: { x: 400, y: 300 } }))(node) : node)) };
  const folded = foldClusters(takenOut, CAT);
  assert.deepEqual(folded.nodos[1].config.elements.map((element) => element.label.text), ["b", "s"]);
  const free = folded.nodos.find((node) => node.id === unfoldedElementId(2, 0));
  assert.equal(isUnfoldedElement(free), false);
  assert.deepEqual({ label: free.label.text, value: free.config.value, panel: free.panel }, { label: "a", value: 3, panel: { x: 400, y: 300 } });
});

test("a cluster inside a cluster unfolds into its own elements and folds back whole, its values nested", () => {
  const inner = { ...cluster(0, [numeric("x", 1), numeric("y", 2, 40)]), id: undefined, name: undefined, panel: undefined, x: 10, y: 30 };
  const { id: _id, name: _name, panel: _panel, ...innerElement } = inner;
  const g = { nodos: [cluster(5, [numeric("a", 3), innerElement], { currentValue: [4, [8, 9]] })], cables: [] };
  const unfolded = unfoldClusters(g);
  const innerId = unfoldedElementId(5, 1);
  assert.deepEqual(unfolded.nodos.map((node) => [node.id, node.inside]), [[5, undefined], [unfoldedElementId(5, 0), 5], [innerId, 5], [unfoldedElementId(innerId, 0), innerId], [unfoldedElementId(innerId, 1), innerId]]);
  assert.deepEqual(unfolded.nodos.slice(3).map((node) => node.currentValue), [8, 9]);
  assert.deepEqual(foldClusters(unfolded, CAT), g);
});

test("a panel with no user's cluster is the same unfolded and folded", () => {
  const g = { nodos: [{ id: 1, tipo: "control", config: { type: "number" }, panel: { x: 1, y: 2 } }, { id: 2, tipo: "add" }], cables: [] };
  assert.deepEqual(unfoldClusters(g), g);
  assert.deepEqual(foldClusters(g, CAT), g);
});

test("folding a graph that is folded already changes nothing", () => {
  const g = panel({ currentValue: [7, false, "hola"] });
  assert.deepEqual(foldClusters(g, CAT), g);
  assert.deepEqual(foldClusters(foldClusters(unfoldClusters(g), CAT), CAT), g);
});

test("a folded graph is folded to the very same graph, an empty cluster too; one whose last element was taken out is folded to an empty type", () => {
  const empty = { nodos: [cluster(2, [])], cables: [] };
  assert.equal(foldClusters(empty, CAT), empty);
  const g = panel();
  assert.equal(foldClusters(g, CAT), g);
  const unfolded = unfoldClusters({ nodos: [cluster(2, [numeric("a", 3)])], cables: [] });
  const none = foldClusters({ ...unfolded, nodos: unfolded.nodos.filter((node) => node.inside === undefined) }, CAT);
  assert.deepEqual(none.nodos[0].config.type, { cluster: [] }, "the stale type of the unfolded shell is derived again");
  assert.deepEqual(none.nodos[0].config.value, []);
});
