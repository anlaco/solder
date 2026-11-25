// Resizing controls and indicators by their handles (GitHub issue #21), against what was measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-19-control-resizing.md.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { DAQ_TASK } from "../../core/model/daq-name.mjs";
import { GRAPH_MEASURES, graphMeasures } from "../../editor/src/front-panel/graph-view.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };
const START = { x: 300, y: 300 };

/** Take a control from the palette, carry it to `point` and click, as the editor does. */
function place(block, config) {
  const carried = P.moverA(P.coger(P.inicial(), block, config), CTX, START);
  const p = P.confirmar(P.pulsar(carried, CTX, FONDO, START));
  return { ...p, seleccion: [p.g.nodos[0].id] };
}

/** Drag the `side` handle of the panel's only object by (dx, dy) and let go. */
function drag(p, side, dx, dy) {
  const id = p.g.nodos[0].id;
  const pressed = P.pulsar(p, CTX, { tipo: "asa-control", id, lado: side }, START);
  const end = { x: START.x + dx, y: START.y + dy };
  return P.soltar(P.moverA(pressed, CTX, end), CTX, FONDO, end);
}

const handles = (p) => [...P.contenido(p, CTX).matchAll(/data-asa-control="(\w+)"/g)].map((match) => match[1]);
const boxOf = (p) => P.caja(p.g.nodos[0]);
const size = (p) => [boxOf(p).ancho, boxOf(p).alto];
const labelX = (p) => P.cajaEtiqueta(p.g.nodos[0], CTX.medir).x;

test("a selected VISA resource name, string or path has eight handles, a numeric only the left and right ones", () => {
  for (const block of ["visa-control", "visa-indicator", "str-control", "str-indicator", "path-control", "path-indicator"]) {
    assert.deepEqual(handles(place(block)), ["nw", "n", "ne", "e", "se", "s", "sw", "w"], `${block}: report §1`);
  }
  assert.deepEqual(handles(place("control")), ["e", "w"], "report §1: a numeric never grows taller");
  assert.deepEqual(handles(place("indicator")), ["e", "w"]);
  assert.deepEqual(handles({ ...place("visa-control"), seleccion: [] }), [], "only a selected object shows them");
});

const TEXT_RING = { type: "u16", style: "text-ring", items: [{ text: "Bake", value: 0 }] };
const MENU_RING = { ...TEXT_RING, style: "menu-ring" };
const EIGHT = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

test("every other control and indicator has handles too, but a file refnum (reports/2026-11-24-control-resizing-3.md §1)", () => {
  const cases = [
    ["bool-control", undefined, EIGHT],
    ["bool-indicator", { style: "round-led" }, EIGHT],
    ["refnum-control", undefined, []],
    ["cluster-control", { style: "error-in" }, EIGHT],
    ["daq-name-control", { type: DAQ_TASK }, EIGHT],
    ["waveform-chart", undefined, EIGHT],
    ["waveform-graph", undefined, EIGHT],
    ["xy-graph", undefined, EIGHT],
    // Measured: reports/2026-11-24-control-resizing-2.md §1.
    ["control", { type: { enum: ["a", "b"] } }, EIGHT],
    ["control", TEXT_RING, EIGHT],
    ["indicator", MENU_RING, EIGHT],
  ];
  for (const [block, config, sides] of cases) assert.deepEqual(handles(place(block, config)), sides, `${block} ${JSON.stringify(config ?? {})}`);
});

test("a widened enum, ring, Boolean or error cluster keeps its new size, down to LabVIEW's smallest", () => {
  // reports/2026-11-24-control-resizing-2.md §2, §5: both ways, down to their narrowest (after the incrementer, which
  // Solder's box holds) and their default height.
  const narrowest = [["control", { type: { enum: ["a", "b"] } }, 16], ["indicator", { type: { enum: ["a", "b"] } }, 16], ["control", TEXT_RING, 22], ["indicator", TEXT_RING, 16], ["control", MENU_RING, 33]];
  for (const [block, config, width] of narrowest) {
    const p = place(block, config);
    const label = `${block} ${config.style ?? "enum"}`;
    assert.equal(boxOf(drag(p, "e", 40, 0)).ancho, boxOf(p).ancho + 40, label);
    const tall = drag(p, "s", 0, 40);
    assert.equal(boxOf(tall).alto, boxOf(p).alto + 40, label);
    assert.match(P.contenido(tall, CTX), /class="objeto-panel [^"]*sd-tall/, `${label}: drawn tall`);
    const smallest = boxOf(drag(p, "se", -500, -500));
    assert.deepEqual([smallest.ancho - (smallest.casilla ?? 0), smallest.alto], [width, boxOf(p).alto], label);
  }
  // reports/2026-11-24-control-resizing-3.md §2: a Boolean down to 5 × 5, an error cluster to 13 × 13.
  const button = place("bool-control");
  assert.deepEqual(size(drag(button, "se", 20, 10)), [boxOf(button).ancho + 20, boxOf(button).alto + 10]);
  assert.deepEqual(size(drag(button, "se", -500, -500)), [5, 5]);
  const error = place("cluster-control", { style: "error-in" });
  assert.deepEqual(size(drag(error, "se", -500, -500)), [13, 13]);
  assert.deepEqual(size(drag(error, "se", 30, 20)), [boxOf(error).ancho + 30, boxOf(error).alto + 20]);
});

