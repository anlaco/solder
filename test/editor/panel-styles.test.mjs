// The panel styles (DT-058): SOLDER_PANEL_STYLE chooses one, and every style, Old School included, dresses the plain
// HTML of html-controls.mjs with a sheet over plain.css, the mother template. A style changes neither sizes nor
// terminals, keeps the editor's hooks, and every kind of control has Plain rules.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as V from "../../editor/src/window/window-view.mjs";
import { ORNAMENT_CLASSES, PLAIN_KINDS } from "../../editor/src/front-panel/html-controls.mjs";
import { OLD_SCHOOL_ART_DIRECTORY, oldSchoolArt, themeTokensOf } from "../../editor/src/panel-styles/old-school-art.mjs";
import { PANEL_STYLES, chosenPanelStyleName, panelStyleFromQuery } from "../../editor/src/front-panel/panel-style.mjs";
import { CAT, INV } from "../helpers.mjs";

const PANEL_STYLES_DIRECTORY = new URL("../../editor/src/panel-styles/", import.meta.url);
const readSheet = (name) => readFileSync(new URL(name, PANEL_STYLES_DIRECTORY), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const PLAIN_CSS = readSheet("plain.css");
const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const PLAIN = { ...CTX, panelStyle: "plain" };

/** Put a control on the panel from the palette and confirm its label as it comes. */
function place(p, block, point, config) {
  p = P.coger(p, block, config);
  p = P.moverA(p, CTX, point);
  return P.confirmar(P.pulsar(p, CTX, { tipo: "fondo" }, point));
}

const errorConfig = (name) => INV.entrada(`palette.controls.modern.data-containers.${name}`).config;

/** One object of every kind the panel has, each with the kind class Plain must give it. */
const EVERY_KIND = [
  ["control", undefined, "numeric"],
  ["indicator", undefined, "numeric"],
  ["control", { type: { enum: ["Bake", "Grill"] }, value: 1 }, "enum"],
  ["str-control", undefined, "string"],
  ["str-indicator", undefined, "string"],
  ["visa-control", undefined, "visa"],
  ["visa-indicator", undefined, "visa"],
  ["path-control", undefined, "path"],
  ["path-indicator", undefined, "path"],
  ...Object.keys(G.BOOLEANOS).map((style) => [G.BOOLEANOS[style].indicador ? "bool-indicator" : "bool-control", { style }, "boolean"]),
  ["cluster-control", errorConfig("error-in"), "error-cluster"],
  ["cluster-indicator", errorConfig("error-out"), "error-cluster"],
  ["arr-control", { type: { array: "number" }, value: [1, 2] }, "array"],
  ["arr-indicator", { type: { array: "string" }, value: ["a"] }, "array"],
  ["arr-control", { type: { array: "boolean" }, value: [true] }, "array"],
  ["arr-control", { type: { array: "i32", dims: 2 }, value: [[1, 2], [3, 4]] }, "array"],
  ["waveform-chart", undefined, "waveform-chart"],
  ["waveform-graph", undefined, "waveform-graph"],
  ["xy-graph", undefined, "xy-graph"],
];

/** A panel with every kind, each placed far from the others. */
const everyKindPanel = () => EVERY_KIND.reduce((p, [block, config], index) => place(p, block, { x: 200 + (index % 5) * 400, y: 200 + Math.floor(index / 5) * 400 }, config), P.inicial());

/** The root element of each object an HTML panel drew: its classes, its label and its box. */
function htmlRoots(html) {
  return [...html.matchAll(/<div class="(objeto-panel [^"]*)" data-nodo="([^"]+)" data-label="([^"]*)"[^>]*style="left:([\d.-]+)px;top:([\d.-]+)px;width:([\d.]+)px;height:([\d.]+)px"/g)].map(
    ([, classes, id, label, x, y, width, height]) => ({ classes: classes.split(" "), id, label, box: [x, y, width, height].map(Number) }),
  );
}

test("development starts in Old School and a release in Solder", () => {
  assert.equal(chosenPanelStyleName(undefined, false), "old-school");
  assert.equal(chosenPanelStyleName(undefined, true), "solder");
  for (const name of ["plain", "solder", "solder-night"]) assert.equal(chosenPanelStyleName(name, false), name);
});

test("an unknown panel style is reported and the default is used", () => {
  const warnings = [];
  assert.equal(chosenPanelStyleName("neon", true, (message) => warnings.push(message)), "solder");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /SOLDER_PANEL_STYLE=neon/);
});

test("a window reads its style from its URL", () => {
  assert.equal(panelStyleFromQuery("plain"), "plain");
  assert.equal(panelStyleFromQuery(null), "old-school");
  assert.equal(panelStyleFromQuery("toString"), "old-school", "only the styles themselves are names");
});

