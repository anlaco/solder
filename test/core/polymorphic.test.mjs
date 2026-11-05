// Polymorphic OVIs (DT-074): a `.sdp` lists its instances; a node that calls it takes the chosen instance's
// terminals, Automatic picks one by what is wired, and the call compiles as a call to that instance. The test
// polymorphic has two numeric instances, as Write Delimited Spreadsheet.vi has Integer and Double (measured,
// labview-captures/reports/2026-11-05-vilib-and-type-polymorphic.md §B): 1D I32 picks Integer though Double comes
// later, 2D DBL picks Double though Integer would take it with a coercion, a Boolean array breaks the wire.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import * as Poly from "../../core/model/polymorphic.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { CAT, RAIZ, buildVI } from "../helpers.mjs";

const SDP = "/lib/Step.sdp";
const SDP_TEXT = Poly.writePolymorphic({
  ...Poly.emptyPolymorphic(),
  instances: [
    { path: "Step (I64).sdg", menuName: "Integer", selectorName: "Integer" },
    { path: "Step (DBL).sdg", menuName: "Double", selectorName: "Double" },
  ],
});

/** An instance: `x` (of `type`) into `step`, out to `result`; x in cell 9 (left edge), result in cell 2 (right edge), LabVIEW's indices of 4-2-2-4 of both. */
const instance = (type, step) =>
  buildVI(CAT, (b) => {
    b.node("x", "control", { type });
    b.node("step", step);
    b.node("result", "indicator", { type });
    b.wire("x.result", "step.x");
    b.wire("step.result", "result.value");
    b.connector([{ name: "x", cell: 9 }], [{ name: "result", cell: 2 }]);
  });
// Integer adds one, Double takes one away: which one ran shows in the result.
const FILES = { "/lib/Step (I64).sdg": instance("i64", "increment"), "/lib/Step (DBL).sdg": instance("number", "decrement") };

const resolvePath = (callerKey, stored) => path.posix.resolve(path.posix.dirname(callerKey), stored);

/** The hierarchy of a caller at /app/main.sdg whose graph `build(b)` makes, with the node `call` adapted. */
function callerOf(build) {
  const load = (rootGraph) =>
    loadHierarchy("/app/main.sdg", CAT, {
      resolvePath,
      loadVI: (key) => (key === "/app/main.sdg" ? rootGraph : FILES[key]?.g ?? null),
      loadPolymorphic: (key) => (key === SDP ? Poly.readPolymorphic(SDP_TEXT) : null),
    });
  const probe = load(Gr.nuevo());
  const vi = buildVI(probe.vis.get("/app/main.sdg").cat, build);
  const { cat } = load(vi.g).vis.get("/app/main.sdg");
  return { ...vi, g: Gr.adaptPolymorphicNodes(vi.g, cat), cat };
}

const callNode = (vi) => vi.g.nodos.find((node) => node.id === vi.id.call);
const CALL = Poly.polymorphicNodeConfig("../lib/Step.sdp", Poly.readPolymorphic(SDP_TEXT));

test("the .sdp file reads with its defaults and writes back the same, and its schema holds", () => {
  const read = Poly.readPolymorphic(SDP_TEXT);
  assert.deepEqual(read.instances.map((one) => [one.path, one.menuName, one.selectorName]), [["Step (I64).sdg", "Integer", "Integer"], ["Step (DBL).sdg", "Double", "Double"]]);
  assert.equal(read.showSelectorByDefault, false, "measured: the selector is hidden by default");
  assert.equal(read.adaptToDataType, true, "measured: Allow ... Adapt to Data Type is on");
  assert.equal(read.drawIcon, Poly.DRAW_ICON.POLYMORPHIC);
  assert.equal(Poly.writePolymorphic(read), SDP_TEXT);
  // A menu name left out is the file name; a selector name left out is the menu name.
  const bare = Poly.readPolymorphic({ "solder-polymorphic": 1, instances: [{ ovi: "sub/Write (string).sdg" }] });
  assert.deepEqual(bare.instances[0], { path: "sub/Write (string).sdg", menuName: "Write (string)", selectorName: "Write (string)" });
  assert.throws(() => Poly.readPolymorphic({ "solder-polymorphic": 2, instances: [] }), /version 2/);
  assert.throws(() => Poly.readPolymorphic("{"), Poly.PolymorphicFileError);

  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(path.join(RAIZ, "docs/schema/sdp.schema.json"), "utf8")));
  assert.ok(validate(JSON.parse(SDP_TEXT)), JSON.stringify(validate.errors));
  assert.ok(!validate({ "solder-polymorphic": 1, instances: [{ "menu-name": "no OVI" }] }), "an instance names its OVI");
});

test("unwired, the node is on Automatic and calls the first instance, with its terminals named by cell", () => {
  const vi = callerOf((b) => b.node("call", "subvi", CALL));
  const node = callNode(vi);
  assert.equal(node.config.instance, null);
  assert.equal(node.config.selected, 0);
  const ports = vi.cat.puertos(node);
  assert.deepEqual(ports.in.map((port) => [port.name, port.type, port.calleeName]), [["cell-9", "i64", "control_1"]]);
  assert.deepEqual(ports.out.map((port) => [port.name, port.type]), [["cell-2", "i64"]]);
  assert.equal(vi.cat.calleeOf(node), vi.cat.polymorphicOf(node).instances[0]);
});

