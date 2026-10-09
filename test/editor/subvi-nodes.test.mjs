// SubVI nodes in the editor (DT-045, spec/05 §12): their ports come from the
// connector of the VI they call, they are drawn as that VI's 32 × 32 icon, and
// they are placed from Select a VI... Measured in LabVIEW 2026 Q3
// (labview-captures/subvi/).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as Paths from "../../editor/src/common/vi-paths.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SN from "../../editor/src/block-diagram/subvi-nodes.mjs";
import { assignPanelElement } from "../../core/model/connector.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { CAT, INV, buildAdder } from "../helpers.mjs";

const CALLER = "/vis/main.qvi";
const ADDER = "/vis/lib/add2.qvi";

/** The adder with `x` in cell 0, `y` in cell 2 and `sum` in cell 9, as text. */
function adderText(connectionOfX) {
  const { g, ids } = buildAdder();
  let withConnector = g;
  for (const [id, cell] of [[ids.x, 0], [ids.y, 2], [ids.sum, 9]]) withConnector = assignPanelElement(withConnector, CAT, id, cell);
  if (connectionOfX) withConnector = { ...withConnector, vi: { ...withConnector.vi, connector: { ...withConnector.vi.connector, inputs: withConnector.vi.connector.inputs.map((t, i) => (i === 0 ? { ...t, connection: connectionOfX } : t)) } } };
  return Q.aTexto(withConnector, CAT);
}

/** A caller holding a subVI node that calls the adder, with the hierarchy the page would build. */
function callerWithAdder(texts = { [ADDER]: adderText() }) {
  const empty = Gr.nuevo();
  const probe = buildHierarchy({ rootKey: CALLER, rootGraph: empty, texts, baseCatalog: CAT, readVI: Q.leer });
  const placed = Gr.crearNodo(empty, probe.catalog, "subvi", 100, 60);
  const g = Gr.fijarConfig(placed.g, placed.id, SN.subVIConfig("lib/add2.qvi"));
  const result = buildHierarchy({ rootKey: CALLER, rootGraph: g, texts, baseCatalog: CAT, readVI: Q.leer });
  return { g, id: placed.id, ...result, ctx: D.contexto(result.catalog, D.glifosPorBloque(INV)) };
}

test("a subVI node has the ports of the connector of the VI it calls, on the edges of its icon", () => {
  const { g, id, catalog, ctx, errors, keys } = callerWithAdder();
  assert.deepEqual(errors, []);
  assert.deepEqual(keys, [ADDER], "the callee is part of the hierarchy");
  const node = g.nodos.find((n) => n.id === id);
  const box = D.caja(node, ctx);
  assert.deepEqual([box.ancho, box.alto], [32, 32], "the node is the 32 × 32 icon");
  const ports = Object.fromEntries(D.terminales(node, ctx).map((t) => [t.puerto, t]));
  assert.deepEqual(Object.keys(ports).sort(), ["control_1", "control_2", "indicator_1"], "named after the panel elements");
  // x on cell 0 and y on cell 2, on the left edge; sum on cell 9, on the right edge, 8 px apart as the cells are.
  assert.deepEqual([ports.control_1.x, ports.control_1.y], [100, 64]);
  assert.deepEqual([ports.control_2.x, ports.control_2.y], [100, 80]);
  assert.deepEqual([ports.indicator_1.x, ports.indicator_1.y], [132, 72]);
  assert.deepEqual([ports.control_1.dir, ports.indicator_1.dir], ["in", "out"]);
  assert.equal(ports.control_1.etiqueta, "x", "the tip is the label of the control");
  assert.deepEqual(catalog.puertos(node).in.map((p) => p.type), ["number", "number"], "typed by the controls of the callee");

});

