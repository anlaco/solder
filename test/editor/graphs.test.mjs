// The Waveform Chart, the Waveform Graph and the XY Graph on the Front Panel
// (labview-captures/graphs/REPORT.md): their palette, how they are placed, drawn
// and wired, what a chart keeps, their menus and their settings. No browser
// needed: everything is pure functions over the panel state.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as PC from "../../editor/src/front-panel/panel-clipboard.mjs";
import * as CH from "../../editor/src/front-panel/chart-history-dialog.mjs";
import * as GM from "../../editor/src/front-panel/graph-menus.mjs";
import * as GS from "../../editor/src/front-panel/graph-state.mjs";
import { GRAPH_MEASURES, graphSvg, tickLabel } from "../../editor/src/front-panel/graph-view.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { abrirSubpaleta, clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { celdasSubpaleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV, leer as leerJson } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const AQUI = { x: 10, y: 20 };

const A = (element, dims) => (dims ? { array: element, dims } : { array: element });
const C = (...types) => ({ cluster: types.map((type, i) => ({ name: `f${i}`, type })) });

/** Takes an object from the palette, moves it to `pt` and clicks, as the editor does. */
function place(p, block, pt) {
  p = P.coger(p, block);
  p = P.moverA(p, CTX, pt);
  return P.confirmar(P.pulsar(p, CTX, FONDO, pt));
}

/** The three graphs, placed at three points of the panel. */
function threeGraphs() {
  let p = place(P.inicial(), "waveform-chart", { x: 300, y: 200 });
  p = place(p, "waveform-graph", { x: 900, y: 200 });
  p = place(p, "xy-graph", { x: 300, y: 600 });
  const [chart, graph, xy] = p.g.nodos;
  return { p, chart, graph, xy };
}

/** A panel with a graph wired to a constant of type `type`, and the wire not broken. */
function wiredGraph(block, constBlock, config) {
  let p = place(P.inicial(), block, { x: 300, y: 200 });
  const graph = p.g.nodos[0];
  const made = Gr.crearNodo(p.g, CAT, constBlock, 40, 40);
  const g = Gr.conectar(config ? Gr.fijarConfig(made.g, made.id, config) : made.g, CAT, { nodo: made.id, puerto: "result", dir: "out" }, { nodo: graph.id, puerto: "value", dir: "in" }).g;
  p = { ...p, g };
  return { p, graph, source: made.id };
}

const texts = (svg) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
/** The tick labels of an axis, in order (`axis`: "x" or "y"). */
const labels = (svg, axis) => [...svg.matchAll(new RegExp(`<text class="sd-tick-text sd-tick-${axis}"[^>]*>([^<]*)</text>`, "g"))].map((m) => m[1]);

/** The measured colors live in the Old School panel style (DT-058): the declarations of one of its rules. */
const OLD_SCHOOL_CSS = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8");
const oldSchoolRule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return OLD_SCHOOL_CSS.match(new RegExp(`(?:^|\\n|,\\s*)\\.sd-panel ${escaped}(?:,[^{]*)?\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

// ——— The palette ———

test("Controls Modern Graph opens the 4 x 4 grid with the three graphs built and the rest greyed out", () => {
  const id = "palette.controls.modern.graph";
  const abierta = clic({ ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) }, INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null, "a folder with contents opens, it is not explained");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 4);
  // 01-palette-graph-grid.png: row 4 is the folder Controls, a free cell, 3D Picture and 3D Graph.
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), [
    [0, 0, "Waveform Chart"], [0, 1, "Waveform Graph"], [0, 2, "XY Graph"], [0, 3, "Express XY Graph"],
    [1, 0, "Intensity Chart"], [1, 1, "Intensity Graph"], [1, 2, "Digital Waveform Graph"], [1, 3, "Mixed Signal Graph"],
    [2, 0, "Compass Plot"], [2, 1, "Error Bar Plot"], [2, 2, "Feather Plot"], [2, 3, "XY Plot Matrix"],
    [3, 0, "Controls"], [3, 2, "3D Picture"], [3, 3, "3D Graph"],
  ]);
  const html = subpaletas(INV, abierta.paleta);
  for (const built of ["waveform-chart", "waveform-graph", "xy-graph"]) {
    assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.${built}"`), `${built} is built`);
    assert.ok(G.CONTROLES[built], `${built} has its icon`);
  }
  for (const hole of ["express-xy-graph", "intensity-chart", "mixed-signal-graph", "feather-plot", "3d-picture", "3d-graph"]) {
    assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.${hole}"`), `${hole} is a hole`);
    assert.match(INV.explicacion(INV.entrada(`${id}.${hole}`)).solder, /Missing/, `${hole} says what it needs`);
  }
  assert.match(html, new RegExp(`class="carpeta[^"]*" data-id="${id}\\.controls"`), "Controls is a folder");
  assert.equal(clic(abierta, INV, `${id}.waveform-chart`, AQUI, 1).abierta, null, "a built one is not explained: it is picked");
  assert.match(clic(abierta, INV, `${id}.intensity-chart`, AQUI, 1).abierta.id, /intensity-chart/, "a hole is explained");

  // 02-palette-graph-subfolder-controls.png: the folder Controls holds 4 + 3 elements, the last one the folder Datatypes.
  const folder = `${id}.controls`;
  const inside = abrirSubpaleta(abierta, INV, folder, 1, AQUI);
  assert.equal(inside.paleta.cascada.at(-1).id, folder);
  const cells = celdasSubpaleta(INV, folder);
  assert.deepEqual(cells.sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), [
    [0, 0, "Polar Plot Indicator"], [0, 1, "Smith Plot Indicator"], [0, 2, "Min-Max Plot Indicator"], [0, 3, "Distribution Plot Indicator"],
    [1, 0, "Radar Plot Indicator"], [1, 1, "2D Picture"], [1, 2, "Datatypes"],
  ]);
});

// ——— Placing ———

