// A user's cluster on the Front Panel and the Block Diagram (DT-095, stage a). Sizes, colours and order are those measured
// in LabVIEW 2026 Q3: labview-captures/reports/2026-11-16-cluster-panel.md and -cluster-diagram.md (local evidence, never
// committed). What was not measured says "unverified".

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { aspecto, COLORES } from "../../core/model/types.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { CLUSTER_MEASURES, clusterAt, interiorBox, shellBox } from "../../editor/src/front-panel/cluster-panel.mjs";
import { foldClusters } from "../../editor/src/front-panel/cluster-unfolding.mjs";
import { labelShown } from "../../editor/src/front-panel/graph-state.mjs";
import { CAT, INV } from "../helpers.mjs";
import { menuRows, shown } from "./menu-rows.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const clusterEntry = () => INV.entrada("palette.controls.modern.data-containers.cluster");

/** Take a control from the palette, carry it to `point` and click, as the editor does. */
function place(p, block, point, config) {
  const carried = P.moverA(P.coger(p, block, config), CTX, point);
  return P.confirmar(P.pulsar(carried, CTX, FONDO, point));
}
const placeCluster = (p, point) => place(p, clusterEntry().bloque, point, clusterEntry().config);

/** A panel with an empty cluster whose shell is (250, 250, 100, 100): its interior starts at (254, 254). */
function panelWithCluster() {
  const p = placeCluster(P.inicial(), { x: 300, y: 300 });
  return { p, cluster: p.g.nodos[0] };
}
/** The graph as the diagram and the file see it: the objects inside a cluster are its elements (DT-106). */
const folded = (g) => foldClusters(g, CAT);
const elementsOf = (p) => folded(p.g).nodos.find((n) => n.config?.elements).config.elements;

test("the Cluster of the Data Containers palette drops a 100 x 100 shell with no elements", () => {
  const entry = clusterEntry();
  assert.equal(entry.estado, "built");
  assert.deepEqual([entry.bloque, entry.config], ["cluster-control", { elements: [] }]);
  const { p, cluster } = panelWithCluster();
  assert.equal(cluster.tipo, "cluster-control");
  assert.deepEqual(cluster.config.elements, []);
  assert.deepEqual(cluster.config.type, { cluster: [] }, "its type follows its elements, none yet");
  const box = P.caja(cluster);
  assert.deepEqual([box.ancho, box.alto], [100, 100], "report §1: the empty shell is 100 x 100");
  assert.deepEqual([CLUSTER_MEASURES.width, CLUSTER_MEASURES.height, CLUSTER_MEASURES.bevel], [100, 100, 4]);
  // The label is "Cluster", then "Cluster 2", above the shell, left-aligned, 2 px away (report §1).
  assert.equal(cluster.label.text, "Cluster");
  assert.equal(placeCluster(p, { x: 600, y: 300 }).g.nodos[1].label.text, "Cluster 2");
  const label = P.cajaEtiqueta(cluster, CTX.medir);
  assert.deepEqual([label.x, label.y + label.alto], [box.x, box.y - 2]);
});

test("the shell is drawn with the measured bevel round a #b3b3b3 interior, and its elements are clipped by it", () => {
  const { p } = panelWithCluster();
  const html = P.contenido(p, CTX);
  assert.match(html, /class="objeto-panel sd-control sd-cluster"[^>]*style="left:250px;top:250px;width:100px;height:100px"/);
  assert.match(html, /class="sd-cluster-interior" style="left:4px;top:4px;width:92px;height:92px"/, "a 4 px bevel round a 92 x 92 interior");
  // Old School's bevel, left and top then right and bottom, from the outside in (report §1), and its interior.
  const token = oldSchoolToken;
  assert.deepEqual([token("--cluster-bevel-left"), token("--cluster-bevel-dark-2"), token("--cluster-bevel-dark-3"), token("--cluster-bevel-dark-4")], ["#c9c9c9", "#c2c2c2", "#b7b7b7", "#b1b1b1"]);
  assert.equal(token("--cluster-bevel-top"), "#d3d3d3");
  assert.deepEqual([token("--cluster-bevel-right"), token("--cluster-bevel-light-2"), token("--cluster-bevel-light-3"), token("--cluster-bevel-light-4")], ["#e0e0e0", "#ededed", "#f2f2f2", "#eeeeee"]);
  assert.equal(token("--cluster-bevel-bottom"), "#eaeaea");
  assert.equal(token("--cluster-interior"), "#b3b3b3");
  assert.equal(token("--panel-background"), "#e2e2e2", "the panel behind it");
});