test("a subVI node is drawn as a 32 by 32 icon and its menu is declared in the order of LabVIEW", () => {
  const { g, id, ctx, catalog } = callerWithAdder();
  const html = D.contenido({ ...ED.inicial(), g }, ctx, Gr.tipos(g, catalog));
  assert.match(html, new RegExp(`class="nodo" data-nodo="${id}" style="left:100px;top:60px;width:32px;height:32px"`));
  assert.match(html, /class="glifo-subvi"/);
  assert.equal(D.menuDe(g.nodos[0], null, g), "context.subvi");
  // Without the callee the node shows its broken icon and has no ports.
  const missing = callerWithAdder({}).ctx;
  assert.match(D.contenido({ ...ED.inicial(), g }, missing, Gr.tipos(g, missing.cat)), /stroke-dasharray="3 2"/);

  const rows = INV.hijos("context.subvi").map((e) => `${e.separado ? "| " : ""}${e.etiqueta}`);
  assert.deepEqual(rows, [
    "Visible Items", "Help", "Examples", "Description and Tip...", "| Add Breakpoint", "| Create", "| Replace", "Replace with SubVI Contents...",
    "| Relink To SubVI", "SubVI Node Setup...", "Enable Database Access", "Call Setup...", "| Find All Instances", "Open Front Panel", "Show VI Hierarchy", "Explore...",
    "| View As Icon", "| Remove and Rewire", "| Properties",
  ]);
  assert.deepEqual(INV.hijos("context.subvi.create").map((e) => `${e.separado ? "| " : ""}${e.etiqueta}`), ["Constant", "Control", "Indicator", "Scalar", "Channel Writer...", "| All Controls and Indicators", "All Constants"], "Scalar sits between Indicator and Channel Writer on an array terminal (create-paste/array-size-input-create-scalar-submenu.png)");
  // Open Front Panel is done; the rest says why not.
  assert.equal(INV.entrada("context.subvi.open-front-panel").estado, "built");
  assert.deepEqual(INV.hijos("context.subvi").filter((e) => e.estado === "built").map((e) => e.etiqueta), ["Create", "Open Front Panel"]);
  // The menu is drawn with its checkmark on View As Icon, as in the capture.
  const opened = ED.abrirMenu({ ...ED.inicial(), g }, "context.subvi", g.nodos[0].id, 10, 10);
  assert.ok(ED.marcados(opened).has("context.subvi.view-as-icon"));
  assert.match(D.menuContextual(INV, opened.menu, ED.marcados(opened)), /data-id="context\.subvi\.open-front-panel"/);
});