test("a Waveform Chart, a Waveform Graph and an XY Graph are placed on the panel with their terminal on the diagram", () => {
  const { p, chart, graph, xy } = threeGraphs();
  assert.deepEqual([chart.tipo, graph.tipo, xy.tipo], ["waveform-chart", "waveform-graph", "xy-graph"]);
  assert.deepEqual([chart.label.text, graph.label.text, xy.label.text], ["Waveform Chart", "Waveform Graph", "XY Graph"], "the labels of 03-three-fresh-panel.png");
  assert.ok([chart, graph, xy].every((n) => n.panel), "each has its place on the panel");

  // Sizes: 328 × 218, 328 × 218 and 342 × 300 (REPORT §2); hanging from the pointer by their centre.
  assert.deepEqual(["waveform-chart", "waveform-graph", "xy-graph"].map((t) => [P.cajaObjeto(t, 0, 0).ancho, P.cajaObjeto(t, 0, 0).alto]), [[328, 218], [328, 218], [342, 300]]);
  assert.deepEqual([chart.panel.x, chart.panel.y], [300 - 164, 200 - 109]);

  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="objeto-panel sd-indicator sd-(?:waveform-chart|waveform-graph|xy-graph)"/g) ?? []).length, 3);
  assert.match(html, /data-grafico="xy-graph"[^>]*width:342px;height:300px/);
  assert.match(html, />XY Graph</, "its label above");

  // The label goes above the top left of the frame, 3 px over it and 8 px in; the legend is 3 px over it too.
  const box = P.cajaEtiqueta(chart, CTX.medir);
  assert.deepEqual([box.dx, box.dy + box.alto], [8, -3]);

  // On the diagram: three terminals of 38 × 38 that take the wire in (indicators).
  const resolved = Gr.tipos(p.g, CAT);
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, resolved);
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 3);
  for (const node of [chart, graph, xy]) {
    const k = D.caja(node, CTX);
    assert.deepEqual([k.ancho, k.alto], [38, 38]);
    assert.equal(D.extremos(p.g, CTX).get(`${node.id}.value`).dir, "in");
  }
  // Placing them does not break the VI, and an unwired indicator keeps its value.
  assert.ok(Gr.ejecutable(p.g, CAT, resolved));
});

