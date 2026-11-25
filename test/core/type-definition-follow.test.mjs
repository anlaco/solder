// How an OVI's objects follow their type definitions (DT-104 stage b), the cases measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-23-typedef-instances.md Q2, Q5, Q6; 2026-11-17-typedef-update.md Q3), on PointTD: a
// cluster of a DBL "a" and a Boolean "b", its instance "Pt" holding the default a = 3, b = TRUE.

import assert from "node:assert/strict";
import { test } from "node:test";

import { FOLLOWING, followDefinition, followDefinitions, followsAutomatically, hasChangesToApply, mismatchReason, reviewReason } from "../../core/model/type-definition-follow.mjs";
import { typeDefinitionText } from "../../core/model/type-definition.mjs";
import { withDerivedCluster } from "../../core/model/user-cluster.mjs";
import { CAT } from "../helpers.mjs";

const NON_STRICT = { path: "PointTD.octl", strict: false };
const UNTICKED = { ...NON_STRICT, "auto-update": false };
const STRICT = { path: "StrictTD.octl", strict: true };

const numeric = (label, value) => ({ tipo: "control", label: { text: label }, config: { type: "number", ...(value !== undefined && { value }) }, x: 4, y: 19 });
const boolean = (label, value) => ({ tipo: "bool-control", label: { text: label }, config: { style: "push-button", ...(value !== undefined && { value }) }, x: 25, y: 48 });
const string = (label) => ({ tipo: "str-control", label: { text: label }, x: 3, y: 64 });

const cluster = (elements, link, name = "Pt") => withDerivedCluster(CAT, { id: 1, name, tipo: "cluster-control", label: { text: name }, config: { elements, ...(link && { typedef: link }) }, x: 0, y: 0 });
const instance = (link = NON_STRICT) => cluster([numeric("a", 3), boolean("b", true)], link);
const sameDefinition = () => cluster([numeric("a"), boolean("b")]);
const withString = () => cluster([numeric("a"), boolean("b"), string("s")]);
const withoutA = () => cluster([boolean("b")]);

test("an instance that is what its definition says matches it, whatever its own defaults", () => {
  assert.equal(followDefinition(CAT, instance(), sameDefinition()).state, FOLLOWING.matches);
  assert.equal(followDefinition(CAT, instance(STRICT), sameDefinition()).state, FOLLOWING.matches);
});

test("an element added follows silently; a default that would be lost waits for a review", () => {
  const added = followDefinition(CAT, instance(), withString());
  assert.equal(added.state, FOLLOWING.update);
  assert.deepEqual(added.node.config.value, [3, true, undefined]);
  const removed = followDefinition(CAT, instance(), withoutA());
  assert.equal(removed.state, FOLLOWING.review, "a = 3 would be lost (measured Q5)");
  assert.deepEqual(removed.review.losses.map((loss) => loss.label), ["a"]);
});

test("Auto-Update unticked never follows by itself: any difference does not match; a strict instance has no such row", () => {
  assert.equal(followsAutomatically(NON_STRICT), true, "ticked by default (measured)");
  assert.equal(followsAutomatically(UNTICKED), false);
  assert.equal(followsAutomatically({ ...STRICT, "auto-update": false }), true);
  assert.equal(followDefinition(CAT, instance(UNTICKED), withString()).state, FOLLOWING.mismatch, "measured Q2");
  assert.equal(followDefinition(CAT, instance(UNTICKED), withoutA()).state, FOLLOWING.mismatch);
  assert.equal(followDefinition(CAT, instance(UNTICKED), sameDefinition()).state, FOLLOWING.matches);
});

test("applying updates the instances that can follow and breaks the rest, with LabVIEW's words", () => {
  const g = { nodos: [instance(), cluster([numeric("a", 3), boolean("b", true)], UNTICKED, "PtU"), { id: 9, name: "plain", tipo: "control", config: {} }] };
  const { g: followed, broken } = followDefinitions(CAT, g, () => withString(), { apply: true });
  assert.deepEqual(followed.nodos[0].config.type.cluster.map((element) => element.name), ["a", "b", "s"]);
  assert.equal(followed.nodos[1], g.nodos[1], "the unticked one stays as it was");
  assert.equal(followed.nodos[2], g.nodos[2]);
  assert.deepEqual(broken, [{ node: "PtU", motivo: "Type Definition 'PtU': Control does not match its type definition.", detail: "You must right-click this control and select Update or Disconnect from Type Def." }]);
});