test("the editor has one panel drawing: every style, Old School included, draws the same markup", () => {
  const p = everyKindPanel();
  const drawn = Object.keys(PANEL_STYLES).map((panelStyle) => P.contenido(p, { ...CTX, panelStyle }));
  for (const html of drawn) assert.equal(html, P.contenido(p, CTX));
  assert.equal(htmlRoots(drawn[0]).length, EVERY_KIND.length, "every object has Plain's root, with its box and label");
});

test("every panel style, Old School included, makes the Front Panel's canvas an .sd-panel", () => {
  const canvas = (panelStyle) => V.ventana(INV, "front-panel", { paleta: null }, { panelStyle }).match(/<div class="(lienzo [^"]*)"/)[1];
  for (const name of Object.keys(PANEL_STYLES)) assert.equal(canvas(name), `lienzo lienzo-front-panel sd-panel sd-style-${name}`);
  assert.equal(canvas(undefined), "lienzo lienzo-front-panel", "a canvas with no panel style, as the diagram's");
});

test("Old School's SVG files are what old-school-art.mjs writes from glyphs.mjs (run scripts/old-school-art.mjs)", () => {
  const directory = new URL(`${OLD_SCHOOL_ART_DIRECTORY}/`, PANEL_STYLES_DIRECTORY);
  const art = oldSchoolArt(themeTokensOf(readFileSync(new URL("../themes/old-school.css", PANEL_STYLES_DIRECTORY), "utf8")));
  assert.deepEqual(readdirSync(directory).sort(), art.map(({ name }) => name).sort(), "no file missing and none left over");
  for (const { name, content } of art) assert.equal(readFileSync(new URL(name, directory), "utf8"), content, name);
  const referenced = [...readSheet("old-school.css").matchAll(/url\("old-school\/([^"]+)"\)/g)].map(([, name]) => name);
  assert.deepEqual([...new Set(referenced)].sort(), art.map(({ name }) => name).sort(), "old-school.css takes every file the generator writes, and only those");
});

test("every object of an HTML panel keeps its Old School box and carries its kind and its label", () => {
  const p = everyKindPanel();
  const roots = htmlRoots(P.contenido(p, PLAIN));
  assert.equal(roots.length, EVERY_KIND.length, "one root per object");
  p.g.nodos.forEach((node, index) => {
    const root = roots.find(({ id }) => id === node.id);
    const box = P.caja(node);
    assert.deepEqual(root.box, [box.x, box.y, box.ancho, box.alto], `${node.tipo}: same place and size as in Old School`);
    assert.ok(root.classes.includes(`sd-${EVERY_KIND[index][2]}`), `${node.tipo}: sd-${EVERY_KIND[index][2]}`);
    assert.ok(root.classes.includes(node.tipo.endsWith("-control") || node.tipo === "control" ? "sd-control" : "sd-indicator"), `${node.tipo}: control or indicator`);
    assert.equal(root.label, node.label.text);
  });
});

test("the labels of an HTML panel are the editor's movable labels, with the public class", () => {
  const html = P.contenido(place(P.inicial(), "control", { x: 100, y: 100 }), PLAIN);
  assert.match(html, /<div class="etiqueta sd-label" data-etiqueta="/);
});

test("an HTML panel keeps the hooks the editor reads to know what was clicked", () => {
  let p = place(P.inicial(), "control", { x: 100, y: 100 });
  p = place(p, "arr-control", { x: 400, y: 100 }, { type: { array: "number" }, value: [1] });
  p = place(p, "cluster-control", { x: 100, y: 400 }, errorConfig("error-in"));
  const [numeric, array] = p.g.nodos;
  const html = P.contenido({ ...p, seleccion: [array.id] }, PLAIN);
  assert.match(html, new RegExp(`data-casilla="${numeric.id}"`), "the field of a numeric control is typed into");
  assert.match(html, /role="button" aria-label="Increment" data-paso="1"/, "the incrementer steps");
  assert.match(html, /<span class="sd-index" data-eje="columna"/, "the index of an array names its axis");
  assert.match(html, /data-k="0"/, "each element of an array is addressed");
  assert.match(html, /data-asa-array="1" data-lado="derecha"/, "a selected array can be stretched");
  for (const field of ["status", "code", "source"]) assert.match(html, new RegExp(`data-campo="${field}"`), `the ${field} of an error cluster`);
});

test("an HTML panel shows the values and what is being typed, as Old School does", () => {
  let p = place(P.inicial(), "control", { x: 100, y: 100 }, { value: 2.5 });
  const id = p.g.nodos[0].id;
  assert.match(P.contenido(p, PLAIN), /<span class="sd-value">2,5<\/span>/);
  p = P.editarValor(p, CTX, id, false);
  assert.match(P.contenido(p, PLAIN), /class="objeto-panel sd-control sd-numeric editando-valor sd-editing".*<span class="sd-value"><span>2,5<\/span><span class="caret"><\/span>/);
});

test("a Boolean says its state with ARIA and .sd-on, and keeps its exact style", () => {
  const html = (style, value) => P.contenido(place(P.inicial(), G.BOOLEANOS[style].indicador ? "bool-indicator" : "bool-control", { x: 100, y: 100 }, { style, value }), PLAIN);
  assert.match(html("stop-button", true), /class="objeto-panel sd-control sd-boolean sd-boolean-button sd-on" [^>]*data-style="stop-button".*role="button" aria-pressed="true">STOP</);
  assert.match(html("vertical-toggle-switch", false), /sd-boolean-switch sd-vertical".*role="switch" aria-checked="false"/);
  assert.match(html("round-led", true), /class="objeto-panel sd-indicator sd-boolean sd-boolean-led sd-on"/);
  assert.match(html("radio-buttons", false), /role="radiogroup"/);
});

test("a graph is drawn with classes, not colors", () => {
  const html = P.contenido(place(P.inicial(), "waveform-graph", { x: 300, y: 300 }), PLAIN);
  assert.match(html, /<rect class="sd-plot"/);
  assert.match(html, /class="sd-legend" data-parte="legend"/);
  assert.match(html, /data-parte="plot-swatch"/);
  const art = html.slice(html.indexOf("<svg"), html.lastIndexOf("</svg>"));
  assert.doesNotMatch(art, /fill="#|stroke="#/, "every color comes from the panel style");
});

test("plain.css has rules for every kind an HTML panel draws (a control a style does not draw shows as Plain)", () => {
  for (const kind of PLAIN_KINDS) assert.match(PLAIN_CSS, new RegExp(`\\.sd-${kind}\\b`), `no Plain rules for .sd-${kind}`);
  const kindsDrawn = new Set(htmlRoots(P.contenido(everyKindPanel(), PLAIN)).flatMap(({ classes }) => classes.filter((name) => PLAIN_KINDS.includes(name.slice(3)))));
  assert.deepEqual([...kindsDrawn].sort(), PLAIN_KINDS.map((kind) => `sd-${kind}`).sort(), "every kind in PLAIN_KINDS is drawn, and nothing else");
});

test("every ornament part is hidden in Plain, and the markup has no other", () => {
  for (const name of ORNAMENT_CLASSES) assert.match(PLAIN_CSS, new RegExp(`\\.sd-panel \\.${name} \\{ display: none; \\}`), `.${name}`);
  const hiddenParts = [...P.contenido(everyKindPanel(), PLAIN).matchAll(/<(?:span|g) class="([\w-]+)" aria-hidden="true">/g)].map(([, name]) => name);
  assert.deepEqual([...new Set(hiddenParts)].filter((name) => !ORNAMENT_CLASSES.includes(name)), [], "an aria-hidden part that is not declared as ornament");
});

/** The selectors of a rule's list, split at the commas that are not inside `:is(…)` and the like. */
const selectorsOf = (list) => list.split(/,(?![^(]*\))/).map((selector) => selector.trim());

/** A sheet may build on another shipped one with `@import`, as Solder Night does on Solder. */
const IMPORT_STATEMENT = /@import\s+"([^"]+)";/g;

test("every rule of every panel style lives under .sd-panel, so a panel style never touches the editor", () => {
  for (const sheet of readdirSync(PANEL_STYLES_DIRECTORY).filter((name) => name.endsWith(".css"))) {
    const rules = readSheet(sheet).replace(IMPORT_STATEMENT, "");
    const selectors = [...rules.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(([, list]) => selectorsOf(list));
    assert.deepEqual(selectors.filter((selector) => !selector.startsWith(".sd-panel")), [], sheet);
  }
});

test("every panel style's sheet exists, and so does every shipped sheet it imports", () => {
  const sheets = readdirSync(PANEL_STYLES_DIRECTORY);
  for (const { stylesheet } of Object.values(PANEL_STYLES).filter(({ stylesheet }) => stylesheet)) {
    assert.ok(sheets.includes(stylesheet), stylesheet);
    for (const [, imported] of readSheet(stylesheet).matchAll(IMPORT_STATEMENT)) assert.ok(sheets.includes(imported), `${stylesheet} imports ${imported}`);
  }
});