test("a resized graph draws its frame at the new size and gives the plot area what it grew by", () => {
  const p = place("waveform-graph");
  assert.deepEqual(size(p), [GRAPH_MEASURES["waveform-graph"].width, GRAPH_MEASURES["waveform-graph"].height]);
  const grown = drag(p, "se", 100, 50);
  const { plot } = GRAPH_MEASURES["waveform-graph"];
  assert.deepEqual(graphMeasures(grown.g.nodos[0]).plot, { ...plot, width: plot.width + 100, height: plot.height + 50 });
  assert.match(P.contenido(grown, CTX), /<svg class="sd-graph-art" width="428" height="268"/);
  // reports/2026-11-24-control-resizing-3.md §2, §4: 99 × 55, a plot of about 3 px left.
  assert.deepEqual(size(drag(p, "se", -1000, -1000)), [99, 55]);
  assert.deepEqual(size(drag(place("xy-graph"), "se", -1000, -1000)), [97, 55]);
});

test("widening a VISA resource name keeps the size in the .ovi and shows the whole resource string's room", () => {
  const p = place("visa-control");
  assert.deepEqual(size(p), [104, 26], "report §3");
  const widened = drag(p, "e", 100, 0);
  assert.deepEqual(size(widened), [204, 26]);
  assert.equal(boxOf(widened).x, boxOf(p).x, "the right handle leaves the left edge");
  assert.match(P.contenido(widened, CTX), /class="objeto-panel sd-control sd-visa[^"]*"[^>]*style="left:[^;]+;top:[^;]+;width:204px;height:26px"/);
  const reread = leer(aTexto(widened.g, CAT), CAT).nodos[0];
  assert.equal(reread.panel.w, 204);
  assert.equal(reread.panel.h, undefined, "a default height is not kept");
});

test("each object stops at LabVIEW's narrowest box and at its default height", () => {
  // Report §3: VISA control 43, indicator 26, string 16, path 25, numeric control 13 and indicator 18 (counted after
  // the control's incrementer, which Solder's box holds and LabVIEW's does not).
  const narrowest = { "visa-control": 43, "visa-indicator": 26, "str-control": 16, "str-indicator": 16, "path-control": 25, "path-indicator": 25, control: 25, indicator: 18 };
  for (const [block, width] of Object.entries(narrowest)) {
    const p = place(block);
    assert.equal(boxOf(drag(p, "e", -500, 0)).ancho, width, block);
    if (block !== "control" && block !== "indicator") assert.equal(boxOf(drag(p, "s", 0, -500)).alto, boxOf(p).alto, `${block}: the shortest is the default`);
  }
});

test("dragging the left handle moves a string's label with the edge, but not a VISA resource name's", () => {
  // Report §5.
  const string = place("str-control");
  const stringWidened = drag(string, "w", -40, 0);
  assert.equal(boxOf(stringWidened).x, boxOf(string).x - 40);
  assert.equal(labelX(stringWidened), labelX(string) - 40);
  const visa = place("visa-control");
  const visaWidened = drag(visa, "w", -40, 0);
  assert.equal(boxOf(visaWidened).x, boxOf(visa).x - 40);
  assert.equal(labelX(visaWidened), labelX(visa), "the label stays where it was");
  assert.equal(labelX(drag(visa, "e", 40, 0)), labelX(visa), "the right handle never moves it");
});

test("a string or VISA resource name made taller wraps its text; a numeric never grows taller", () => {
  // Report §6.
  for (const block of ["str-control", "visa-control"]) {
    const p = place(block);
    assert.doesNotMatch(P.contenido(p, CTX), /sd-tall/);
    const taller = drag(p, "s", 0, 34);
    assert.equal(boxOf(taller).alto, boxOf(p).alto + 34);
    assert.match(P.contenido(taller, CTX), /class="objeto-panel[^"]*sd-tall/, block);
  }
  const numeric = place("control");
  const reread = { ...numeric, g: { ...numeric.g, nodos: [{ ...numeric.g.nodos[0], panel: { ...numeric.g.nodos[0].panel, h: 80 } }] } };
  assert.equal(boxOf(reread).alto, boxOf(numeric).alto, "a stored height does not make a numeric taller");
});

test("Old School shows a Boolean's and an error cluster's handles and stretches a Boolean's drawing", () => {
  // Found in the editor: Old School hid every child of a Boolean but its drawing, the handles too, and clipped an error
  // cluster's right and bottom handles; its Boolean drawings kept their aspect ratio inside a resized box.
  const css = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8");
  assert.match(css, /\.sd-boolean > :not\(\.sd-art, \.asa\) \{ display: none; \}/);
  assert.match(css, /\.sd-error-cluster \{[^}]*overflow: visible/);
  assert.match(css, /\.sd-error-cluster > \.asa \{ margin: -2px 0 0 -2px; \}/);
  const art = readFileSync(new URL("../../editor/src/panel-styles/old-school/boolean-round-led-off.svg", import.meta.url), "utf8");
  assert.match(art, /preserveAspectRatio="none"/);
});

test("Old School draws a taller enum's arrows and a taller VISA name's dropdown at their own size", () => {
  const sheet = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8");
  // reports/2026-11-24-control-resizing-2.md §5: the up arrow pinned to the top, the down one to the bottom, not stretched.
  assert.match(sheet, /\.sd-panel \.sd-tall \.sd-incrementer \{ background: none; \}/, "the SVG would stretch them");
  assert.match(sheet, /\.sd-tall \.sd-step-up::before \{ top: 5px; border-bottom: 5px solid #7a7a7a; \}/);
  assert.match(sheet, /\.sd-tall \.sd-step-down::before \{ bottom: 5px; border-top: 5px solid #7a7a7a; \}/);
  // The VISA resource name's and DAQ name's cells stretch, the arrow centred.
  assert.match(sheet, /\.sd-tall\.sd-visa \.sd-dropdown \{ bottom: 4px; height: auto; \}/);
  assert.match(sheet, /\.sd-tall\.sd-visa \.sd-dropdown::before \{ top: calc\(50% - 2px\); \}/);
});
