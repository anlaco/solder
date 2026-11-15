// Replace ▸ on a front-panel object (DT-092), measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-15-delete-replace.md §C and 2026-11-15-terminal-hot-zones.md §3.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { shownRingText } from "../../editor/src/common/ring-editing.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

const NUMERIC_ROOT = "context.numeric-panel-control";
const BOOLEAN_INDICATOR_ROOT = "context.boolean-indicator";
const pick = (root, path) => `${root}.replace.${path}`;
const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);
const portOf = (node, port, dir) => ({ nodo: node, puerto: port, dir });

/** An I32 control "x" holding 7 (current), wired to Increment, and an indicator wired from it. */
function wiredControl() {
  let g = Gr.nuevo();
  const control = Gr.crearEnPanel(g, CAT, "control", 20, 30, "x");
  const increment = Gr.crearNodo(control.g, CAT, "increment", 200, 100);
  g = Gr.fijarRepresentacion(increment.g, control.id, "i32");
  g = CV.setCurrentValue(g, control.id, 7);
  g = Gr.conectar(g, CAT, portOf(control.id, "result", "out"), portOf(increment.id, "x", "in")).g;
  return { g, control: control.id, increment: increment.id };
}

const openOnPanel = (g, root, id) => ED.abrirMenuDelPanel({ ...P.inicial(g) }, root, id, 10, 10);
const replaceWith = (g, root, id, path) => ED.orden(openOnPanel(g, root, id), pick(root, path), CTX, INV);

test("Replace ▸ opens the Controls palette as a submenu, with its folders and items, and what Solder lacks greyed with its palette's reason", () => {
  const { g, control } = wiredControl();
  const menu = openOnPanel(g, NUMERIC_ROOT, control);
  const variants = ED.variantes(menu, CTX, INV);
  const replaceRow = `${NUMERIC_ROOT}.replace`;
  assert.ok(ED.menuRowHasSubmenu(menu, CTX, INV, replaceRow), "the row opens a submenu");
  const topLevel = variants.submenus.get(replaceRow).map((row) => row.etiqueta);
  assert.equal(topLevel[0], "Modern", "the palette's own order and names");
  assert.ok(!topLevel.includes("Thumbtack") && !topLevel.includes("Double Arrows"), "the palette's title and foot are not rows");
  const modern = variants.submenus.get(pick(NUMERIC_ROOT, "modern")).map((row) => row.etiqueta);
  assert.deepEqual(modern.slice(0, 4), ["Numeric", "Boolean", "String & Path", "Data Containers"]);

  const numeric = variants.submenus.get(pick(NUMERIC_ROOT, "modern.numeric"));
  assert.equal(numeric.find((row) => row.etiqueta === "Numeric Indicator").estado, "built");
  const knob = pick(NUMERIC_ROOT, "modern.numeric.knob");
  assert.equal(variants.redirigidos.get(knob), "palette.controls.modern.numeric.knob", "a hole explains itself through its palette entry");
  assert.equal(ED.menuRowEntry(menu, CTX, INV, pick(NUMERIC_ROOT, "modern.numeric.numeric-indicator")).etiqueta, "Numeric Indicator");

  const opened = ED.sobreMenu(ED.sobreMenu(ED.sobreMenu(menu, replaceRow, true), pick(NUMERIC_ROOT, "modern"), true), pick(NUMERIC_ROOT, "modern.numeric"), true);
  const html = D.menuContextual(INV, opened.menu, new Set(), undefined, ED.variantes(opened, CTX, INV));
  assert.match(html, /Numeric Indicator/);
  assert.match(html, /Knob/);
});

test("the row is enabled on the panel object's menu and absent from its diagram terminal's menu, also where the root is shared (an enum)", () => {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 20, 30, "e", { type: { enum: ["a", "b"] } });
  const row = "context.enum-control.replace";
  const onPanel = ED.abrirMenuDelPanel(P.inicial(placed.g), "context.enum-control", placed.id, 0, 0);
  assert.ok(!ED.variantes(onPanel, CTX, INV).ocultos?.has(row));
  const onDiagram = ED.abrirMenu(ED.inicial(), "context.enum-control", placed.id, 0, 0);
  const diagram = { ...onDiagram, g: placed.g };
  assert.ok(ED.variantes(diagram, CTX, INV).ocultos.has(row), "the diagram terminal has no Replace (measured)");
  assert.equal(INV.resolver(`${NUMERIC_ROOT}.replace`).estado, "built");
  assert.equal(INV.entrada("context.numeric-control.replace"), undefined, "nor does the numeric terminal's menu");
});