test("a review breaks the OVI with its own words; a definition saved but not applied changes nothing and breaks", () => {
  const g = { nodos: [instance()] };
  const reviewed = followDefinitions(CAT, g, () => withoutA(), { apply: true });
  assert.equal(reviewed.g, g);
  assert.equal(reviewed.broken[0].motivo, reviewReason("Pt"));
  assert.match(reviewed.broken[0].detail, /Review and Update from Type Def\.\.\./);
  const saved = followDefinitions(CAT, g, () => withString(), { apply: false });
  assert.equal(saved.g, g, "Save does not apply (measured Q6)");
  assert.deepEqual(saved.broken.map((entry) => entry.motivo), [mismatchReason("Pt")]);
});

test("a missing definition is left to the hierarchy's own error, and nothing changes when everything matches", () => {
  const g = { nodos: [instance()] };
  assert.deepEqual(followDefinitions(CAT, g, () => null, { apply: true }), { g, broken: [] });
  assert.deepEqual(followDefinitions(CAT, g, () => sameDefinition(), { apply: true }), { g, broken: [] });
});

test("the block an element takes comes from the instance being updated, which toInstanceElement is given", () => {
  const seen = [];
  const toInstanceElement = (element, owner) => (seen.push(owner.name), element);
  followDefinition(CAT, instance(), withString(), toInstanceElement);
  assert.ok(seen.length > 0 && seen.every((name) => name === "Pt"));
});

test("a cluster's elements with no label (a Cluster Constant's) are matched by their place, each keeping its own value", () => {
  const unlabelled = (element) => ({ ...element, label: { text: "" } });
  const owner = withDerivedCluster(CAT, { id: 1, name: "K", tipo: "cluster-control", label: { text: "K" }, config: { elements: [unlabelled(numeric("", 3)), unlabelled(numeric("", 8))], typedef: NON_STRICT }, x: 0, y: 0 });
  const definition = cluster([unlabelled(numeric("")), unlabelled(numeric("")), unlabelled(boolean(""))]);
  const { state, node } = followDefinition(CAT, owner, definition);
  assert.equal(state, FOLLOWING.update);
  assert.deepEqual(node.config.value, [3, 8, undefined], "labels all equal must not give the last element's value to every one");
});

test("Apply Changes has something to apply when the ring or the object changes in more than its default values", () => {
  const text = (elements, kind = "type-def") => typeDefinitionText(kind, [{ tipo: "cluster-control", label: { text: "Pt" }, config: { elements }, x: 31, y: 109 }]);
  const applied = text([numeric("a", 5), boolean("b", true)]);
  assert.equal(hasChangesToApply(CAT, applied, applied), false, "greyed at open (measured)");
  assert.equal(hasChangesToApply(CAT, applied, text([numeric("a", 7), boolean("b", false)])), false, "a default-only change (measured)");
  assert.equal(hasChangesToApply(CAT, applied, text([numeric("a", 5), boolean("b", true), string("s")])), true, "an element added");
  assert.equal(hasChangesToApply(CAT, applied, text([boolean("b", true), numeric("a", 5)])), true, "the elements reordered");
  assert.equal(hasChangesToApply(CAT, applied, text([{ ...numeric("a", 5), label: { text: "z" } }, boolean("b", true)])), true, "an element renamed");
  assert.equal(hasChangesToApply(CAT, applied, text([numeric("a", 5), boolean("b", true)], "strict-type-def")), true, "the ring");
  assert.equal(hasChangesToApply(CAT, applied, typeDefinitionText("type-def", [{ tipo: "cluster-control", label: { text: "Pt" }, config: { elements: [numeric("a", 5), boolean("b", true)] }, x: 99, y: 3 }])), false, "the object's place in the editor is not a change (unmeasured)");
});

