// Updating an object from its type definition, and what a wire carries of one (DT-096 §1, §4, §5). The cases are the
// ones measured in LabVIEW 2026 Q3 (reports/2026-11-17-typedef-update.md Q3, -typedef-wiring.md Q4 and Q6), on PointTD:
// a cluster of a DBL "a" and a Boolean "b", its control holding the default a = 3, b = TRUE.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { updateFromDefinition } from "../../core/model/type-definition-update.mjs";
import { hasTypeDefinitionDot, typeDefinitionHelpLine, typeDefinitionOfSource } from "../../core/model/type-definition-wires.mjs";
import { followWiredClusters } from "../../core/model/wired-clusters.mjs";
import { setClusterElements, withDerivedCluster } from "../../core/model/user-cluster.mjs";
import { CAT } from "../helpers.mjs";

const NON_STRICT = { path: "PointTD.octl", strict: false };
const STRICT = { path: "StrictTD.octl", strict: true };

const numeric = (label, value, type = "number", x = 4) => ({ tipo: "control", label: { text: label }, config: { type, ...(value !== undefined && { value }) }, x, y: 19 });
const boolean = (label, value) => ({ tipo: "bool-control", label: { text: label }, config: { style: "push-button", ...(value !== undefined && { value }) }, x: 25, y: 48 });
const string = (label) => ({ tipo: "str-control", label: { text: label }, x: 3, y: 64 });

/** A cluster object of `block` with `elements`, following `link`. */
const clusterObject = (block, elements, link) => withDerivedCluster(CAT, { id: 1, tipo: block, label: { text: "Pt" }, config: { elements, ...(link && { typedef: link }) }, x: 0, y: 0 });
/** The definition as its `.octl` holds it: PointTD's elements with their defaults at zero. */
const definitionOf = (elements) => clusterObject("cluster-control", elements);
/** The instance "Pt" with the measured default a = 3, b = TRUE. */
const pointInstance = (link = NON_STRICT) => clusterObject("cluster-control", [numeric("a", 3), boolean("b", true)], link);

test("an element added to the definition reaches the instance at once, which keeps its label, place and values", () => {
  const { node, review } = updateFromDefinition(CAT, pointInstance(), definitionOf([numeric("a"), boolean("b"), string("s")]));
  assert.equal(review, null, "adding is silent (measured)");
  assert.deepEqual(node.config.value, [3, true, undefined], "a and b keep their defaults; s has the definition's");
  assert.equal(node.label.text, "Pt");
  assert.deepEqual(node.config.typedef, NON_STRICT, "the link stays");
  assert.deepEqual(node.config.type.cluster.map((element) => element.name), ["a", "b", "s"]);
});

test("reordering the definition moves the values with their elements, not with their places", () => {
  const { node, review } = updateFromDefinition(CAT, pointInstance(), definitionOf([string("s"), numeric("a"), boolean("b")]));
  assert.equal(review, null);
  assert.deepEqual(node.config.value, [undefined, 3, true], "7 did not land in the string's place (measured)");
});

test("removing an element that holds a default waits for Review; an object with zero defaults updates at once", () => {
  const instance = pointInstance();
  const { node, review } = updateFromDefinition(CAT, instance, definitionOf([boolean("b")]));
  assert.equal(node, instance, "not applied until approved (measured: the VI breaks)");
  assert.deepEqual(review.losses, [{ label: "a", previous: 3, proposed: undefined }]);
  assert.deepEqual(review.previous, [3, true]);
  assert.deepEqual(review.proposed, [true], "b keeps its value once approved (measured)");
  const indicator = clusterObject("cluster-indicator", [numeric("a"), boolean("b")], NON_STRICT);
  assert.equal(updateFromDefinition(CAT, indicator, definitionOf([boolean("b")])).review, null, "the indicator at 0 updated silently (measured)");
});

test("a representation changed under a held value is converted and waits for Review: 3.7 becomes 4 in an I32", () => {
  const instance = clusterObject("cluster-control", [numeric("a", 3.7), boolean("b", true)], NON_STRICT);
  const { review } = updateFromDefinition(CAT, instance, definitionOf([numeric("a", undefined, "i32"), boolean("b")]));
  assert.deepEqual(review.losses, [{ label: "a", previous: 3.7, proposed: 4 }]);
  assert.equal(review.updated.config.type.cluster[0].type, "i32");
});

