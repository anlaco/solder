// Writes the Front Panel fixture of DT-058 as static HTML pages, drawn by the editor of a given checkout, so two
// checkouts (or two panel styles) can be compared pixel by pixel with capture.cjs.
//
//   node scripts/panel-pixels/render.mjs <checkout> <output directory> [panel style]
//
// The modules and the stylesheets are those of <checkout>: a git worktree of the commit before is BEFORE, the
// working tree is AFTER. Each scene is a whole Front Panel window, as editor-window.mjs paints it, built through the
// same functions the editor calls when the user places, selects and types; no clicks are involved.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [checkoutArgument, outputArgument, panelStyle = "old-school"] = process.argv.slice(2);
if (!checkoutArgument || !outputArgument) {
  console.error("usage: render.mjs <checkout> <output directory> [panel style]");
  process.exit(2);
}
const CHECKOUT = path.resolve(checkoutArgument);
const OUTPUT = path.resolve(outputArgument);
const fromCheckout = (relative) => import(pathToFileURL(path.join(CHECKOUT, relative)).href);

const P = await fromCheckout("editor/src/front-panel/front-panel.mjs");
const V = await fromCheckout("editor/src/window/window-view.mjs");
const D = await fromCheckout("editor/src/block-diagram/diagram-view.mjs");
const G = await fromCheckout("editor/src/common/glyphs.mjs");
const Gr = await fromCheckout("core/model/graph.mjs");
const GS = await fromCheckout("editor/src/front-panel/graph-state.mjs");
const { CAT, INV } = await fromCheckout("test/helpers.mjs");
const panelStyleModule = path.join(CHECKOUT, "editor/src/front-panel/panel-style.mjs");
const PANEL_STYLES = existsSync(panelStyleModule) ? (await import(pathToFileURL(panelStyleModule).href)).PANEL_STYLES : {};

const DECIMAL_SEPARATOR = ",";
const CONTEXT = { ...D.contexto(CAT, D.glifosPorBloque(INV), DECIMAL_SEPARATOR), panelStyle };
/** The window every scene is drawn in, as SOLDER_TAMANO sets it for the captures. */
export const WINDOW_SIZE = { width: 1400, height: 900 };
const COLUMN_STEP = 170;
const ROW_STEP = 130;
const FIRST_POINT = { x: 40, y: 60 };
const GRAPHS_FIRST_POINT = { x: 200, y: 260 };

const errorConfig = (name) => INV.entrada(`palette.controls.modern.data-containers.${name}`).config;

/** Place a control from the palette, as the user does, and confirm its label. */
function place(p, block, point, config) {
  p = P.coger(p, block, config);
  p = P.moverA(p, CONTEXT, point);
  return P.confirmar(P.pulsar(p, CONTEXT, { tipo: "fondo" }, point));
}

/** Place each `[block, config]` on a grid of `columns`, left to right and top to bottom, from `first`. */
function placeAll(items, columns, columnStep = COLUMN_STEP, rowStep = ROW_STEP, first = FIRST_POINT) {
  return items.reduce(
    (p, [block, config], index) =>
      place(p, block, { x: first.x + (index % columns) * columnStep, y: first.y + Math.floor(index / columns) * rowStep }, config),
    P.inicial(),
  );
}

/** The three graphs side by side, low enough for their legends and labels to show. */
const placeGraphs = () => placeAll([["waveform-chart", undefined], ["waveform-graph", undefined], ["xy-graph", undefined]], 3, 450, 0, GRAPHS_FIRST_POINT);

const nodeIds = (p) => p.g.nodos.map(({ id }) => id);
const booleanBlock = (style) => (G.BOOLEANOS[style].indicador ? "bool-indicator" : "bool-control");

// ——— The scenes ———
//
// Each one isolates a kind, so a migrated kind is proven on its own pages. Every scene has a variant with every
// object selected, because the selection's marching ants are drawn over the object.