test("a control dropped on the interior becomes an element at the drop point, in drop order", () => {
  let { p, cluster } = panelWithCluster();
  p = place(p, "control", { x: 300, y: 300 });
  p = place(p, "bool-control", { x: 300, y: 330 });
  p = place(p, "str-control", { x: 300, y: 270 });
  assert.equal(folded(p.g).nodos.length, 1, "an element has no terminal on the diagram: folded, it is only inside its cluster");
  assert.deepEqual(p.g.nodos.map((node) => node.inside), [undefined, cluster.id, cluster.id, cluster.id], "while the panel is edited each is an object inside it (DT-106)");
  assert.ok(p.g.nodos.slice(1).every((node) => node.x === undefined && node.name === undefined), "with no terminal");
  const elements = elementsOf(p);
  assert.deepEqual(elements.map((e) => [e.tipo, e.label.text]), [["control", "Numeric"], ["bool-control", "Boolean"], ["str-control", "String"]], "the cluster order is the drop order (report §3)");
  // Centred on the drop point (as the control hangs from the cursor): a numeric's corner is (261, 288) on the panel, so (7, 34) inside the interior at (254, 254).
  assert.deepEqual([elements[0].x, elements[0].y], [7, 34]);
  assert.deepEqual(folded(p.g).nodos[0].config.type, { cluster: [{ name: "Numeric", type: "number" }, { name: "Boolean", type: "boolean" }, { name: "String", type: "string" }] });
  assert.deepEqual(shellBox(p.g.nodos[0]), { x: cluster.panel.x, y: cluster.panel.y, ancho: 100, alto: 100 }, "the shell does not grow (AutoSizing None, report §2)");
});

test("an element dropped near the inner left edge is pushed inside it, and one on the bevel is no element", () => {
  let { p } = panelWithCluster();
  p = place(p, "str-control", { x: 270, y: 300 });
  assert.equal(elementsOf(p)[0].x, 0, "report §2: pushed inside the inner left edge");
  // On the 4 px bevel, outside the interior, the control stays on the panel.
  p = place(p, "control", { x: 251, y: 300 });
  assert.equal(folded(p.g).nodos.length, 2);
  assert.equal(elementsOf(p).length, 1);
  assert.equal(clusterAt(p.g, { x: 251, y: 300 }), undefined);
  assert.ok(clusterAt(p.g, { x: 254, y: 254 }));
  assert.deepEqual(interiorBox(shellBox(p.g.nodos[0])), { x: 254, y: 254, ancho: 92, alto: 92 });
});

test("an indicator dropped into a control cluster takes the cluster's kind, and a Boolean its kind's style", () => {
  let { p } = panelWithCluster();
  p = place(p, "indicator", { x: 300, y: 300 });
  p = place(p, "bool-indicator", { x: 300, y: 330 }, { style: "round-led" });
  assert.deepEqual(elementsOf(p).map((e) => e.tipo), ["control", "bool-control"]);
  assert.equal(elementsOf(p)[1].config.style, "push-button");
});

