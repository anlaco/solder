// Inf, -Inf and NaN in Solder's files (DT-108): JSON cannot hold them, and they were written as `null`, so a Numeric
// Constant set to Inf ran as Inf until the OVI was saved and as 0 once it was opened again. They are written as the
// texts LabVIEW shows, "Inf", "-Inf" and "NaN", and read back as their numbers where a number is expected.

import assert from "node:assert/strict";
import { test } from "node:test";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { readTypeDefinition, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { clipboardPacket, clipboardText } from "../../core/model/constant-values.mjs";
import { CAT, buildOVI } from "../helpers.mjs";

/** Saves the OVI and opens it again, as the editor does. */
const savedAndOpened = (graph) => leer(aTexto(graph, CAT), CAT);

/** What the OVI's indicators show when it runs, by their names in the graph, which survive saving (ids do not). */
async function shown(graph) {
  const written = await ejecutar(compilar(graph, CAT), {});
  const nameOf = Object.fromEntries(graph.nodos.map((node) => [node.id, node.name]));
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [nameOf[nodeId], value]));
}

/** Three Numeric Constants, Inf, -Inf and NaN, each wired to an indicator. */
const specialConstants = () =>
  buildOVI(CAT, (b) => {
    for (const [name, value] of [["inf", Infinity], ["minus-inf", -Infinity], ["nan", NaN]]) {
      b.node(name, "const", { value });
      b.node(`shows-${name}`, "indicator");
      b.wire(`${name}.result`, `shows-${name}.value`);
    }
  });

test("Numeric Constants of Inf, -Inf and NaN are written as LabVIEW shows them", () => {
  const defaults = JSON.parse(aTexto(specialConstants().g, CAT))["block-diagram"].nodes.map((node) => node.config?.default);
  assert.deepEqual(defaults.filter((value) => value !== undefined), ["Inf", "-Inf", "NaN"]);
});

test("Numeric Constants of Inf, -Inf and NaN give the same values after saving and opening", async () => {
  const { g: graph } = specialConstants();
  const before = await shown(graph);
  assert.deepEqual(Object.values(before).sort(), [Infinity, -Infinity, NaN].sort());
  assert.deepEqual(await shown(savedAndOpened(graph)), before);
});

test("a numeric control's default of -Inf survives saving and opening", () => {
  const ovi = buildOVI(CAT, (b) => b.node("limit", "control", { value: -Infinity }));
  assert.equal(JSON.parse(aTexto(ovi.g, CAT))["front-panel"][0].default, "-Inf");
  assert.equal(savedAndOpened(ovi.g).nodos.find((node) => node.tipo === "control").config.value, -Infinity);
});

test("an array constant keeps its Inf and NaN elements, in one and two dimensions", () => {
  const ovi = buildOVI(CAT, (b) => {
    b.node("row", "arr-const", { type: { array: "number" }, value: [1, Infinity, NaN, -Infinity] });
    b.node("matrix", "arr-const", { type: { array: "number", dims: 2 }, value: [[Infinity], [NaN]] });
  });
  const reread = savedAndOpened(ovi.g);
  const valueOf = (name) => reread.nodos.find((node) => node.name === ovi.g.nodos.find((original) => original.id === ovi.id[name]).name).config.value;
  assert.deepEqual(valueOf("row"), [1, Infinity, NaN, -Infinity]);
  assert.deepEqual(valueOf("matrix"), [[Infinity], [NaN]]);
});

test("a cluster's numeric element of Inf survives saving and opening, in an OVI and in a type definition", () => {
  const elements = [{ tipo: "control", label: { text: "Limit" }, config: { type: "number", value: Infinity }, x: 4, y: 19 }];
  const ovi = buildOVI(CAT, (b) => b.node("cluster", "cluster-control"));
  const graph = setClusterElements(ovi.g, CAT, ovi.id.cluster, elements);
  const cluster = savedAndOpened(graph).nodos.find((node) => node.tipo === "cluster-control");
  assert.equal(cluster.config.elements[0].config.value, Infinity);
  const definition = readTypeDefinition(typeDefinitionText("control", [{ tipo: "cluster-control", config: { elements } }]), CAT);
  assert.equal(definition.objects[0].config.elements[0].config.value, Infinity);
});

test("a String Constant whose text is Inf stays text", () => {
  const ovi = buildOVI(CAT, (b) => b.node("words", "str-const", { value: "Inf" }));
  assert.equal(savedAndOpened(ovi.g).nodos.find((node) => node.tipo === "str-const").config.value, "Inf");
});

test("a numeric value written as any other text is refused, naming its object", () => {
  const file = JSON.parse(aTexto(specialConstants().g, CAT));
  file["block-diagram"].nodes[0].config.default = "infinity";
  assert.throws(() => leer(file, CAT), /"const_1".*must be a number/);
});

// The editor's clipboard carries a copied fragment between windows as JSON: a constant of Inf copied into another OVI
// was pasted as 0.
test("a copied fragment keeps its Inf, -Inf and NaN through the clipboard's text, and a string Inf stays a string", () => {
  const packet = { fragment: { nodos: [{ config: { value: Infinity } }, { config: { value: [-Infinity, NaN, 1] } }, { config: { value: "Inf" } }] } };
  assert.deepEqual(clipboardPacket(clipboardText(packet)), packet);
});