test("the terminal of a graph is orange with DBL, or brown with the cluster tag when a cluster is wired", () => {
  const dbl = G.graphTerminal("waveform-chart", false, false);
  assert.match(dbl, /viewBox="0 0 38 38"/);
  assert.match(dbl, /stroke="#ff7f00"/);
  assert.match(dbl, />DBL</);
  const cluster = G.graphTerminal("waveform-chart", true, false);
  assert.match(cluster, new RegExp(`stroke="${G.GRAPH_CLUSTER_COLOR}"`));
  assert.doesNotMatch(cluster, />DBL</, "the tag is the cluster's");
  assert.match(G.graphTerminal("xy-graph", true, false), /#cc9966/, "the XY Graph's drawing has its tan grid");
  assert.match(G.graphTerminal("waveform-graph", false, true), /viewBox="0 0 32 16"/, "the compact view, unverified: the box of every terminal");

  // In the diagram: DBL by default, brown once a cluster is wired, and brown always on the XY Graph.
  const view = (g) => D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
  const { p, graph } = wiredGraph("waveform-chart", "const", { value: 1 });
  assert.match(view(p.g), />DBL</);
  const bundle = wiredGraph("waveform-chart", "bundle", { type: C("number", "number") });
  assert.equal(Gr.tipos(bundle.p.g, CAT).cables.get(bundle.p.g.cables[0].id).roto, null, "a cluster of two numbers is accepted");
  assert.match(view(bundle.p.g), new RegExp(G.GRAPH_CLUSTER_COLOR));
  const xy = place(P.inicial(), "xy-graph", { x: 300, y: 300 });
  assert.match(view(xy.g), new RegExp(G.GRAPH_CLUSTER_COLOR));
  // View As Icon off: the compact box.
  const compact = Gr.alternarIcono(p.g, graph.id);
  assert.deepEqual([D.caja(compact.nodos[0], CTX).ancho, D.caja(compact.nodos[0], CTX).alto], [32, 16]);
});

test("a wire the graph does not accept is broken and the graph draws nothing", () => {
  const broken = wiredGraph("waveform-chart", "bundle", { type: C(A("number"), A("number")) });
  const [wire] = broken.p.g.cables;
  assert.match(Gr.tipos(broken.p.g, CAT).cables.get(wire.id).roto, /does not accept/, "a cluster of arrays breaks the chart's wire (73)");
  assert.equal(GS.wireTypeOf(broken.p.g, Gr.tipos(broken.p.g, CAT), broken.graph.id), undefined);
  assert.ok(!Gr.ejecutable(broken.p.g, CAT, Gr.tipos(broken.p.g, CAT)), "the arrow of Run is broken");
  assert.doesNotMatch(P.contenido(broken.p, CTX), /<path d="M/, "no plot");
  const ok = wiredGraph("waveform-graph", "arr-const", { type: A("number"), value: [1, 2] });
  assert.deepEqual(GS.wireTypeOf(ok.p.g, Gr.tipos(ok.p.g, CAT), ok.graph.id), A("number"));
});

// ——— Drawing ———

test("the graphs are drawn at the measured sizes with their axes, legend and grid", () => {
  const { chart, graph, xy } = threeGraphs();
  const draw = (node, data = {}) => graphSvg(node, { separator: ",", ...data });
  const [svgChart, svgGraph, svgXY] = [chart, graph, xy].map((node) => draw(node));

  assert.deepEqual(["waveform-chart", "waveform-graph", "xy-graph"].map((t) => Object.values(GRAPH_MEASURES[t].plot)), [[72, 10, 232, 166], [72, 10, 232, 166], [70, 10, 248, 248]]);
  assert.match(svgChart, /<svg class="sd-graph-art" width="328" height="218"/);
  assert.match(svgXY, /<svg class="sd-graph-art" width="342" height="300"/);
  // The black plot area with its borders: dark on the top and left, light on the bottom and right.
  assert.match(svgChart, /<rect class="sd-plot" x="72" y="10" width="232" height="166"\/>/);
  assert.match(svgChart, /<g class="sd-plot-frame-dark"><rect class="sd-plot-frame-line" x="71" y="9" width="233" height="1"\/>/);
  assert.match(svgChart, /<g class="sd-plot-frame-light"><rect class="sd-plot-frame-line" x="71" y="176" width="233" height="1"\/>/);
  assert.match(oldSchoolRule(".sd-graph-art .sd-plot"), /fill: #000000/);
  assert.match(oldSchoolRule(".sd-plot-frame-dark"), /fill: #595959/);
  assert.match(oldSchoolRule(".sd-plot-frame-light"), /fill: #d9d9d9/);

  // Names and tick labels of 03: the chart's X shows only both ends; the graph's, every 20; the XY Graph's, every unit.
  assert.deepEqual(labels(svgChart, "y"), ["-10", "-5", "0", "5", "10"]);
  assert.deepEqual(labels(svgChart, "x"), ["0", "100"], "the chart's X shows only both ends");
  assert.deepEqual(labels(svgGraph, "x"), ["0", "20", "40", "60", "80", "100"]);
  assert.deepEqual(labels(svgXY, "x"), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  assert.deepEqual(labels(svgXY, "y"), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  for (const svg of [svgChart, svgGraph, svgXY]) assert.deepEqual(texts(svg).slice(-3), ["Time", "Amplitude", "Plot 0"], "named Time and Amplitude, with the legend (03)");
  // Y ticks are 5 px long 7 px before the plot, X ticks 3 px under it.
  assert.match(svgChart, /<rect class="sd-tick" x="65" y="10" width="5" height="1"\/>/);
  assert.match(svgChart, /<rect class="sd-tick" x="72" y="178" width="1" height="5"\/>/);
  assert.match(oldSchoolRule(".sd-graph-art .sd-tick"), /fill: #000000/);

  // The grid: none on the chart; the graph's minor #003300 and major #006600; the XY Graph's #4c4c00 and #999900.
  assert.doesNotMatch(svgChart, /sd-grid-line/);
  for (const svg of [svgGraph, svgXY]) assert.match(svg, /sd-grid-minor[\s\S]*sd-grid-major/);
  assert.match(oldSchoolRule(".sd-waveform-graph .sd-grid-minor"), /stroke: #003300/);
  assert.match(oldSchoolRule(".sd-waveform-graph .sd-grid-major"), /stroke: #006600/);
  assert.match(oldSchoolRule(".sd-xy-graph .sd-grid-minor"), /stroke: #4c4c00/);
  assert.match(oldSchoolRule(".sd-xy-graph .sd-grid-major"), /stroke: #999900/);
  // 8 subdivisions per step of 20 on X: 5 steps give 7 minor and 1 major lines each, 4 × 5 + … (7 · 5 + 4 major, no line at the ends).
  const gridPath = (svg, weight) => svg.match(new RegExp(`<path class="sd-grid-line sd-grid-${weight}" d="([^"]*)"`))[1];
  assert.equal((gridPath(svgGraph, "major").match(/v166/g) ?? []).length, 4, "four major vertical lines inside the plot");
  assert.equal((gridPath(svgGraph, "minor").match(/v166/g) ?? []).length, 35, "seven minor lines in each of the five steps");
  // The first minor line of the graph's X falls 6 px in, as in 03 (x = 892 over a plot that starts at 886).
  assert.match(gridPath(svgGraph, "minor"), /^M78\.5 10v166/);

  // The legend: 100 × 22, right-aligned and 3 px above the frame, with "Plot 0" and its swatch of 28 × 18.
  assert.match(svgChart, /class="sd-legend" data-parte="legend" transform="translate\(228 -25\)"/);
  assert.match(svgChart, /data-parte="plot-swatch" transform="translate\(57 2\)"/);
  assert.match(svgChart, /<rect class="sd-swatch-dark" x="0" y="0" width="28" height="18"\/>/);
  assert.match(oldSchoolRule(".sd-swatch-dark"), /fill: #595959/);
  // The frame: its bevel on the left and its dark bar on the right, 13 columns each.
  assert.match(svgChart, /<g class="sd-frame-left"><rect class="sd-frame-line" x="0" y="0" width="1" height="218"\/>/);
  assert.match(svgChart, /<rect class="sd-frame-line" x="327" y="0" width="1" height="218"\/><\/g><g class="sd-frame-top">/);
  assert.match(oldSchoolRule(".sd-frame-left .sd-frame-line:nth-child(1)"), /fill: #bbbbbb/);
  assert.match(oldSchoolRule(".sd-frame-right .sd-frame-line:nth-child(13)"), /fill: #404040/);
});

test("the tick labels use the decimal separator of the system and the shortest form", () => {
  assert.deepEqual([-1, -0.5, 0, 0.2, 1, 140].map((v) => tickLabel(v, ",")), ["-1", "-0,5", "0", "0,2", "1", "140"]);
  assert.equal(tickLabel(0.30000000000000004, "."), "0.3");
  const { graph } = threeGraphs();
  const svg = graphSvg(graph, { type: A("number"), value: [-1, 1, -1], separator: "," });
  assert.ok(texts(svg).includes("-0,5") && texts(svg).includes("0,5"), "-1..1 is labelled every 0,5 (80-graph-1d-sine-128.png)");
  assert.ok(!graphSvg(graph, { type: A("number"), value: [-1, 1], separator: "." }).includes("0,5"));
});

test("a graph draws its plots as 1 px polylines in white and red, clipped to the plot area", () => {
  const { graph, xy } = threeGraphs();
  const wave = graphSvg(graph, { type: A("number"), value: [0, 1, 0, 1], separator: "," });
  assert.match(wave, /<svg class="sd-traces" x="72" y="10" width="232" height="166"><path class="sd-trace" data-plot="0" d="M0\.5 165\.5L[^"]*"\/>/);
  assert.match(oldSchoolRule(".sd-graph-art"), /shape-rendering: crispEdges/, "no antialiasing");
  assert.match(oldSchoolRule(".sd-graph-art .sd-trace"), /stroke: #ffffff; stroke-width: 1;/);
  const rows = graphSvg(graph, { type: A("number", 2), value: [[0, 1], [1, 0]], separator: "," });
  assert.match(rows, /data-plot="0" d="[^"]+"\/><path class="sd-trace" data-plot="1" d="[^"]+"\/>/, "one path per row");
  assert.match(oldSchoolRule(".sd-graph-art .sd-traces .sd-trace:nth-child(2n)"), /stroke: #ff4242/, "row 0 white, row 1 #ff4242 (82)");
  // 80: 128 points autoscale to 0..140 every 20 on X.
  const long = graphSvg(graph, { type: A("number"), value: Array.from({ length: 128 }, (_, i) => Math.sin(i / 20)), separator: "," });
  assert.deepEqual(labels(long, "x"), ["0", "20", "40", "60", "80", "100", "120", "140"]);
  // 87: a bundle of x0 = 10, dx = 2 and an array starts at X = 10: the axis goes 0..300 every 50.
  const timed = C("number", "number", A("number"));
  const clustered = graphSvg(graph, { type: timed, value: { f0: 10, f1: 2, f2: Array.from({ length: 128 }, (_, i) => i / 128) }, separator: "," });
  assert.deepEqual(labels(clustered, "x"), ["0", "50", "100", "150", "200", "250", "300"]);
  // 85: both axes of the XY Graph go -1..1; Y every 0,2 and X, wider, every 0,5.
  const pair = C(A("number"), A("number"));
  const xySvg = graphSvg(xy, { type: pair, value: { f0: [-1, 0, 1], f1: [1, 0, -1] }, separator: "," });
  assert.deepEqual(labels(xySvg, "y"), ["-1", "-0,8", "-0,6", "-0,4", "-0,2", "0", "0,2", "0,4", "0,6", "0,8", "1"], "Y every 0,2");
  assert.deepEqual(labels(xySvg, "x"), ["-1", "-0,5", "0", "0,5", "1"], "X, whose labels are wider, every 0,5 (89)");
  // Outside the plot area nothing is drawn: a point far away stays inside the clipping svg.
  assert.match(graphSvg(graph, { type: A("number"), value: [0, 1e300, 0], separator: "," }), /<svg class="sd-traces"/);
});

// ——— What a chart keeps ———

test("a chart appends each write, keeps its history across Runs and is cleared by rewiring", () => {
  const { p, graph } = wiredGraph("waveform-chart", "const", { value: 1 });
  const resolved = Gr.tipos(p.g, CAT);
  const type = GS.wireTypeOf(p.g, resolved, graph.id);
  assert.equal(type, "number");
  let charts = GS.appendedToChart({}, graph.id, [0.1, 0.5, 0.3], type, 1024);
  const drawn = (c) => graphSvg(graph, { type, charts: c, separator: "," });
  assert.match(drawn(charts), /<path class="sd-trace" data-plot="0" d="M0\.5 [\d.]+L[\d. ]+L[\d. ]+"\/>/, "three points, one polyline");
  // A second Run goes on from where the first one left (71): the history is the window's, not the Run's.
  charts = GS.appendedToChart(charts, graph.id, [0.9], type, 1024);
  assert.equal(charts[graph.id].history.appended, 4);
  assert.equal(GS.reconciledCharts(charts, p.g, resolved), charts, "with the same wire it is the same history");
  // X is the Strip window: 0..100 and, after 130 points, 30..130 (70).
  charts = GS.appendedToChart(charts, graph.id, Array.from({ length: 126 }, (_, i) => i / 126), type, 1024);
  assert.deepEqual(labels(drawn(charts), "x"), ["29", "129"], "130 points: the last 100 (0..100 → 5..105 in 70)");
  // Rewiring to another type clears it (71: "rewiring its terminal clears it").
  const rewired = wiredGraph("waveform-chart", "arr-const", { type: A("number"), value: [] });
  assert.deepEqual(GS.reconciledCharts({ [rewired.graph.id]: charts[graph.id] }, rewired.p.g, Gr.tipos(rewired.p.g, CAT)), {}, "its type changed");
  // A deleted chart loses its history too.
  assert.deepEqual(GS.reconciledCharts(charts, Gr.borrar(p.g, [graph.id]), Gr.tipos(Gr.borrar(p.g, [graph.id]), CAT)), {});
  // Arrays go in at once (72) and clusters make one plot per field (74).
  const array = GS.appendedToChart({}, "n1", [[1, 2, 3], [4]], A("number"), 1024);
  assert.deepEqual(array.n1.history.plots, [[1, 2, 3, 4]]);
  const pair = GS.appendedToChart({}, "n1", [{ f0: 1, f1: 2 }], C("number", "number"), 1024);
  assert.deepEqual(pair.n1.history.plots, [[1], [2]]);
});

test("Clear Chart and Clear Graph empty what the object shows", () => {
  const { p, graph } = wiredGraph("waveform-chart", "const", { value: 1 });
  const charts = GS.appendedToChart({}, graph.id, [1, 2, 3], "number", 1024);
  const open = ED.abrirMenu({ ...p, charts }, "context.waveform-chart", graph.id, 100, 100);
  const cleared = ED.orden(open, "context.waveform-chart.data-operations.clear-chart", CTX);
  assert.deepEqual(cleared.charts, {}, "75: it is emptied");
  assert.equal(cleared.menu, null);
  // The graph keeps no history: its last value goes.
  const { p: q, graph: waveform } = wiredGraph("waveform-graph", "arr-const", { type: A("number"), value: [1] });
  const withValue = { ...q, valores: { [waveform.id]: [1, 2, 3] } };
  const done = ED.orden(ED.abrirMenu(withValue, "context.waveform-graph", waveform.id, 0, 0), "context.waveform-graph.data-operations.clear-graph", CTX);
  assert.deepEqual(done.valores, {});
  // The rows that are not done say why and do nothing.
  assert.equal(ED.orden(open, "context.waveform-chart.data-operations.copy-data", CTX), open);
  assert.ok(esHueco(INV.resolver("context.waveform-chart.data-operations.copy-data")));
});

// ——— Settings ———

test("AutoScale X and AutoScale Y switch autoscale off and keep the last range", () => {
  const { p, graph } = wiredGraph("waveform-graph", "arr-const", { type: A("number"), value: [] });
  const value = Array.from({ length: 128 }, (_, i) => Math.sin(i / 20));
  const withData = { ...p, valores: { [graph.id]: value } };
  const root = "context.waveform-graph";
  const settingsOf = (d) => GS.graphSettings(d.g.nodos.find((n) => n.id === graph.id));
  assert.deepEqual([settingsOf(withData).autoscaleX, settingsOf(withData).autoscaleY], [true, true], "the graph autoscales both axes (REPORT §3)");
  const off = ED.orden(ED.abrirMenu(withData, root, graph.id, 0, 0), `${root}.x-scale.autoscale-x`, CTX);
  assert.equal(settingsOf(off).autoscaleX, false);
  assert.deepEqual(settingsOf(off).scaleX, { min: 0, max: 140, step: 20 }, "it keeps 0..140 every 20");
  // New, bigger data: the axis does not move; Y still autoscales.
  const bigger = graphSvg(off.g.nodos[0], { type: A("number"), value: [0, 5000, 0], separator: ",", charts: {} });
  assert.deepEqual(labels(bigger, "x"), ["0", "20", "40", "60", "80", "100", "120", "140"], "X stays at 0..140");
  assert.ok(labels(bigger, "y").some((t) => Number(t) >= 5000), "while Y follows the data");
  // The row is checked while it is on, and Loose Fit is greyed while it is off.
  const reopened = ED.abrirMenu(off, root, graph.id, 0, 0);
  const xScaleMenu = D.menuContextual(INV, { ...reopened.menu, abierto: `${root}.x-scale` }, ED.marcados(reopened), undefined, ED.variantes(reopened, CTX));
  assert.match(xScaleMenu, /item-menu desactivado" data-id="context.waveform-graph.x-scale.loose-fit"/);
  assert.ok(!ED.marcados(reopened).has(`${root}.x-scale.autoscale-x`));
  assert.ok(ED.marcados(reopened).has(`${root}.y-scale.autoscale-y`));
  // Loose Fit does nothing while its axis does not autoscale; switching AutoScale back on turns it on again.
  assert.equal(ED.orden(reopened, `${root}.x-scale.loose-fit`, CTX), reopened);
  const on = ED.orden(ED.abrirMenu(off, root, graph.id, 0, 0), `${root}.x-scale.autoscale-x`, CTX);
  assert.equal(settingsOf(on).autoscaleX, true);
  const noLoose = ED.orden(ED.abrirMenu(on, root, graph.id, 0, 0), `${root}.x-scale.loose-fit`, CTX);
  assert.equal(settingsOf(noLoose).looseFitX, false);

  // A chart: Y autoscales and X is the Strip window; switching X on fits the whole history (unverified).
  const chart = wiredGraph("waveform-chart", "const", { value: 1 });
  const chartSettings = GS.graphSettings(chart.graph);
  assert.deepEqual([chartSettings.autoscaleX, chartSettings.autoscaleY, chartSettings.looseFitY], [false, true, true]);
});

test("Visible Items hides and shows the label, the legend and the scales", () => {
  const { p, chart } = threeGraphs();
  const root = "context.waveform-chart";
  const hide = (d, row) => ED.orden(ED.abrirMenu(d, root, chart.id, 0, 0), `${root}.${row}`, CTX);
  const marks = (d) => ED.marcados(ED.abrirMenu(d, root, chart.id, 0, 0));
  for (const item of ["label", "plot-legend", "x-scale", "y-scale"]) assert.ok(marks(p).has(`${root}.visible-items.${item}`), `${item} is checked (11)`);
  assert.ok(marks(p).has(`${root}.x-scale.visible-scale-label`) && marks(p).has(`${root}.y-scale.visible-scale-label`));

  const noLabel = hide(p, "visible-items.label");
  assert.ok(!marks(noLabel).has(`${root}.visible-items.label`));
  const labelOf = new RegExp(`data-etiqueta="${chart.id}"`);
  assert.match(P.contenido(p, CTX), labelOf);
  assert.doesNotMatch(P.contenido(noLabel, CTX), labelOf, "no label on the panel");
  assert.match(D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT)), labelOf);
  assert.doesNotMatch(D.contenido({ ...ED.inicial(), g: noLabel.g }, CTX, Gr.tipos(noLabel.g, CAT)), labelOf, "nor on the diagram");
  assert.match(P.contenido(hide(noLabel, "visible-items.label"), CTX), labelOf, "and it comes back");

  const node = (d) => d.g.nodos.find((n) => n.id === chart.id);
  const svg = (d) => graphSvg(node(d), { separator: "," });
  assert.doesNotMatch(svg(hide(p, "visible-items.plot-legend")), /Plot 0/);
  const noX = svg(hide(p, "visible-items.x-scale"));
  assert.ok(!texts(noX).includes("Time") && labels(noX, "x").length === 0, "X Scale hides the axis and its name");
  assert.ok(texts(noX).includes("Amplitude"));
  const noYName = svg(hide(p, "y-scale.visible-scale-label"));
  assert.ok(!texts(noYName).includes("Amplitude") && labels(noYName, "y").includes("10"), "Visible Scale Label hides only the name");
  // The rows that are not done are holes.
  for (const row of ["visible-items.caption", "visible-items.scale-legend", "visible-items.graph-palette", "visible-items.unit-label"]) assert.ok(esHueco(INV.entrada(`${root}.${row}`)), row);
});

test("Chart History Length sets the history from its dialog", () => {
  const { p, chart } = threeGraphs();
  const root = "context.waveform-chart";
  const opened = ED.orden(ED.abrirMenu(p, root, chart.id, 0, 0), `${root}.chart-history-length`, CTX);
  assert.equal(opened.menu, null);
  assert.deepEqual(opened.graphDialog, { tipo: "history-length", nodo: chart.id, texto: "1024", todo: true }, "50: 1024 by default, selected");
  const html = CH.view(INV, opened.graphDialog);
  assert.match(html, /Chart History Length/);
  assert.match(html, /Number of data points in chart history buffer/);
  assert.match(html, /<span class="texto-elegido">1024<\/span>/);
  for (const key of ["ok", "cancel", "help"]) assert.match(html, new RegExp(`data-id="dialog\\.chart-history-length\\.${key}"`));
  assert.match(html, /pv-boton hueco" data-id="dialog\.chart-history-length\.help"/, "Help says why it is not done");

  let dialog = opened.graphDialog;
  for (const key of ["5", "0", "x", "-"]) dialog = CH.type(dialog, key);
  assert.equal(dialog.texto, "50", "the first digit replaces the selection; what is not a digit is ignored");
  assert.equal(CH.length(dialog), 50);
  const done = CH.apply(p.g, dialog);
  assert.equal(done.nodos[0].config.historyLength, 50);
  assert.equal(CH.length(CH.type(CH.type(dialog, "Backspace"), "Backspace")), undefined, "an empty field is not a length");
  assert.equal(CH.apply(p.g, CH.type(CH.type(dialog, "Backspace"), "Backspace")), p.g, "and leaves the VI as it was");
  assert.equal(CH.apply(done, { ...dialog, texto: "1024" }).nodos[0].config.historyLength, undefined, "the default is not stored");

  // The chart keeps as many points as the length says.
  const charts = GS.appendedToChart({}, chart.id, Array.from({ length: 150 }, (_, i) => i), "number", 50);
  assert.equal(charts[chart.id].history.plots[0].length, 50);
  const shown = graphSvg(done.nodos[0], { type: "number", charts, separator: "," });
  assert.deepEqual(labels(shown, "x"), ["49", "149"], "X is still the last 100 indexes");
  assert.equal((shown.match(/L/g) ?? []).length, 49, "but only the last 50 points are there");
});

// ——— Menus ———

const rows = (root) => INV.hijos(root).map((e) => `${e.etiqueta}${e.separado ? " |" : ""}`);

test("the menus of the graphs have LabVIEW's rows in their order", () => {
  const common = ["Visible Items", "Find Terminal", "Change to Control", "Make Type Def. |", "Description and Tip... |", "Create |", "Replace", "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane"];
  assert.deepEqual(rows("context.waveform-chart"), [...common, "X Scale |", "Y Scale", "Transpose Array", "Autosize Plot Legend", "Stack Plots", "Chart History Length...", "Export |", "Properties |"]);
  assert.deepEqual(rows("context.waveform-graph"), [...common, "X Scale |", "Y Scale", "Transpose Array", "Autosize Plot Legend", "Export |", "Properties |"]);
  assert.deepEqual(rows("context.xy-graph"), [...common, "Optional Plane |", "X Scale |", "Y Scale", "Autosize Plot Legend", "Export |", "Properties |"]);
  assert.deepEqual(rows("context.waveform-chart.visible-items"), ["Label", "Caption", "Plot Legend |", "Scale Legend", "Graph Palette", "Digital Display", "X Scrollbar", "X Scale |", "Y Scale", "Unit Label"]);
  assert.deepEqual(rows("context.waveform-graph.visible-items"), ["Label", "Caption", "Plot Legend |", "Scale Legend", "Graph Palette", "Cursor Legend", "Digital Display", "X Scrollbar", "X Scale |", "Y Scale", "Unit Label"]);
  assert.deepEqual(rows("context.waveform-chart.data-operations"), ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data |", "Copy Data", "Paste Data", "Clear Chart |"]);
  assert.deepEqual(rows("context.waveform-graph.data-operations"), ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data |", "Copy Data", "Paste Data", "Clear Graph |", "Create Annotation", "Delete All Annotations"]);
  assert.deepEqual(rows("context.waveform-chart.advanced"), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "Hide Indicator |", "Enabled State", "Update Mode |", "Auto Adjust Scales", "Cursors Scroll Graph", "Disable Plot Legend |", "Reset Scale Layout"]);
  assert.deepEqual(rows("context.waveform-graph.advanced"), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "Hide Indicator |", "Enabled State", "Smooth Updates |", "Auto Adjust Scales", "Cursors Scroll Graph", "Disable Plot Legend |", "Reset Scale Layout"]);
  for (const axis of ["x-scale", "y-scale"]) assert.deepEqual(rows(`context.waveform-chart.${axis}`), ["Marker Spacing", "Add Marker", "Delete Marker", "Formatting... |", "Style", "Mapping", "Properties |", `AutoScale ${axis[0].toUpperCase()}`, "Loose Fit", "Visible Scale Label"]);
  assert.deepEqual(rows("context.xy-graph.optional-plane"), ["None", "Nyquist", "Nichols", "S Plane", "Z Plane"]);
  assert.deepEqual(rows("context.waveform-chart.create"), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  assert.deepEqual(rows("context.waveform-chart.export"), ["Export Data To Clipboard", "Export Data To Excel", "Export Data To DIAdem", "Export Simplified Image..."]);

  // On the panel the right-click opens the menu of the object, with its checks (10..15).
  const { p, chart, graph, xy } = threeGraphs();
  assert.deepEqual([chart, graph, xy].map((n) => P.menuDe(n)), ["context.waveform-chart", "context.waveform-graph", "context.xy-graph"]);
  const open = ED.abrirMenu(p, P.menuDe(chart), chart.id, 200, 150);
  const html = D.menuContextual(INV, open.menu, ED.marcados(open), undefined, ED.variantes(open, CTX));
  assert.match(html, /item-menu hueco marcado" data-id="context.waveform-chart.autosize-plot-legend"/);
  assert.match(html, /item-menu" data-id="context.waveform-chart.chart-history-length"/, "Chart History Length... is built");
  assert.match(html, /item-menu hueco" data-id="context.waveform-chart.find-terminal"/);
  assert.match(html, /<span class="flecha-menu"/, "its submenus have an arrow");
  // The checks of the scales: the chart's X does not autoscale, its Y does, with Loose Fit (14, 15).
  const marks = ED.marcados(ED.abrirMenu(p, "context.waveform-chart", chart.id, 0, 0));
  assert.ok(!marks.has("context.waveform-chart.x-scale.autoscale-x") && marks.has("context.waveform-chart.y-scale.autoscale-y") && marks.has("context.waveform-chart.y-scale.loose-fit"));
  assert.ok(ED.variantes(ED.abrirMenu(p, "context.waveform-chart", chart.id, 0, 0), CTX).desactivados.has("context.waveform-chart.x-scale.loose-fit"), "Loose Fit is greyed on the chart's X (14)");
  assert.ok(ED.marcados(ED.abrirMenu(p, "context.xy-graph", xy.id, 0, 0)).has("context.xy-graph.optional-plane.none"));
});

test("the Run mode menu of a chart and of a graph works while the VI runs", () => {
  assert.deepEqual(rows("context.run-chart"), ["Copy Data", "Description and Tip... |", "Visible Items", "Clear Chart |", "AutoScale X |", "AutoScale Y", "Update Mode", "Autosize Plot Legend", "Export |"]);
  assert.deepEqual(rows("context.run-graph"), ["Copy Data", "Description and Tip... |", "Visible Items", "Clear Graph |", "Create Annotation", "Delete All Annotations", "AutoScale X |", "AutoScale Y", "Smooth Updates", "Autosize Plot Legend", "Export |"]);
  const { p, chart, graph } = threeGraphs();
  assert.deepEqual([chart, graph].map(GM.runMenuRoot), ["context.run-chart", "context.run-graph"]);
  const chartMenu = ED.abrirMenu(p, "context.run-chart", chart.id, 300, 300);
  // 89: the chart does not autoscale X, does Y, and its legend is autosized; 88: the graph does both and smooths.
  assert.deepEqual([...ED.marcados(chartMenu)].filter((id) => /autoscale|autosize|visible-items/.test(id)).sort(), ["context.run-chart.autosize-plot-legend", "context.run-chart.autoscale-y", "context.run-chart.visible-items.label", "context.run-chart.visible-items.plot-legend", "context.run-chart.visible-items.x-scale", "context.run-chart.visible-items.y-scale"].sort());
  const graphMenu = ED.abrirMenu(p, "context.run-graph", graph.id, 300, 300);
  assert.ok(ED.marcados(graphMenu).has("context.run-graph.autoscale-x") && ED.marcados(graphMenu).has("context.run-graph.smooth-updates"));
  // Clear Chart and the AutoScale rows work in Run mode too.
  const charts = GS.appendedToChart({}, chart.id, [1, 2], "number", 1024);
  assert.deepEqual(ED.orden({ ...chartMenu, charts }, "context.run-chart.clear-chart", CTX).charts, {});
  const toggled = ED.orden(chartMenu, "context.run-chart.autoscale-y", CTX);
  assert.equal(toggled.g.nodos[0].config.autoscaleY, false);
  assert.equal(ED.orden(chartMenu, "context.run-chart.autoscale-x", CTX).g.nodos[0].config.autoscaleX, true);
  assert.ok(esHueco(INV.resolver("context.run-chart.update-mode")));
});

test("the menus of the legend and of the plot swatch are greyed out with their reasons", () => {
  assert.deepEqual(rows("context.plot-legend"), ["Visible Items", "Export |", "Create Cluster from Selection", "Properties |"]);
  assert.deepEqual(rows("context.plot-legend.visible-items"), ["Index Display", "Vertical Scrollbar", "Horizontal Scrollbar", "Plot Visibility Checkbox"]);
  assert.deepEqual(rows("context.plot-swatch"), ["Plot Visible", "Common Plots", "Color |", "Line Style", "Line Width", "Anti-Aliased", "Bar Plots |", "Fill Base Line", "Interpolation", "Point Style", "X Scale |", "Y Scale", "Export |"]);
  for (const root of ["context.plot-legend", "context.plot-swatch"]) for (const e of INV.hijos(root)) assert.ok(esHueco(e), `${e.id} is a hole`);
  assert.match(INV.explicacion(INV.entrada("context.plot-swatch.color")).solder, /how each plot looks/);
  // They hang from the drawing: the legend and the swatch are parts of the graph.
  const { chart } = threeGraphs();
  const svg = graphSvg(chart, { separator: "," });
  assert.match(svg, /data-parte="legend"/);
  assert.match(svg, /data-parte="plot-swatch"/);
  const open = ED.abrirMenu(P.inicial(), "context.plot-swatch", "n1", 0, 0);
  assert.match(D.menuContextual(INV, open.menu, ED.marcados(open)), /item-menu hueco" data-id="context\.plot-swatch\.line-width"/);
  assert.match(D.menuContextual(INV, open.menu, new Set()), /<span class="flecha-menu"/, "the rows with a submenu have its arrow");
});

// ——— Run, with a loop writing to the chart ———

/** A For loop of `count` iterations whose `i` goes to a chart and to a numeric indicator. */
function loopWritingToChart(count) {
  let g = Gr.nuevo();
  let r = Gr.crearEstructura(g, CAT, "for-loop", 0, 0, 200, 150);
  g = r.g;
  const loop = r.id;
  const terminal = (name) => g.nodos.find((n) => n.dentro === loop && n.tipo === name).id;
  const inside = (block, config) => {
    const made = Gr.crearNodo(g, CAT, block, 10, 10);
    g = Gr.meter(config ? Gr.fijarConfig(made.g, made.id, config) : made.g, CAT, [made.id], loop);
    return made.id;
  };
  const chart = inside("waveform-chart");
  const indicator = inside("indicator");
  const made = Gr.crearNodo(g, CAT, "const", 0, 0);
  g = Gr.fijarConfig(made.g, made.id, { value: count });
  const wire = (from, fromPort, to, toPort) => {
    const result = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!result.motivo, result.motivo);
    g = result.g;
  };
  wire(made.id, "result", terminal("loop-count"), "count");
  wire(terminal("loop-iteration"), "i", chart, "value");
  wire(terminal("loop-iteration"), "i", indicator, "value");
  return { g, chart, indicator };
}

test("the run worker sends every write to a chart and only the last one to an indicator", async () => {
  const sent = [];
  globalThis.postMessage = (message) => sent.push(message);
  globalThis.onmessage = null;
  await import("../../editor/src/window/run-worker.mjs");
  const { g, chart, indicator } = loopWritingToChart(5);
  const compiled = compilar(g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const { bytes, controles, indicadores, clumps, planes, automaticos, disposicionError } = compiled;
  await globalThis.onmessage({ data: { orden: "run", clave: "test", compilado: { bytes, controles, indicadores, clumps, planes, automaticos, disposicionError }, valores: {}, separador: ".", charts: [chart] } });
  const series = sent.flatMap((message) => message.series?.[chart] ?? []);
  assert.deepEqual(series, [0, 1, 2, 3, 4], "each write is a point of the chart (70)");
  const written = Object.assign({}, ...sent.map((message) => message.escritos ?? {}));
  assert.equal(written[indicator], 4, "an indicator shows the last one");
  assert.ok(!(chart in written), "and the chart does not get its writes twice");
  assert.deepEqual(sent.at(-1), { fin: true });
  // What the panel does with them: the history of the chart, across Runs.
  let charts = GS.appendedToChart({}, chart, series, "i32", 1024);
  charts = GS.appendedToChart(charts, chart, series, "i32", 1024);
  assert.deepEqual(charts[chart].history.plots[0], [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.equal(charts[chart].history.appended, 10, "the X index goes on from the first Run (71)");
});

test("a copied graph keeps its settings and starts with no history", () => {
  const { p, chart } = threeGraphs();
  const configured = { ...p, g: Gr.fijarConfig(p.g, chart.id, { autoscaleY: false, historyLength: 200 }), seleccion: [chart.id], charts: GS.appendedToChart({}, chart.id, [1, 2, 3], "number", 1024) };
  const fragment = PC.copySelection(configured);
  const { p: pasted } = PC.pasteAt(configured, CTX, fragment, { x: 700, y: 500 }, null);
  const copy = pasted.g.nodos.at(-1);
  assert.equal(copy.tipo, "waveform-chart");
  assert.deepEqual([copy.config.autoscaleY, copy.config.historyLength], [false, 200]);
  assert.equal(copy.label.text, "Waveform Chart 2", "numbered, as any copy");
  assert.equal(GS.historyOf(pasted.charts, copy.id, "number").appended, 0, "the history stays with the original");
  assert.ok(copy.panel && pasted.g.nodos.length === 4, "it has its terminal on the diagram");
});

// ——— The file ———

test("the settings of a graph are saved and read back, and the history of a chart is not", () => {
  const { p, chart, graph, xy } = threeGraphs();
  let g = Gr.fijarConfig(p.g, chart.id, { autoscaleY: false, scaleY: { min: -1, max: 1, step: 0.5 }, historyLength: 200, hidden: ["plot-legend", "x-scale-label"] });
  g = Gr.fijarConfig(g, graph.id, { autoscaleX: false, scaleX: { min: 0, max: 140, step: 20 }, looseFitY: false });
  const charts = GS.appendedToChart({}, chart.id, [1, 2, 3], "number", 1024);
  assert.equal(charts[chart.id].history.appended, 3, "the chart has a history in the window");

  const text = aTexto(g, CAT);
  const document = JSON.parse(text);
  const item = (node) => document["front-panel"].find((entry) => entry.name === node.name);
  assert.deepEqual(item(chart).graph, { "autoscale-y": false, "scale-y": { min: -1, max: 1, step: 0.5 }, "history-length": 200, hidden: ["plot-legend", "x-scale-label"] });
  assert.deepEqual(item(graph).graph, { "autoscale-x": false, "scale-x": { min: 0, max: 140, step: 20 }, "loose-fit-y": false });
  assert.equal(item(xy).graph, undefined, "a graph with its defaults writes nothing");
  assert.doesNotMatch(text, /appended|"plots"/, "the history is not in the file");

  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(document), JSON.stringify(validate.errors));
  document["front-panel"][0].graph.hidden = ["a-name-that-is-not-an-item"];
  assert.ok(!validate(document), "the schema refuses an item that does not exist");

  const reopened = leer(text, CAT);
  const back = reopened.nodos.find((n) => n.tipo === "waveform-chart");
  assert.deepEqual([back.config.autoscaleY, back.config.scaleY, back.config.historyLength, back.config.hidden], [false, { min: -1, max: 1, step: 0.5 }, 200, ["plot-legend", "x-scale-label"]]);
  const backGraph = reopened.nodos.find((n) => n.tipo === "waveform-graph");
  assert.deepEqual([backGraph.config.autoscaleX, backGraph.config.scaleX, backGraph.config.looseFitY], [false, { min: 0, max: 140, step: 20 }, false]);
  assert.equal(aTexto(reopened, CAT), text, "saving what was opened gives the same file");
});