test("a control dragged on the panel onto the interior becomes an element and leaves the panel and the diagram", () => {
  let { p } = panelWithCluster();
  p = place(p, "control", { x: 100, y: 100 });
  p = place(p, "indicator", { x: 100, y: 200 });
  const [, control, indicator] = p.g.nodos;
  const wired = Gr.conectar(p.g, CAT, { nodo: control.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" });
  p = { ...p, g: CV.setCurrentValue(wired.g, control.id, 5) };
  assert.equal(p.g.cables.length, 1);
  // Press on its edge (the move band), drag it onto the interior and let go.
  const edge = { x: control.panel.x + 20, y: control.panel.y + 1 };
  p = P.pulsar(p, CTX, { tipo: "objeto", id: control.id }, edge);
  p = P.moverA(p, CTX, { x: 300, y: 300 });
  p = P.soltar(p, CTX, FONDO, { x: 300, y: 300 });
  assert.deepEqual(folded(p.g).nodos.map((n) => n.id), [p.g.nodos[0].id, indicator.id], "no longer a top-level object");
  assert.equal(p.g.cables.length, 0, "an element has no terminal, so its wire goes with it");
  const [element] = elementsOf(p);
  assert.deepEqual([element.tipo, element.label.text, element.config.value], ["control", "Numeric", 0]);
  assert.deepEqual(folded(p.g).nodos[0].currentValue, [5], "it keeps the value it held, and the cluster's is its elements', in cluster order");
  // Released outside any cluster it is only moved.
  let q = place(P.inicial(), "control", { x: 100, y: 100 });
  q = P.pulsar(q, CTX, { tipo: "objeto", id: q.g.nodos[0].id }, { x: 120, y: 101 });
  q = P.soltar(P.moverA(q, CTX, { x: 400, y: 400 }), CTX, FONDO, { x: 400, y: 400 });
  assert.equal(q.g.nodos.length, 1);
  assert.equal(q.g.nodos[0].config?.elements, undefined);
});

test("each element is drawn as the control it is, over its cluster and clipped by the interior, with the hooks of any panel object", () => {
  let { p } = panelWithCluster();
  p = place(p, "control", { x: 300, y: 300 });
  p = place(p, "bool-control", { x: 300, y: 330 });
  p = place(p, "str-control", { x: 300, y: 270 });
  const html = P.contenido(p, CTX);
  assert.doesNotMatch(html, /sd-cluster-element/, "the shell holds none while unfolded");
  assert.equal((html.match(/class="objeto-panel/g) ?? []).length, 4, "the shell and its three elements answer the editor's presses");
  assert.match(html, /class="objeto-panel sd-control sd-numeric" data-nodo="n2" data-label="Numeric" style="left:261px;top:288px;width:67px;height:25px"/, "at its place on the panel: the interior's corner (254, 254) and its place in it");
  assert.match(html, /data-paso/, "its arrows act");
  assert.ok(html.indexOf("sd-cluster-interior") < html.indexOf('data-label="Numeric"'), "above the cluster");
  assert.match(html, /data-etiqueta="n2"[^>]*>Numeric</, "each one has its own label");
  // Dragged over the frame, it is cut there; the part inside is whole.
  const partly = { ...p, g: { ...p.g, nodos: p.g.nodos.map((node) => (node.label?.text === "Numeric" ? { ...node, panel: { x: 320, y: 288 } } : node)) } };
  assert.match(P.contenido(partly, CTX), /data-label="Numeric" style="left:320px;top:288px;width:67px;height:25px;clip-path:inset\(-100px 41px -100px -100px\)"/, "the interior ends at x = 346");
  // A press on it selects it, not the cluster.
  const element = p.g.nodos.find((node) => node.label?.text === "Numeric");
  const pressed = P.pulsar(p, CTX, { tipo: "objeto", id: element.id }, { x: element.panel.x + 20, y: element.panel.y + 1 });
  assert.deepEqual(pressed.seleccion, [element.id]);
});

test("the shell is resized by its handles and never grows by itself", () => {
  let { p, cluster } = panelWithCluster();
  assert.doesNotMatch(P.contenido(p, CTX), /data-asa-cluster/, "handles only while selected");
  p = { ...p, seleccion: [cluster.id] };
  const handles = [...P.contenido(p, CTX).matchAll(/data-asa-cluster="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(handles, ["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
  const drag = (side, dx, dy) => {
    const pressed = P.pulsar(p, CTX, { tipo: "asa-cluster", id: cluster.id, lado: side }, { x: 350, y: 350 });
    return P.soltar(P.moverA(pressed, CTX, { x: 350 + dx, y: 350 + dy }), CTX, FONDO, { x: 350 + dx, y: 350 + dy });
  };
  const sized = (q) => shellBox(q.g.nodos[0]);
  assert.deepEqual(sized(drag("se", 30, 20)), { x: 250, y: 250, ancho: 130, alto: 120 });
  assert.deepEqual(sized(drag("nw", 10, 10)), { x: 260, y: 260, ancho: 90, alto: 90 }, "a left or top handle moves the corner");
  assert.equal(sized(drag("e", -500, 0)).ancho, CLUSTER_MEASURES.smallest, "it stops at the smallest size (unmeasured)");
  const resized = drag("se", 30, 20);
  assert.match(P.contenido(resized, CTX), /class="sd-cluster-interior" style="left:4px;top:4px;width:122px;height:112px"/);
  // The size is kept in the file, with the elements and the label's visibility.
  const text = aTexto(resized.g, CAT);
  assert.deepEqual(Object.values(JSON.parse(text).layout.panel)[0], { x: 250, y: 250, w: 130, h: 120, label: { text: "Cluster" } });
  assert.deepEqual(shellBox(leer(text, CAT).nodos[0]), { x: 250, y: 250, ancho: 130, alto: 120 });
});

// ——— The Block Diagram ———

const terminalOf = (g, id, compact) => {
  const view = compact ? Gr.alternarIcono(g, id) : g;
  return D.contenido({ ...ED.inicial(), g: view }, CTX, Gr.tipos(view, CAT));
};

test("the cluster's terminal is the 38 x 38 icon, magenta for mixed contents and brown for numbers only or none", () => {
  let { p } = panelWithCluster();
  const id = p.g.nodos[0].id;
  assert.deepEqual([COLORES.cluster, COLORES.clusterMixed], ["#993300", "#ff00ff"]);
  const empty = terminalOf(folded(p.g), id);
  assert.match(empty, /<svg[^>]*viewBox="0 0 38 38"/);
  assert.match(empty, /stroke="#993300"/, "empty: brown");
  p = place(p, "control", { x: 300, y: 300 });
  assert.match(terminalOf(folded(p.g), id), /stroke="#993300"/, "numeric only: brown");
  p = place(p, "str-control", { x: 300, y: 330 });
  const mixed = terminalOf(folded(p.g), id);
  assert.match(mixed, /stroke="#ff00ff"/, "mixed: magenta");
  assert.doesNotMatch(mixed, /stroke="#993300"/);
  assert.match(mixed, /fill="#bbbbbb" stroke="#444444"/, "the fixed cluster picture, whatever it holds (report §5)");
  // A control's arrow is on the right edge, at 19 px from the top, 5 x 9 (the numeric terminal's).
  assert.match(mixed, /<path d="M32.5 15.5 V23.5 L36.5 19.5 Z"/);
  // View As Icon off: 32 x 16.
  assert.match(terminalOf(folded(p.g), id, true), /<svg[^>]*viewBox="0 0 32 16"/);
});

test("the cluster's wire is 3 px, the outer rows in the colour and the middle one alternating with white", () => {
  assert.deepEqual(aspecto({ cluster: [{ name: "a", type: "i32" }] }), { color: "#993300", dimension: 0, cluster: true });
  assert.equal(aspecto({ cluster: [{ name: "a", type: "i32" }, { name: "b", type: "string" }] }).color, "#ff00ff");
  assert.equal(aspecto({ cluster: [] }).color, "#993300");
  let g = Gr.nuevo();
  const made = (block, x) => {
    const created = Gr.crearEnPanel(g, CAT, block, x, 20, "Cluster", { elements: [] });
    g = created.g;
    return created.id;
  };
  const [source, sink] = [made("cluster-control", 20), made("cluster-indicator", 300)];
  const withElement = (id, tipo) => { g = Gr.fijarConfig(g, id, { elements: [{ tipo, label: { text: "N" }, x: 0, y: 0 }] }); };
  withElement(source, "control");
  withElement(sink, "indicator");
  g = { ...g, nodos: g.nodos.map((n) => ({ ...n, config: { ...n.config, type: { cluster: [{ name: "N", type: "number" }] } } })) };
  g = Gr.conectar(g, CAT, { nodo: source, puerto: "result", dir: "out" }, { nodo: sink, puerto: "value", dir: "in" }).g;
  assert.equal(g.cables.length, 1);
  const wire = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT)).match(/<g class="cable[^>]*>(.*?)<\/g>/)[1];
  assert.match(wire, /stroke="#993300" stroke-width="3"/);
  assert.match(wire, /stroke="#fff" stroke-width="1" stroke-dasharray="1 1"/, "the middle row alternates colour and white every pixel (report Q6)");
});

// ——— The menu ———

/** The open menu of the cluster shell. */
function shellMenu(p, id) {
  return ED.abrirMenuDelPanel(p, P.menuDe(p.g.nodos.find((n) => n.id === id)), id, 0, 0);
}

test("the cluster shell has its measured menu with the rows that are not built greyed", () => {
  const { p, cluster } = panelWithCluster();
  const root = "context.cluster-control";
  assert.equal(P.menuDe(cluster), root);
  const menu = shellMenu(p, cluster.id);
  const rows = menuRows(menu);
  // 15 rows and 5 separators: the 20 of the measured menu (report §4).
  assert.deepEqual(shown(rows), ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Create", "Replace", "Data Operations", "Advanced",
    "Fit Control to Pane", "Scale Object with Pane", "---", "Reorder Controls In Cluster...", "AutoSizing", "---", "Properties"]);
  assert.equal(shown(rows).length, 20);
  assert.deepEqual(rows.filter((row) => !row.greyed).map((row) => row.label), ["Visible Items", "Change to Indicator", "Make Type Def."], "only what is built is live (Reorder is greyed on an empty cluster; Make Type Def., DT-104 stage a2): the rest says why it is not");
  const labels = (id) => INV.hijos(`${root}.${id}`).map((entry) => entry.etiqueta);
  assert.deepEqual(labels("visible-items"), ["Label", "Caption"]);
  assert.deepEqual(labels("create"), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  assert.deepEqual(labels("data-operations"), ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data", "Copy Data", "Paste Data"]);
  assert.deepEqual(labels("advanced"), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "Hide Control", "Enabled State", "Show Hidden Element"]);
  assert.deepEqual(labels("autosizing"), ["None", "Size to Fit", "Arrange Horizontally", "Arrange Vertically"]);
  // AutoSizing is a later stage: greyed with its own reason.
  for (const row of ["autosizing", "autosizing.size-to-fit"]) assert.equal(INV.entrada(`${root}.${row}`).estado, "todo", row);
  assert.equal(INV.entrada(`${root}.autosizing.size-to-fit`).necesita, "autosizing-de-cluster");
  // The ticks: AutoSizing None, Caption (measured ticked) and the Label while shown.
  const marks = ED.marcados(menu, CTX);
  assert.ok(marks.has(`${root}.autosizing.none`) && marks.has(`${root}.visible-items.caption`) && marks.has(`${root}.visible-items.label`));
  assert.deepEqual(P.menuDe({ tipo: "cluster-control", config: { style: "error-in" } }), null, "an error cluster keeps no menu of its own, as before");
});

test("Visible Items Label hides the label of a cluster", () => {
  const { p, cluster } = panelWithCluster();
  const root = "context.cluster-control";
  assert.match(P.contenido(p, CTX), /data-etiqueta="n1"[^>]*>Cluster</);
  const hidden = ED.orden(shellMenu(p, cluster.id), `${root}.visible-items.label`, CTX, INV);
  assert.equal(hidden.menu, null);
  assert.equal(labelShown(hidden.g.nodos[0]), false);
  assert.doesNotMatch(P.contenido({ ...p, g: hidden.g }, CTX), /data-etiqueta="n1"/);
  assert.ok(!ED.marcados(shellMenu({ ...p, g: hidden.g }, cluster.id), CTX).has(`${root}.visible-items.label`));
  const shownAgain = ED.orden(shellMenu({ ...p, g: hidden.g }, cluster.id), `${root}.visible-items.label`, CTX, INV);
  assert.equal(labelShown(shownAgain.g.nodos[0]), true);
  // A row that is not built does nothing.
  assert.equal(ED.orden(shellMenu(p, cluster.id), `${root}.change-to-array`, CTX, INV).g, p.g);
  // It survives the file.
  assert.equal(labelShown(leer(aTexto(hidden.g, CAT), CAT).nodos[0]), false);
});

test("Change to Indicator flips the shell, every element and the terminal, and Change to Control flips them back", () => {
  let { p, cluster } = panelWithCluster();
  p = place(p, "control", { x: 300, y: 300 });
  p = place(p, "bool-control", { x: 300, y: 330 });
  p = place(p, "str-control", { x: 300, y: 270 });
  const root = "context.cluster-control";
  const sink = Gr.crearEnPanel(p.g, CAT, "cluster-indicator", 600, 300, "Out", { elements: [] });
  const wired = Gr.conectar(sink.g, CAT, { nodo: cluster.id, puerto: "result", dir: "out" }, { nodo: sink.id, puerto: "value", dir: "in" }).g;
  p = { ...p, g: wired };
  const flipped = ED.orden(shellMenu(p, cluster.id), `${root}.change-to-indicator`, CTX, INV);
  assert.equal(flipped.menu, null);
  const shell = folded(flipped.g).nodos.find((n) => n.id === cluster.id);
  assert.equal(shell.tipo, "cluster-indicator");
  // Every element becomes an indicator together with the shell, a Boolean taking an indicator's style (report §6).
  assert.deepEqual(shell.config.elements.map((e) => e.tipo), ["indicator", "bool-indicator", "str-indicator"]);
  assert.equal(shell.config.elements[1].config.style, "round-led");
  assert.deepEqual(shell.config.type, folded(p.g).nodos.find((n) => n.id === cluster.id).config.type, "the type does not change");
  // The terminal's wire keeps its node with the port renamed; now facing the wrong way, it is broken, as in LabVIEW.
  assert.deepEqual(flipped.g.cables[0].de, { nodo: cluster.id, puerto: "value" });
  const rows = menuRows(shellMenu({ ...p, g: flipped.g }, cluster.id));
  assert.ok(rows.some((row) => row.label === "Change to Control" && !row.greyed), "report §6: the row reads Change to Control");
  assert.ok(!rows.some((row) => row.label === "Change to Indicator"));
  const back = ED.orden(shellMenu({ ...p, g: flipped.g }, cluster.id), `${root}.change-to-indicator`, CTX, INV);
  const shellBack = folded(back.g).nodos.find((n) => n.id === cluster.id);
  assert.equal(shellBack.tipo, "cluster-control");
  assert.deepEqual(shellBack.config.elements.map((e) => e.tipo), ["control", "bool-control", "str-control"]);
  assert.equal(shellBack.config.elements[1].config.style, "push-button");
  assert.equal(leer(aTexto({ ...folded(flipped.g), cables: [] }, CAT), CAT).nodos.find((n) => n.id === cluster.id).config.elements[2].tipo, "str-indicator", "it survives the file");
});

test("while running, each element shows the value at its place in the cluster's list, whatever its label", () => {
  // A cluster's value is its elements' values in cluster order (DT-095 §1); two unlabelled elements, as Create ▸ Indicator
  // on a Bundle makes them, would share one value if it were looked up by label.
  const { p, cluster } = panelWithCluster();
  const elements = [
    { tipo: "str-control", label: { text: "" }, config: { value: "" }, x: 2, y: 2 },
    { tipo: "str-control", label: { text: "" }, config: { value: "" }, x: 2, y: 40 },
  ];
  const withElements = { ...p, g: setClusterElements(p.g, CAT, cluster.id, elements) };
  const html = P.contenido({ ...withElements, valores: { [cluster.id]: ["first run value", "second run value"] } }, CTX);
  assert.match(html, /first run value/);
  assert.match(html, /second run value/);
});