test("replacing keeps the node and its wire, the label, the representation and the value; a Text Ring shows <n> when no item has it", () => {
  const { g, control, increment } = wiredControl();
  const result = replaceWith(g, NUMERIC_ROOT, control, "modern.ring-and-enum.text-ring");
  assert.equal(result.menu, null, "the menu closes");
  const replaced = nodeOf(result.g, control);
  assert.equal(replaced.id, control);
  assert.equal(replaced.config.style, "text-ring");
  assert.equal(replaced.config.type, "i32", "I32 kept by a Text Ring (measured)");
  assert.equal(replaced.label.text, "x");
  assert.deepEqual(replaced.panel, nodeOf(g, control).panel, "the old top-left is kept (unverified in LabVIEW)");
  assert.equal(shownRingText(replaced), "<7>");
  assert.deepEqual(result.g.cables, g.cables, "the wire is the same");
  assert.ok(!Gr.tipos(result.g, CAT).cables.get(result.g.cables[0].id).roto, "and still fits: a numeric to Increment");
  assert.ok(result.g.nodos.some((node) => node.id === increment));
});

test("a control stays a control when an indicator's item is picked, with its representation and value (measured)", () => {
  const { g, control } = wiredControl();
  const replaced = nodeOf(replaceWith(g, NUMERIC_ROOT, control, "modern.numeric.numeric-indicator").g, control);
  assert.equal(replaced.tipo, "control");
  assert.equal(replaced.config.type, "i32");
  assert.equal(CV.currentValue(replaced), 7);
  assert.equal(nodeOf(g, control).tipo, "control");
});

test("an indicator stays an indicator when a control's item is picked, and its type changes with the item", () => {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, "bool-indicator", 20, 30, "lamp");
  const replaced = nodeOf(replaceWith(placed.g, BOOLEAN_INDICATOR_ROOT, placed.id, "modern.boolean.push-button").g, placed.id);
  assert.equal(replaced.tipo, "bool-indicator");
  assert.equal(replaced.config.style, "push-button");
  const toString = nodeOf(replaceWith(placed.g, BOOLEAN_INDICATOR_ROOT, placed.id, "modern.string-and-path.string-control").g, placed.id);
  assert.equal(toString.tipo, "str-indicator");
  assert.equal(toString.label.text, "lamp");
});

test("a change of data type leaves the wire that no longer fits broken, not removed, and it is one Undo step", () => {
  const { g, control, increment } = wiredControl();
  const result = replaceWith(g, NUMERIC_ROOT, control, "modern.boolean.push-button");
  const replaced = nodeOf(result.g, control);
  assert.equal(replaced.tipo, "bool-control");
  assert.equal(CV.currentValue(replaced), false, "a number does not become a boolean: the new object's default");
  assert.equal(result.g.cables.length, 1, "the wire is not removed");
  assert.equal(result.g.cables[0].de.nodo, control);
  assert.equal(result.g.cables[0].a.nodo, increment);
  assert.ok(Gr.tipos(result.g, CAT).cables.get(result.g.cables[0].id).roto, "it is broken");

  const history = H.registrar(H.nuevo(g), result.g);
  assert.deepEqual(H.deshacer(history).g, g, "one Undo brings the numeric control back");
});

test("an item the object's role cannot take is greyed, and one Solder lacks does nothing", () => {
  const { g, control } = wiredControl();
  const menu = openOnPanel(g, NUMERIC_ROOT, control);
  const variants = ED.variantes(menu, CTX, INV);
  assert.ok(variants.desactivados.has(pick(NUMERIC_ROOT, "modern.graph.waveform-chart")), "Solder has no graph as a control yet");
  assert.equal(replaceWith(g, NUMERIC_ROOT, control, "modern.graph.waveform-chart").g, g);
  assert.equal(replaceWith(g, NUMERIC_ROOT, control, "modern.numeric.knob").g, g, "Knob is not built");
});