async function runResult(vi, values) {
  const compiled = compilar(vi.g, vi.cat);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value])));
  return written[vi.id.shown];
}

const wiredWith = (type) =>
  callerOf((b) => {
    b.node("in", "control", { type });
    b.node("call", "subvi", CALL);
    b.node("shown", "indicator");
    b.wire("in.result", "call.cell-9");
    b.wire("call.cell-2", "shown.value");
  });

test("Automatic: I32 picks Integer, the first that takes it, and the call runs that instance", async () => {
  const vi = wiredWith("i32");
  assert.equal(callNode(vi).config.selected, 0);
  assert.equal(await runResult(vi, { in: 3 }), 4, "Integer adds one");
});

test("Automatic: DBL picks Double, which takes it as it comes, before Integer, which would coerce it", async () => {
  const vi = wiredWith("number");
  assert.equal(callNode(vi).config.selected, 1);
  assert.deepEqual(vi.cat.puertos(callNode(vi)).in.map((port) => port.type), ["number"]);
  assert.equal(await runResult(vi, { in: 2.5 }), 1.5, "Double takes one away");
});

test("Automatic: a Boolean array no instance takes keeps the first instance and breaks the wire, saying why", () => {
  const vi = wiredWith({ array: "boolean" });
  assert.equal(callNode(vi).config.selected, 0);
  const wire = vi.g.cables.find((one) => one.a.nodo === vi.id.call);
  const reason = Gr.tipos(vi.g, vi.cat).cables.get(wire.id).roto;
  assert.ok(reason.startsWith(Poly.DIFFERENT_TYPES_MESSAGE), reason);
  assert.match(reason, /takes array of boolean at "control_1"/, "what came in, and where");
  assert.match(reason, /its instances are Integer, Double/);
  assert.ok(compilar(vi.g, vi.cat).errores, "the OVI does not run");
});

test("an instance picked by hand stays, and a wire it does not take breaks with what it expects", async () => {
  const picked = callerOf((b) => {
    b.node("in", "control", { type: "i32" });
    b.node("call", "subvi", { ...CALL, instance: 1 });
    b.node("shown", "indicator");
    b.wire("in.result", "call.cell-9");
    b.wire("call.cell-2", "shown.value");
  });
  assert.deepEqual(picked.cat.puertos(callNode(picked)).in.map((port) => port.type), ["number"], "Double, though Automatic would pick Integer");
  assert.equal(await runResult(picked, { in: 3 }), 2);

  const broken = callerOf((b) => {
    b.node("in", "str-control");
    b.node("call", "subvi", { ...CALL, instance: 0 });
    b.wire("in.result", "call.cell-9");
  });
  const wire = broken.g.cables[0];
  assert.match(Gr.tipos(broken.g, broken.cat).cables.get(wire.id).roto, /^You have connected two terminals of different types\. The instance "Integer" expects .* and the wire carries string/);
});

test("Automatic is not offered when the polymorphic OVI does not adapt to the data type", () => {
  const fixed = Poly.readPolymorphic({ ...JSON.parse(SDP_TEXT), "adapt-to-data-type": false });
  assert.equal(Poly.isAutomatic({ config: { instance: null } }, fixed), false);
  assert.equal(Poly.selectedInstance({ config: { instance: null, selected: 1 } }, fixed), 1, "it keeps the instance it calls");
});

test("the page reads a .sdp and its instances with the caller, and the call's config survives its file", async () => {
  const { aTexto, leer } = await import("../../core/model/qvi-format.mjs");
  const Paths = await import("../../editor/src/common/vi-paths.mjs");
  const { buildHierarchy } = await import("../../editor/src/window/hierarchy-client.mjs");
  const vi = wiredWith("number");
  const files = { [SDP]: SDP_TEXT, ...Object.fromEntries(Object.entries(FILES).map(([key, one]) => [key, aTexto(one.g, CAT)])) };
  const callerText = aTexto(vi.g, vi.cat);
  const { texts, missing } = await Paths.readHierarchyTexts("/app/main.sdg", callerText, async (key) => files[key] ?? null);
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(texts).sort(), [SDP, ...Object.keys(FILES)].sort(), "the .sdp and every instance");

  const reopened = buildHierarchy({ rootKey: "/app/main.sdg", rootText: callerText, texts, baseCatalog: CAT, readVI: leer });
  assert.deepEqual(reopened.errors, []);
  const node = reopened.graph.nodos.find((one) => one.tipo === "subvi");
  assert.deepEqual({ instance: node.config.instance ?? null, selected: node.config.selected, selector: node.config.selector }, { instance: null, selected: 1, selector: false });
  assert.equal(reopened.graph.cables.length, 2, "both wires find their terminals by cell");
});