test("a wire to a port the subVI no longer has is dropped when the hierarchy is rebuilt", () => {
  const { g, id } = callerWithAdder();
  // Wire a control of the caller to x and to y, and the sum to an indicator.
  let wired = g;
  const catalog = callerWithAdder().catalog;
  const control = Gr.crearEnPanel(wired, catalog, "control", 10, 10, "a");
  const indicator = Gr.crearEnPanel(control.g, catalog, "indicator", 300, 10, "b");
  wired = Gr.conectar(indicator.g, catalog, { nodo: control.id, puerto: "result", dir: "out" }, { nodo: id, puerto: "control_1", dir: "in" }).g;
  wired = Gr.conectar(wired, catalog, { nodo: id, puerto: "indicator_1", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" }).g;
  assert.equal(wired.cables.length, 2);
  assert.equal(SN.pruneOrphanWires(wired, catalog), wired, "nothing to drop while the connector is the same");

  // The subVI is saved again with `x` taken off its connector.
  const { g: adder, ids } = buildAdder();
  const changed = assignPanelElement(assignPanelElement(adder, CAT, ids.y, 2), CAT, ids.sum, 9);
  const rebuilt = buildHierarchy({ rootKey: CALLER, rootGraph: wired, texts: { [ADDER]: Q.aTexto(changed, CAT) }, baseCatalog: CAT, readVI: Q.leer });
  const pruned = SN.pruneOrphanWires(wired, rebuilt.catalog);
  assert.equal(pruned.cables.length, 1, "the wire to x is gone");
  assert.equal(pruned.cables[0].de.puerto, "indicator_1");
  assert.equal(Gr.tipos(pruned, rebuilt.catalog).cables.size, 1, "the types resolve again");
});

test("Select a VI places a subVI node and stores its path relative to the caller", () => {
  const texts = { [ADDER]: adderText() };
  const empty = buildHierarchy({ rootKey: CALLER, rootGraph: Gr.nuevo(), texts, baseCatalog: CAT, readVI: Q.leer });
  const ctx = D.contexto(empty.catalog, D.glifosPorBloque(INV));

  // The dialog gives an absolute path; a caller with a file stores it relative to itself.
  const stored = Paths.storedPathFor(CALLER, ADDER);
  assert.equal(stored, "lib/add2.qvi");
  // The VI follows the cursor and a click drops it, as with any function of the palette.
  let d = ED.coger({ ...ED.inicial(), g: Gr.nuevo() }, "subvi", SN.subVIConfig(stored));
  d = ED.moverA(d, ctx, { x: 204, y: 104 });
  assert.match(D.contenido(d, ctx, Gr.tipos(d.g, empty.catalog)), /class="fantasma"/, "the ghost shows while it is carried");
  d = ED.pulsar(d, ctx, { tipo: "fondo" }, { x: 204, y: 104 });
  const [node] = d.g.nodos;
  assert.equal(node.tipo, "subvi");
  assert.equal(node.config.vi, "lib/add2.qvi");
  assert.deepEqual([node.x, node.y], [200, 100]);

  // It is saved and read back with its ports, and the file keeps the relative path.
  const rootGraph = buildHierarchy({ rootKey: CALLER, rootGraph: d.g, texts, baseCatalog: CAT, readVI: Q.leer });
  const file = Q.escribir(d.g, rootGraph.catalog);
  assert.equal(file["block-diagram"].nodes[0].config.vi, "lib/add2.qvi");
  const back = buildHierarchy({ rootKey: CALLER, rootText: Q.aTexto(d.g, rootGraph.catalog), texts, baseCatalog: CAT, readVI: Q.leer });
  assert.equal(back.graph.nodos[0].config.vi, "lib/add2.qvi");
  assert.deepEqual(back.keys, [ADDER]);

  // From a caller that has never been saved, the absolute path is stored (and rebased when it is saved).
  assert.equal(Paths.storedPathFor(Paths.untitledKey(1), ADDER), ADDER);
  assert.equal(INV.entrada("palette.functions.select-a-vi").estado, "built");
  // A recursive call, or a VI that cannot be found, is reported and breaks the Run arrow.
  const recursive = buildHierarchy({ rootKey: ADDER, rootGraph: Gr.fijarConfig(d.g, node.id, { vi: "add2.qvi" }), texts: { [ADDER]: adderText() }, baseCatalog: CAT, readVI: Q.leer });
  assert.equal(recursive.errors.length, 1);
  assert.match(recursive.errors[0], /calls itself/);
  assert.match(buildHierarchy({ rootKey: CALLER, rootGraph: d.g, texts: {}, baseCatalog: CAT, readVI: Q.leer }).errors[0], /cannot be found/);
});

test("Create on a subVI node makes the object of the terminal's type, labelled with the callee's control, and All Controls and Indicators fills every terminal", () => {
  const { g, id, ctx } = callerWithAdder();
  const menu = (d, port) => ED.abrirMenu(d, "context.subvi", id, 0, 0, port, { x: 5, y: 5 });
  const state = { ...ED.inicial(), g };
  const control = ED.orden(menu(state, "control_1"), "context.subvi.create.control", ctx);
  const made = control.g.nodos.find((n) => n.tipo === "control");
  assert.equal(made.label.text, "x", "the label of the callee's control, not the port's name");
  assert.deepEqual(control.g.cables.map((c) => [c.a.nodo, c.a.puerto]), [[id, "control_1"]]);
  const body = ED.variantes(menu(state, null), ctx);
  assert.ok(body.desactivados.has("context.subvi.create.constant"), "greyed on the body of the node (subvi-node-menu-create.png)");
  const all = ED.orden(menu(state, null), "context.subvi.create.all-controls-and-indicators", ctx);
  assert.equal(all.g.cables.length, 3);
  assert.deepEqual(all.g.nodos.filter((n) => n.panel).map((n) => n.label.text).sort(), ["sum", "x", "y"]);
});