// A scalar panel object (a Numeric control "n" of the panel) following a definition whose object is a single control.
const scalarInstance = (tipo, config, link = NON_STRICT) => ({ id: 5, name: "n", tipo, label: { text: "n" }, config: { ...config, typedef: link }, panel: { x: 10, y: 20, w: 90, h: 30 }, x: 0, y: 0 });
const scalarDefinition = (tipo, config) => ({ tipo, label: { text: "n" }, config, x: 0, y: 0 });
/** The editor's counterpart for the tests: the definition's kind in the instance's role, none for a graph. */
const counterpartBlock = (definition, instance) => {
  if (definition.tipo === "waveform-graph") return null;
  const role = instance.tipo.endsWith("indicator") ? "indicator" : "control";
  return { tipo: definition.tipo.replace(/(control|indicator)$/, role), config: definition.config };
};

test("a scalar instance follows a change of its definition's data: the representation, with its default converted and held for review", () => {
  const instance = scalarInstance("control", { type: "dbl", value: 0 });
  const retyped = followDefinition(CAT, instance, scalarDefinition("control", { type: "i32" }), undefined, counterpartBlock);
  assert.equal(retyped.state, FOLLOWING.update, "a zero default is lost silently, as measured");
  assert.equal(retyped.node.config.type, "i32");
  assert.equal(retyped.node.config.value, 0);
  assert.deepEqual(retyped.node.config.typedef, NON_STRICT);
  // The instance's own default 3.7 would change to 4 in an I32: LabVIEW asks (measured on a cluster's element).
  const held = followDefinition(CAT, scalarInstance("control", { type: "dbl", value: 3.7 }), scalarDefinition("control", { type: "i32" }), undefined, counterpartBlock);
  assert.equal(held.state, FOLLOWING.review);
  assert.deepEqual(held.review.losses.map((loss) => [loss.previous, loss.proposed]), [[3.7, 4]]);
  // The definition's own default value does not reach an instance that has its own.
  const sameType = followDefinition(CAT, scalarInstance("control", { type: "dbl", value: 3 }), scalarDefinition("control", { type: "dbl", value: 9 }), undefined, counterpartBlock);
  assert.equal(sameType.state, FOLLOWING.matches);
});

test("a scalar instance takes the block its definition was replaced by, in its own role, keeping the node, its place and its link", () => {
  const roundLed = scalarDefinition("bool-indicator", { style: "round-led" });
  const control = followDefinition(CAT, scalarInstance("control", { type: "dbl", value: 0 }), roundLed, undefined, counterpartBlock);
  assert.equal(control.state, FOLLOWING.update);
  assert.equal(control.node.tipo, "bool-control", "a control stays a control");
  assert.deepEqual([control.node.id, control.node.name, control.node.label.text], [5, "n", "n"], "the node stays, so its wires do");
  assert.deepEqual(control.node.panel, { x: 10, y: 20 }, "the old block's size does not carry over");
  assert.equal(control.node.config.type, undefined, "nothing of the numeric stays");
  assert.deepEqual(control.node.config.typedef, NON_STRICT);
  const indicator = followDefinition(CAT, scalarInstance("indicator", { type: "dbl" }), roundLed, undefined, counterpartBlock);
  assert.equal(indicator.node.tipo, "bool-indicator", "an indicator stays an indicator");
  // A default the instance held is lost with the old block: it waits for a review.
  const held = followDefinition(CAT, scalarInstance("control", { type: "dbl", value: 7 }), roundLed, undefined, counterpartBlock);
  assert.equal(held.state, FOLLOWING.review);
  assert.deepEqual(held.review.losses.map((loss) => [loss.previous, loss.proposed]), [[7, undefined]]);
  // The same through a whole graph, as the OVI opens.
  const g = { nodos: [scalarInstance("control", { type: "dbl", value: 0 })] };
  assert.equal(followDefinitions(CAT, g, () => roundLed, { apply: true, toInstanceBlock: counterpartBlock }).g.nodos[0].tipo, "bool-control");
});

test("a scalar instance whose definition's block has no counterpart does not follow, and does not match", () => {
  const instance = scalarInstance("control", { type: "dbl", value: 0 });
  const graph = scalarDefinition("waveform-graph", {});
  assert.equal(followDefinition(CAT, instance, graph, undefined, counterpartBlock).state, FOLLOWING.mismatch);
  const { g, broken } = followDefinitions(CAT, { nodos: [instance] }, () => graph, { apply: true, toInstanceBlock: counterpartBlock });
  assert.equal(g.nodos[0], instance);
  assert.deepEqual(broken.map((entry) => entry.node), ["n"]);
});