test("an enum follows its item when the items move, and asks when the held item is renamed or removed", () => {
  const enumObject = (items, value) => ({ id: 2, tipo: "enum-control", label: { text: "E" }, config: { type: { enum: items }, value, typedef: NON_STRICT }, x: 0, y: 0 });
  const enumDefinition = (items) => ({ tipo: "enum-control", label: { text: "EnumTD" }, config: { type: { enum: items } }, x: 0, y: 0 });
  const added = updateFromDefinition(CAT, enumObject(["x", "y", "z"], 1), enumDefinition(["x", "y", "w", "z"]));
  assert.equal(added.review, null);
  assert.equal(added.node.config.value, 1, "an item added after the held one changes nothing (measured)");
  const moved = updateFromDefinition(CAT, enumObject(["x", "y", "w", "z"], 3), enumDefinition(["x", "y", "z"]));
  assert.equal(moved.review, null);
  assert.equal(moved.node.config.value, 2, "z is followed from 3 to 2 (measured)");
  const renamed = updateFromDefinition(CAT, enumObject(["x", "y", "z"], 1), enumDefinition(["x", "yy", "z"]));
  assert.deepEqual(renamed.review.losses, [{ label: "E", previous: 1, proposed: 1 }], "renaming the held item asks, and keeps the number (measured)");
  const removed = updateFromDefinition(CAT, enumObject(["x", "y", "z"], 1), enumDefinition(["x", "z"]));
  assert.equal(removed.review.proposed, 1, "the number stays: the item now at 1 is z (measured)");
});

test("a change of look reaches a strict instance and not a non-strict one", () => {
  const moved = definitionOf([numeric("a", undefined, "number", 40), boolean("b")]);
  const nonStrict = updateFromDefinition(CAT, pointInstance(NON_STRICT), moved).node;
  const strict = updateFromDefinition(CAT, pointInstance(STRICT), moved).node;
  assert.equal(nonStrict.config.elements[0].x, 4, "the non-strict instance keeps its own place (measured: its size stayed)");
  assert.equal(strict.config.elements[0].x, 40, "the strict one takes the definition's (measured: its size followed)");
});

test("a new element takes the block of the instance's kind, which the editor gives", () => {
  const toIndicator = (element) => ({ ...element, tipo: { control: "indicator", "bool-control": "bool-indicator", "str-control": "str-indicator" }[element.tipo] });
  const indicator = clusterObject("cluster-indicator", [{ ...numeric("a"), tipo: "indicator" }], NON_STRICT);
  const { node } = updateFromDefinition(CAT, indicator, definitionOf([numeric("a"), string("s")]), toIndicator);
  assert.deepEqual(node.config.elements.map((element) => element.tipo), ["indicator", "str-indicator"]);
});

/** "Pt" following `controlLink` wired to a cluster indicator following `indicatorLink`, straight or through a Bundle at the top. */
function wiredPair(controlLink, indicatorLink, throughBundle = false) {
  const placed = (g, block, label, link) => {
    const created = Gr.crearEnPanel(g, CAT, block, 0, 0, label);
    const withElements = setClusterElements(created.g, CAT, created.id, [numeric("a"), boolean("b")]);
    return { g: link ? Gr.fijarConfig(withElements, created.id, { typedef: link }) : withElements, id: created.id };
  };
  const control = placed(Gr.nuevo(), "cluster-control", "Pt", controlLink);
  const indicator = placed(control.g, "cluster-indicator", "out", indicatorLink);
  let g = indicator.g;
  const wire = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    g = followWiredClusters(result.g, CAT);
  };
  if (!throughBundle) wire(control.id, "result", indicator.id, "value");
  else {
    const bundle = Gr.crearNodo(g, CAT, "bundle", 100, 0);
    g = bundle.g;
    wire(control.id, "result", bundle.id, "cluster");
    wire(bundle.id, "result", indicator.id, "value");
  }
  return { g, wire: g.cables.find((candidate) => candidate.a.nodo === indicator.id) };
}

test("a coercion dot shows where the ends do not follow the same file in the same kind", () => {
  const dot = (controlLink, indicatorLink) => {
    const { g, wire } = wiredPair(controlLink, indicatorLink);
    return hasTypeDefinitionDot(g, CAT, wire);
  };
  assert.equal(dot(NON_STRICT, null), true, "definition to plain (measured)");
  assert.equal(dot(null, NON_STRICT), true, "plain to definition (measured)");
  assert.equal(dot(NON_STRICT, { path: "OtherTD.octl", strict: false }), true, "one file to another (measured)");
  assert.equal(dot(STRICT, { ...STRICT, strict: false }), true, "strict to non-strict (measured)");
  assert.equal(dot(STRICT, STRICT), false, "the same file in the same kind (measured)");
  assert.equal(dot(null, null), false, "two plain clusters (measured)");
});

test("the type definition a wire carries passes a Bundle wired at the top, and Context Help names it", () => {
  const { g, wire } = wiredPair(NON_STRICT, NON_STRICT, true);
  assert.deepEqual(typeDefinitionOfSource(g, wire.de.nodo), NON_STRICT, "kept after Bundle with the cluster at the top (measured)");
  assert.equal(hasTypeDefinitionDot(g, CAT, wire), false, "no dot into the same definition (measured)");
  assert.equal(typeDefinitionHelpLine(NON_STRICT), "(typedef 'PointTD.octl'[non-strict])");
  assert.equal(typeDefinitionHelpLine(STRICT), "(typedef 'StrictTD.octl'[strict])");
  assert.equal(typeDefinitionHelpLine(null), null);
});
