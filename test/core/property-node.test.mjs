// The Property Node's catalog, terminals and types (DT-072): what the rows show and carry, as measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-10-30-panel-property-node.md, 2026-10-26-visa-property-node.md).

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import { classOfPanelBlock, isImplicit } from "../../core/model/property-node.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { VISA_RESOURCE } from "../../core/model/types.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

const PROPERTIES = CAT.properties;

test("the rows show LabVIEW's short names", () => {
  const short = (className, id) => PROPERTIES.find(className, id).short;
  assert.equal(short("Numeric", "Value"), "Value");
  assert.equal(short("Numeric", "Value (Signaling)"), "Val(Sgnl)");
  assert.equal(short("Numeric", "Key Focus"), "KeyFocus");
  assert.equal(short("Numeric", "Label:Text"), "Label.Text");
  assert.equal(short("Boolean", "Caption:Text"), "Caption.Text");
  assert.equal(short("String", "Position"), "Position");
  assert.equal(short("Instr", "General Settings:Timeout Value"), "Timeout");
  assert.equal(short("Instr", "Message Based Settings:Termination Character"), "TermChar");
  assert.equal(short("Instr", "Message Based Settings:Termination Character Enable"), "TermChar En");
});

test("the types and directions of the first properties are the measured ones", () => {
  const property = (className, id) => PROPERTIES.find(className, id);
  assert.deepEqual(property("Numeric", "Disabled").type, { enum: ["Enabled", "Disabled", "Disabled and Grayed Out"] });
  assert.deepEqual(property("Numeric", "Position").type, { cluster: [{ name: "Left", type: "i32" }, { name: "Top", type: "i32" }] });
  assert.deepEqual(property("Numeric", "Bounds").type, { cluster: [{ name: "Width", type: "u32" }, { name: "Height", type: "u32" }] });
  assert.equal(property("Numeric", "Bounds").access, "read");
  assert.equal(property("Numeric", "Value (Signaling)").access, "write");
  assert.equal(property("Numeric", "Has Caption").access, "read");
  assert.equal(property("Instr", "General Settings:Timeout Value").type, "u32");
  assert.equal(property("Instr", "Message Based Settings:Termination Character").type, "u8");
});

test("a property that is not done is found as a hole, and an unknown one is not found", () => {
  assert.equal(PROPERTIES.find("Numeric", "Blinking").done, false);
  assert.equal(PROPERTIES.find("Instr", "General Settings:Manufacturer Name").done, false, "the second General Settings");
  assert.equal(PROPERTIES.find("Numeric", "No Such Property"), undefined);
});

test("a label's or a caption's own text is done, but not the properties a text object takes from GObject", () => {
  assert.equal(PROPERTIES.find("Numeric", "Label:Text").done, true);
  assert.equal(PROPERTIES.find("Numeric", "Caption:Text").done, true);
  // Position and Bounds are done for the control itself, not yet for its label (DT-072 §8).
  assert.equal(PROPERTIES.find("Numeric", "Position").done, true);
  for (const id of ["Label:Position", "Label:Bounds", "Caption:Position", "Caption:Bounds"]) assert.equal(PROPERTIES.find("Numeric", id).done, false, id);
  // A row with no property chosen yet (the Instr node fresh from the palette) finds nothing and has no terminal.
  assert.equal(PROPERTIES.find("Instr", ""), undefined);
});

test("a class's menu is its ancestors' groups and then its own, as LabVIEW lists them", () => {
  const firstNames = PROPERTIES.menu("Numeric").map((group) => group[0].name);
  assert.deepEqual(firstNames, ["Class ID", "Bounds", "Auto-Update From Typedef", "Adapt To Source", "Display Format"]);
  assert.ok(PROPERTIES.menu("Boolean").flat().some((item) => item.name === "Mechanical Action"));
  assert.ok(!PROPERTIES.menu("Boolean").flat().some((item) => item.name === "Adapt To Source"));
  assert.equal(PROPERTIES.textObjectMenu("Text")[0][0].name, "Reference");
});