const SCENES = {
  numeric: () =>
    placeAll(
      [
        ["control", undefined],
        ["indicator", undefined],
        ["control", { value: -1234.5 }],
        ["indicator", { value: 98765.4321 }],
        ["control", { type: "i32", value: 42 }],
        ["indicator", { type: "u8", value: 255 }],
        ["control", { type: { enum: ["Bake", "Grill"] }, value: 1 }],
        ["indicator", { type: { enum: ["Off", "Low", "High"] }, value: 2 }],
      ],
      4,
    ),
  // Typing into a field: with the caret at the end, and with all its text selected.
  "numeric-typing": () => {
    const p = placeAll([["control", { value: 2.5 }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], false);
  },
  "numeric-typing-all": () => {
    const p = placeAll([["control", { value: 2.5 }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], true);
  },
  "string-typing": () => {
    const p = placeAll([["str-control", { value: "two\nlines" }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], false);
  },
  "string-typing-all": () => {
    const p = placeAll([["str-control", { value: "text" }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], true);
  },
  string: () => placeAll([["str-control", undefined], ["str-indicator", undefined], ["str-control", { value: "two\nlines" }], ["str-indicator", { value: "text" }]], 4),
  "boolean-off": () => placeAll(Object.keys(G.BOOLEANOS).map((style) => [booleanBlock(style), { style, value: false }]), 5),
  "boolean-on": () => placeAll(Object.keys(G.BOOLEANOS).map((style) => [booleanBlock(style), { style, value: true }]), 5),
  error: () =>
    placeAll(
      [
        ["cluster-control", errorConfig("error-in")],
        ["cluster-indicator", errorConfig("error-out")],
        ["cluster-control", { ...errorConfig("error-in"), value: { status: true, code: 5000, source: "Oven Controller.sdg" } }],
        ["cluster-indicator", { ...errorConfig("error-out"), value: { status: true, code: -1, source: "a long source\nwith two lines" } }],
      ],
      4,
      220,
      180,
    ),
  // Typing into the code and into the source of an error in.
  "error-typing-code": () => {
    const p = placeAll([["cluster-control", { ...errorConfig("error-in"), value: { status: false, code: 12, source: "" } }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], false, "code");
  },
  "error-typing-source": () => {
    const p = placeAll([["cluster-control", { ...errorConfig("error-in"), value: { status: true, code: 1, source: "Main.sdg" } }]], 1);
    return P.editarValor({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], true, "source");
  },
  array: () =>
    placeAll(
      [
        ["arr-control", { type: { array: "number" }, value: [1, 2] }],
        ["arr-indicator", { type: { array: "number" }, value: [3.5] }],
        ["arr-control", { type: { array: "string" }, value: ["a", "bc"] }],
        ["arr-indicator", { type: { array: "string" }, value: [] }],
        ["arr-control", { type: { array: "boolean" }, value: [true, false] }],
        ["arr-indicator", { type: { array: "boolean" }, value: [true] }],
        ["arr-control", { type: { array: "i32", dims: 2 }, value: [[1, 2], [3, 4]] }],
        ["arr-indicator", { type: { array: "number", dims: 2 }, value: [[1]] }],
      ],
      2,
      300,
      110,
    ),
  // Elements past the end of the value (greyed), more dimensions and element types.
  "array-wide": () =>
    placeAll(
      [
        ["arr-control", { type: { array: "number" }, value: [1], visibles: 3 }],
        ["arr-indicator", { type: { array: "boolean" }, value: [false], visibles: 3 }],
        ["arr-control", { type: { array: "number", dims: 2 }, value: [[1]], visibles: [2, 2] }],
        ["arr-indicator", { type: { array: "string", dims: 2 }, value: [["a", "b"]], visibles: [2, 2] }],
        ["arr-control", { type: { array: "boolean", dims: 2 }, value: [[true]], visibles: [2, 2] }],
        ["arr-indicator", { type: { array: "i32", dims: 2 }, value: [[1, 2], [3, 4]], visibles: [2, 2] }],
      ],
      2,
      400,
      150,
    ),
  // Typing into an element, with the caret and with all of it selected.
  "array-typing": () => {
    const p = placeAll([["arr-control", { type: { array: "number" }, value: [1, 2] }]], 1);
    return P.editarElemento({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], 1, false);
  },
  "array-typing-all": () => {
    const p = placeAll([["arr-control", { type: { array: "string", dims: 2 }, value: [["ab", "c"]] }]], 1);
    return P.editarElemento({ ...p, seleccion: [] }, CONTEXT, nodeIds(p)[0], "0,1", true);
  },
  graph: placeGraphs,
  // The three graphs with data: two plots on the graph and the XY (white and red), a history on the chart.
  "graph-data": () => {
    let p = placeGraphs();
    const [chart, graph, xy] = nodeIds(p);
    const wave = (phase) => Array.from({ length: 40 }, (_, i) => Math.sin(i / 4 + phase) * 3);
    const types = {
      [chart]: "number",
      [graph]: { array: "number", dims: 2 },
      [xy]: { array: { cluster: [{ name: "x", type: { array: "number" } }, { name: "y", type: { array: "number" } }] } },
    };
    for (const id of [chart, graph, xy]) p = { ...p, g: wired(p.g, id) };
    const circle = (radius) => ({ x: wave(Math.PI / 2).map((v) => v * radius), y: wave(0).map((v) => v * radius) });
    const valores = { [graph]: [wave(0), wave(1)], [xy]: [circle(1), circle(0.5)] };
    const charts = GS.appendedToChart({}, chart, wave(2), "number", 1024);
    return { ...p, valores, charts, wireTypes: types };
  },
};

/** The graph wired from a constant, so the window knows it receives data (its type is set by the scene). */
function wired(g, graphId) {
  const made = Gr.crearNodo(g, CAT, "const", 20, 20);
  return Gr.conectar(made.g, CAT, { nodo: made.id, puerto: "result", dir: "out" }, { nodo: graphId, puerto: "value", dir: "in" }).g;
}

/** The Front Panel window of a scene, as editor-window.mjs paints it. */
function windowHtml(p) {
  const resolvedTypes = Gr.tipos(p.g, CAT);
  // A scene can say what type reaches each graph, without building the diagram that makes it.
  for (const [graphId, type] of Object.entries(p.wireTypes ?? {})) {
    const wire = p.g.cables.find((candidate) => candidate.a.nodo === graphId && candidate.a.puerto === "value");
    resolvedTypes.cables.set(wire.id, { tipo: type });
  }
  const charts = GS.reconciledCharts(p.charts, p.g, resolvedTypes);
  const canvas = P.contenido({ ...p, charts }, { ...CONTEXT, panelSize: WINDOW_SIZE }, resolvedTypes);
  return V.ventana(INV, "front-panel", { paleta: null }, { lienzo: canvas, panelStyle });
}

/** The stylesheets of index.html that exist in the checkout, with the chosen panel style's sheet last. */
function stylesheets() {
  const style = PANEL_STYLES[panelStyle]?.stylesheet;
  const chosen = style ? [`editor/src/panel-styles/${style}`] : [];
  return ["editor/src/themes/old-school.css", "editor/src/styles.css", "editor/src/panel-styles/plain.css", ...chosen]
    .map((relative) => path.join(CHECKOUT, relative))
    .filter(existsSync)
    .map((file) => `<link rel="stylesheet" href="${pathToFileURL(file).href}" />`)
    .join("\n");
}

function page(body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />${stylesheets()}</head><body>${body}</body></html>`;
}

mkdirSync(OUTPUT, { recursive: true });
for (const [name, build] of Object.entries(SCENES)) {
  const built = build();
  const p = { ...built, menu: null, accion: null, seleccion: built.edicion ? built.seleccion : [] };
  writeFileSync(path.join(OUTPUT, `${name}.html`), page(windowHtml(p)));
  if (!p.edicion) writeFileSync(path.join(OUTPUT, `${name}-selected.html`), page(windowHtml({ ...p, seleccion: nodeIds(p) })));
}
console.log(`${Object.keys(SCENES).length} scenes from ${CHECKOUT} (${panelStyle}) in ${OUTPUT}`);