test("the implicit node of each panel block has the class measured", () => {
  assert.equal(classOfPanelBlock("control"), "Numeric");
  assert.equal(classOfPanelBlock("indicator"), "Numeric");
  assert.equal(classOfPanelBlock("bool-control"), "Boolean");
  assert.equal(classOfPanelBlock("str-indicator"), "String");
});

/** A VI with a control and an implicit Property Node linked to it, with `rows`. */
function linkedNode(controlBlock, rows, controlConfig) {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, controlBlock, 20, 20, "Numeric", controlConfig);
  g = control.g;
  const linkName = g.nodos.find((node) => node.id === control.id).name;
  const node = Gr.crearNodo(g, CAT, "property-node", 120, 20);
  g = Gr.fijarConfig(node.g, node.id, { class: classOfPanelBlock(controlBlock), link: linkName, rows });
  return { g, id: node.id, controlId: control.id };
}

test("an implicit node has no reference terminals and one terminal per row, a write an input and a read an output", () => {
  const { g, id } = linkedNode("control", [{ property: "Value", write: true }, { property: "Visible" }]);
  const node = g.nodos.find((candidate) => candidate.id === id);
  assert.ok(isImplicit(node));
  const ports = CAT.puertos(node);
  assert.deepEqual(ports.in.map((port) => port.name), ["error-in", "row-0"]);
  assert.deepEqual(ports.out.map((port) => port.name), ["row-1", "error-out"]);
});

test("Value carries the linked control's type; the other rows their own", () => {
  const numeric = linkedNode("control", [{ property: "Value" }, { property: "Disabled" }], { type: "i32" });
  const types = Gr.tipos(numeric.g, CAT);
  assert.equal(types.salidas.get(`${numeric.id}.row-0`), "i32");
  assert.deepEqual(types.salidas.get(`${numeric.id}.row-1`), { enum: ["Enabled", "Disabled", "Disabled and Grayed Out"] });
  const text = linkedNode("str-control", [{ property: "Value" }, { property: "Label:Text" }]);
  const textTypes = Gr.tipos(text.g, CAT);
  assert.equal(textTypes.salidas.get(`${text.id}.row-0`), "string");
  assert.equal(textTypes.salidas.get(`${text.id}.row-1`), "string");
  const boolean = linkedNode("bool-indicator", [{ property: "Value" }]);
  assert.equal(Gr.tipos(boolean.g, CAT).salidas.get(`${boolean.id}.row-0`), "boolean");
});

test("a row whose property is not done has no terminal", () => {
  const { g, id } = linkedNode("control", [{ property: "Blinking" }, { property: "Visible" }]);
  const ports = CAT.puertos(g.nodos.find((candidate) => candidate.id === id));
  assert.deepEqual(ports.out.map((port) => port.name), ["row-1", "error-out"]);
});

test("an Instr node takes a VISA resource name and gives it back", () => {
  let g = Gr.nuevo();
  const node = Gr.crearNodo(g, CAT, "property-node", 0, 0);
  g = Gr.fijarConfig(node.g, node.id, { class: "Instr", rows: [{ property: "General Settings:Timeout Value", write: true }] });
  const ports = CAT.puertos(g.nodos.find((candidate) => candidate.id === node.id));
  assert.deepEqual(ports.in.map((port) => [port.name, port.type]), [["reference", VISA_RESOURCE], ["error-in", ports.in[1].type], ["row-0", "u32"]]);
  assert.deepEqual(ports.out.map((port) => port.name), ["reference-out", "error-out"]);
});

test("a Property Node is saved with its class, link, rows and Ignore Errors, and opens the same", () => {
  const { g } = linkedNode("control", [{ property: "Value", write: true }, { property: "Label:Text" }]);
  const text = aTexto(g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(text, CAT), CAT), text);
});
