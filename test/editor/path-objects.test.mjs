// The path in the editor (DT-067), stage A: its wire, the terminals and constants on the diagram, the File Path Control and
// Indicator on the panel, typing into them, the values a Run leaves and the round trip through the .sdg. Every measure comes
// from labview-captures/reports/2026-10-26-path-type.md §1 and §2 (local evidence, never committed). The Windows rules are
// asked for by name: the tests do not depend on the system they run on.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { COLORES, PATH, aspecto } from "../../core/model/types.mjs";
import { EMPTY_PATH, NOT_A_PATH, pathFromText } from "../../core/model/paths.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as RV from "../../editor/src/window/run-values.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as HC from "../../editor/src/front-panel/html-controls.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { abbreviatePath } from "../../editor/src/common/path-text.mjs";
import { CAT, INV } from "../helpers.mjs";

const TEAL = "#007f7f";
const WINDOWS = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const POSIX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "posix");
const FILE = "C:\\a\\b.txt";
const fileOn = (rules) => pathFromText(FILE, rules);

const withBox = (g, id, ctx = WINDOWS) => D.caja(g.nodos.find((n) => n.id === id), ctx);
const html = (g, ctx = WINDOWS) => D.contenido({ ...ED.inicial(), g }, ctx, Gr.tipos(g, CAT));

// ——— The wire ———

test("the wire of a path is teal, dashed 3 on and 1 off, and so is an array of paths", () => {
  assert.equal(COLORES.path, TEAL);
  assert.deepEqual(aspecto(PATH), { color: TEAL, dimension: 0, dashed: true });
  assert.deepEqual(aspecto({ array: PATH }), { color: TEAL, dimension: 1, dashed: true });
  assert.equal(aspecto("string").dashed, undefined, "another type keeps its own wire");
  assert.equal(aspecto({ array: "string" }).dashed, undefined);
});

/** The pixel rows of the first wire of a diagram: their dash pattern and offset. */
const wireRows = (g) => {
  const wire = html(g).match(/<g class="cable"[^>]*>([\s\S]*?)<\/g>/)[1];
  return [...wire.matchAll(/<polyline [^>]*>/g)].map(([row]) => row);
};

test("a scalar path wire is two pixel rows out of phase by 2 px, half the 4 px period", () => {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "path-constant", 0, 0);
  const strip = Gr.crearNodo(constant.g, CAT, "strip-path", 160, 0);
  const wired = Gr.conectar(strip.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: strip.id, puerto: "path", dir: "in" });
  assert.equal(wired.motivo, undefined, "a path wires to a path");
  const rows = wireRows(wired.g);
  assert.equal(rows.length, 2, "two pixel rows make the 2 px");
  for (const row of rows) assert.match(row, /stroke="#007f7f" stroke-width="1" stroke-dasharray="3 1"/);
  assert.deepEqual(rows.map((row) => row.match(/stroke-dashoffset="(\d+)"/)[1]), ["1", "3"], "2 px apart: \"##.###.\" over \".###.\"");
});

test("the wire of an array of paths is three pixel rows, the middle one shifted 2 px against the outer ones", () => {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "path-constant", 0, 0);
  const build = Gr.crearNodo(constant.g, CAT, "build-array", 160, 0);
  const wired = Gr.conectar(build.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: build.id, puerto: "element-0", dir: "in" });
  assert.equal(wired.motivo, undefined);
  const indicator = Gr.crearEnPanel(wired.g, CAT, "arr-indicator", 300, 40, "Array", { type: { array: PATH } });
  const withIndicator = Gr.conectar(indicator.g, CAT, { nodo: build.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" });
  const rows = [...html(withIndicator.g).matchAll(/<g class="cable"[^>]*>([\s\S]*?)<\/g>/g)].flatMap(([, wire]) => [...wire.matchAll(/<polyline [^>]*>/g)].map(([row]) => row)).filter((row) => row.includes("stroke-dasharray=\"3 1\"")).slice(-3); // the last wire is the array's; the first is the scalar into Build Array
  assert.deepEqual(rows.map((row) => row.match(/stroke-dashoffset="(\d+)"/)[1]), ["3", "1", "3"], "the outer rows read \".###.###\" and the middle one \"##.###.###\"");
  assert.deepEqual(rows.map((row) => row.match(/translate\(([-\d.]+) /)[1]), ["-1", "0", "1"], "3 px: the rows a pixel apart");
});

// ——— The terminals ———

function panelTerminal(block, compact) {
  let g = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "Path").g;
  const id = g.nodos[0].id;
  if (compact) g = Gr.alternarIcono(g, id);
  return { g, id };
}

test("the terminals are 38 x 38 with View As Icon and 32 x 16 without, control and indicator", () => {
  for (const [block, compact, size] of [["path-control", false, [38, 38]], ["path-indicator", false, [38, 38]], ["path-control", true, [32, 16]], ["path-indicator", true, [32, 16]]]) {
    const { g, id } = panelTerminal(block, compact);
    const box = withBox(g, id);
    assert.deepEqual([box.ancho, box.alto], size, `${block}${compact ? " compact" : ""}`);
  }
});

test("the wire leaves a path control by its arrow and enters a path indicator by its", () => {
  const { g, id } = panelTerminal("path-control", false);
  const box = withBox(g, id);
  const out = D.terminales(g.nodos[0], WINDOWS).find((terminal) => terminal.dir === "out");
  assert.deepEqual([out.x, out.y], [box.x + 38, box.y + 19], "at the right edge, rows 18-19: centred");
  const indicator = panelTerminal("path-indicator", true);
  const into = D.terminales(indicator.g.nodos[0], WINDOWS).find((terminal) => terminal.dir === "in");
  assert.deepEqual([into.x, into.y], [withBox(indicator.g, indicator.id).x, withBox(indicator.g, indicator.id).y + 8]);
});

test("the icon terminal is 38 x 38: the teal frame, the Path pill, the notch tab with the two-box glyph and the outlined arrow", () => {
  const control = G.terminalPath(true, false);
  assert.match(control, /viewBox="0 0 38 38"/);
  assert.match(control, /<rect x="1" y="1" width="36" height="36" fill="var\(--paper\)" stroke="#007f7f" stroke-width="2"\/>/, "a control: 2 px teal, then white");
  assert.match(control, /<rect x="3.5" y="3.5" width="31" height="31" fill="#e2e2e2" stroke="#007f7f" stroke-width="1"\/>/, "1 px teal and the #e2e2e2 plate");
  assert.match(control, /rx="0" fill="#336666"/, "the pill's glyph block");
  assert.match(control, />Path<\/text>/);
  assert.match(control, /<rect x="14" y="5.5" width="18" height="6.5" rx="0" fill="var\(--paper\)"\/>/, "black Path on white for a control");
  assert.match(G.terminalPath(false, false), /<rect x="14" y="5.5" width="18" height="6.5" rx="0" fill="#cccccc"\/>/, "and on #cccccc for an indicator");
  assert.match(control, /<path d="M32.5 14.5 V23.5 L36.5 19 Z" fill="var\(--paper\)" stroke="#000"/, "the arrow at the right edge of a control");
  assert.match(G.terminalPath(false, false), /<path d="M2.5 14.5 V23.5 L6.5 19 Z"/, "and at the left edge of an indicator");
  assert.match(G.terminalPath(false, false), /<rect x="0.5" y="0.5" width="37" height="37" fill="var\(--paper\)" stroke="#007f7f" stroke-width="1"\/>/, "an indicator: 1 px frame");
  assert.match(control, /<polyline points="11.5,37 11.5,29.5 26.5,29.5 26.5,37"/, "the tab at the bottom");
  assert.ok(control.split("shape-rendering=\"crispEdges\"><rect x=\"0.5\" y=\"0.5\" width=\"5\" height=\"4\"/>").length === 3, "the pill and the tab each carry the two boxes");
  const drawn = html(panelTerminal("path-control", false).g);
  assert.match(drawn, /class="glifo-terminal-panel"><svg viewBox="0 0 38 38"/);
});

test("the compact terminal is 32 x 16: 2 px teal, 1 px white and an inner frame round the small glyph, and the 10 x 13 patch at the data end", () => {
  const control = G.terminalPath(true, true);
  assert.match(control, /viewBox="0 0 32 16"/);
  assert.match(control, /<rect x="1" y="1" width="30" height="14" fill="var\(--paper\)" stroke="#007f7f" stroke-width="2"\/>/, "the outer frame");
  assert.match(control, /<rect x="3.5" y="3.5" width="19" height="9" fill="var\(--paper\)" stroke="#007f7f" stroke-width="1"\/>/, "the inner frame, after 1 px of white");
  assert.match(control, /<rect x="22.5" y="1.5" width="9" height="12" fill="#b2d8d8" stroke="#4ca5a5"/, "8 px of #b2d8d8 and a 1 px edge on each side: 10 x 13");
  assert.match(control, /fill="var\(--terminal-direction-arrow\)"/);
  assert.ok(control.includes('translate(9 4)'), "the small glyph, 9 x 8, in the inner frame");
  const indicator = G.terminalPath(false, true);
  assert.ok(indicator.includes('<rect x="0.5" y="1.5" width="9" height="12" fill="#b2d8d8"'), "an indicator is mirrored: the patch is at the left");
  assert.ok(indicator.includes('translate(14 4)'));
});

// ——— The constants ———

const place = (block, x = 0, y = 0, value) => {
  const made = Gr.crearNodo(Gr.nuevo(), CAT, block, x, y);
  return { g: value === undefined ? made.g : Gr.fijarValor(made.g, made.id, value), id: made.id };
};

test("a Path Constant measures 21 x 19 empty and grows to the right with its text, 4 px from its end to the frame", () => {
  const { g, id } = place("path-constant");
  const empty = withBox(g, id);
  assert.deepEqual([empty.ancho, empty.alto], [21, 19], "measured: 21 x 19");
  const typed = withBox(Gr.fijarValor(g, id, fileOn("windows")), id);
  assert.equal(typed.alto, 19);
  assert.equal(typed.ancho, 12 + Math.ceil(WINDOWS.medir(FILE)) + D.MEDIDAS_PATH_CONSTANT.relleno, "the text starts 12 px in and ends 4 px before the right edge, in the width the window measures");
  assert.equal(typed.x, empty.x, "it grows to the right");
  const longValue = pathFromText(`C:\\${"folder\\".repeat(20)}file.txt`, "windows");
  assert.ok(withBox(Gr.fijarValor(g, id, longValue), id).ancho > 400, "a long value is not clipped");
  const measuredInLabVIEW = { ...WINDOWS, medir: () => 49 };
  assert.equal(withBox(Gr.fijarValor(g, id, fileOn("windows")), id, measuredInLabVIEW).ancho, 65, "LabVIEW: C:\\a\\b.txt is 49 px of text in a constant 65 wide");
});

test("a Path Constant's output wire leaves at row 8-9, one row above the centre", () => {
  const { g, id } = place("path-constant", 10, 20, fileOn("windows"));
  const out = D.terminales(g.nodos.find((n) => n.id === id), WINDOWS).find((terminal) => terminal.dir === "out");
  assert.equal(out.y, 20 + 9);
});

test("the Empty Path Constant is 15 x 16 and Not A Path is 17 x 17, on the nodes' pale yellow", () => {
  const empty = place("empty-path-constant");
  assert.deepEqual([withBox(empty.g, empty.id).ancho, withBox(empty.g, empty.id).alto], [15, 16]);
  const notAPath = place("not-a-path-constant");
  assert.deepEqual([withBox(notAPath.g, notAPath.id).ancho, withBox(notAPath.g, notAPath.id).alto], [17, 17]);
  assert.match(html(empty.g), /<div class="constante path-fija path-empty" style="border-color:#007f7f;background:var\(--node-fill\)"><svg/);
  assert.match(html(notAPath.g), /<div class="constante path-fija path-not-a-path" style="border-color:#007f7f;background:var\(--node-fill\)"><svg/);
  assert.notEqual(G.emptyPathGlyph(), G.notAPathGlyph(), "each has a glyph of its own");
  assert.equal(D.CONSTANTES["empty-path-constant"].editable, undefined, "they are not typed into");
  assert.equal(D.CONSTANTES["not-a-path-constant"].editable, undefined);
});

test("a Path Constant draws its glyph and its text in the host's rules, and is typed into", () => {
  const { g, id } = place("path-constant", 0, 0, fileOn("windows"));
  const drawn = html(g);
  assert.match(drawn, /<div class="constante path" style="border-color:#007f7f;--tipo:#007f7f"><span class="path-glifo"><svg/);
  assert.match(drawn, /<span class="path-texto"><span>C:\\a\\b\.txt<\/span><\/span>/);
  assert.match(drawn, new RegExp(`class="nodo[^"]*editable[^"]*" data-nodo="${id}"`));
  assert.match(html(g, POSIX), /<span class="path-texto"><span>\/C\/a\/b\.txt<\/span>/, "the same path with the rules of a POSIX host");
  const emptyDrawn = html(place("path-constant").g);
  assert.doesNotMatch(emptyDrawn, /path-texto/, "no value: the glyph alone");
});

test("typing into a Path Constant reads the text as String To Path does, when Enter confirms", () => {
  const { g, id } = place("path-constant");
  let d = ED.editar({ ...ED.inicial(), g }, WINDOWS, id);
  assert.equal(d.edicion.cadena, undefined, "one line: Enter confirms");
  for (const key of FILE) d = ED.teclear(d, key);
  assert.match(D.contenido(d, WINDOWS, Gr.tipos(d.g, CAT)), /<span class="path-texto"><span>C:\\a\\b\.txt<\/span><span class="caret"><\/span><\/span>/);
  assert.equal(D.caja(d.g.nodos[0], WINDOWS, d.edicion).ancho, 12 + Math.ceil(WINDOWS.medir(FILE)) + 4, "it grows while typed");
  const confirmed = ED.confirmar(d, WINDOWS);
  assert.deepEqual(confirmed.g.nodos[0].config.value, { kind: 0, components: ["C", "a", "b.txt"] });
  assert.equal(confirmed.g.nodos[0].x, 0, "the left edge stays");
  const typeText = (text, ctx) => {
    let typing = ED.editar({ ...ED.inicial(), g }, ctx, id);
    typing = ED.teclear(typing, "Backspace");
    for (const key of text) typing = ED.teclear(typing, key);
    return ED.confirmar(typing, ctx).g.nodos[0].config.value;
  };
  assert.deepEqual(typeText("<Not A Path>", WINDOWS), NOT_A_PATH, "the text of Not A Path is Not A Path");
  assert.deepEqual(typeText("", WINDOWS), EMPTY_PATH, "no text is the empty path");
  assert.deepEqual(typeText("C:\\a\\", WINDOWS), { kind: 0, components: ["C", "a"] }, "a trailing separator never survives");
  assert.deepEqual(typeText("/home/anlaco/f.txt", POSIX), { kind: 0, components: ["home", "anlaco", "f.txt"] }, "the rules are the host's");
});

// ——— The File Path Control and Indicator on the panel ———

const placed = (p, block, point) => P.confirmar(P.pulsar(P.moverA(P.coger(p, block), WINDOWS, point), WINDOWS, { tipo: "fondo" }, point));
const twoObjects = () => placed(placed(P.inicial(), "path-control", { x: 100, y: 100 }), "path-indicator", { x: 400, y: 100 });
const withValue = (p, node, value) => ({ ...p, g: CV.setCurrentValue(p.g, node.id, value) });

test("the control and the indicator are 100 x 25 px, labelled Path, and hold the empty path", () => {
  const p = twoObjects();
  const [control, indicator] = p.g.nodos;
  assert.deepEqual([control.label.text, indicator.label.text], ["Path", "Path 2"]);
  for (const node of p.g.nodos) {
    const box = P.caja(node);
    assert.deepEqual([box.ancho, box.alto], [100, 25], node.tipo);
  }
  assert.deepEqual(CV.currentValue(control), EMPTY_PATH);
  assert.deepEqual(CV.startValue(control), EMPTY_PATH, "a Run starts from the empty path");
});

test("the HTML of the control has the type cell, the field and the browse button; the indicator has no button", () => {
  const p = twoObjects();
  const [control, indicator] = p.g.nodos;
  const drawn = P.contenido(p, WINDOWS);
  assert.match(drawn, new RegExp(`class="objeto-panel sd-control sd-path" data-nodo="${control.id}"`));
  assert.match(drawn, new RegExp(`class="objeto-panel sd-indicator sd-path" data-nodo="${indicator.id}"`));
  assert.match(drawn, /<span class="sd-path-cell"><span class="sd-path-glyph" aria-hidden="true"><svg/);
  assert.match(drawn, new RegExp(`data-casilla="${control.id}"><span class="sd-value"></span></span>`), "an empty path shows blank");
  assert.equal((drawn.match(/data-browse/g) ?? []).length, 1, "only the control has the button");
  assert.match(drawn, /<span class="sd-browse" role="button" aria-label="Browse for path" data-browse><svg/);
  assert.ok(G.browseFolderGlyph().includes('fill="#ffff00"'), "the folder is yellow");
});

test("the panel shows a path with the host's rules, Not A Path as its text and a long path abbreviated", () => {
  let p = twoObjects();
  const [control, indicator] = p.g.nodos;
  p = withValue(p, control, fileOn("windows"));
  assert.match(P.contenido(p, WINDOWS), new RegExp(`data-casilla="${control.id}"><span class="sd-value">C:\\\\a\\\\b\\.txt</span>`));
  assert.match(P.contenido(p, POSIX), new RegExp(`data-casilla="${control.id}"><span class="sd-value">/C/a/b\\.txt</span>`));
  p = withValue(p, indicator, NOT_A_PATH);
  assert.match(P.contenido(p, WINDOWS), new RegExp(`data-casilla="${indicator.id}"><span class="sd-value">&lt;Not A Path&gt;</span>`));
  p = withValue(p, indicator, pathFromText("\\\\server\\share\\a rather long folder name\\f", "windows"));
  const shown = P.contenido(p, WINDOWS).match(new RegExp(`data-casilla="${indicator.id}"><span class="sd-value">([^<]*)</span>`))[1];
  assert.ok(shown.startsWith("...") && shown.endsWith("\\f"), shown);
  assert.ok(shown.length < "\\\\server\\share\\a rather long folder name\\f".length);
});

// The widths of the characters the four measured paths use, in the font of LabVIEW's field (an approximation of Segoe UI at 12 px).
const GLYPH_WIDTHS = { C: 8.2, ":": 3.3, "\\": 5.1, ".": 3.1, r: 4.2, e: 6.6, i: 2.7, l: 2.7, f: 3.7, v: 5.6, c: 5.6, d: 7.3, t: 4, x: 5.4, h: 6.6, " ": 3.3, n: 6.6, a: 5.6, m: 10.1 };
const TEXT_AREA = 81;
const fitsLabVIEWField = (text) => [...text].reduce((sum, character) => sum + (GLYPH_WIDTHS[character] ?? 6.5), 0) <= TEXT_AREA;

test("abbreviatePath keeps the root and the tail, cuts mid-component and shows ...\\... when nothing fits (four measurements)", () => {
  const abbreviated = (text) => abbreviatePath(text, fitsLabVIEWField, "windows");
  assert.equal(abbreviated("C:\\a\\b.txt"), "C:\\a\\b.txt", "a path that fits is shown whole");
  assert.equal(abbreviated("C:\\aaaa\\bbbb\\cccc\\dddd.txt"), "C:\\...\\dddd.txt");
  assert.equal(abbreviated("C:\\one\\two\\three\\file.txt"), "C:\\...ree\\file.txt");
  assert.equal(abbreviated("C:\\one\\two\\three\\four\\five\\file.txt"), "C:\\...ive\\file.txt");
  assert.equal(abbreviated("C:\\one\\two\\three\\four\\five\\six\\file name.txt"), "...\\...", "not even the root, ... and the last component fit");
});

test("abbreviatePath on a POSIX host uses / the same way", () => {
  const fits = (text) => text.length <= 14;
  assert.equal(abbreviatePath("/home/anlaco/file.txt", fits, "posix"), "/...o/file.txt", "the root / stays, then ... and the tail");
  assert.equal(abbreviatePath("/home/anlaco/file.txt", (text) => text.length <= 6, "posix"), ".../...", "nothing fits");
  assert.equal(abbreviatePath("/a/b", fits, "posix"), "/a/b");
});

test("typing a path in the control and pressing Enter stores what String To Path reads", () => {
  let p = twoObjects();
  const control = p.g.nodos[0];
  p = P.editarValor(p, WINDOWS, control.id, true);
  assert.equal(p.edicion.cadena, undefined, "Enter does not add a line");
  for (const key of FILE) p = P.teclear(p, key);
  assert.match(P.contenido(p, WINDOWS), new RegExp(`<span class="sd-value"><span>C:\\\\a\\\\b\\.txt</span><span class="caret">`), "the field takes what is typed, whole");
  p = P.teclear(p, "Enter");
  assert.equal(p.edicion, null, "Enter confirms");
  assert.deepEqual(CV.currentValue(p.g.nodos[0]), { kind: 0, components: ["C", "a", "b", "txt"].slice(0, 2).concat("b.txt") });
  assert.deepEqual(p.g.nodos[0].config.value, EMPTY_PATH, "the default the file saves is not changed");
  const again = P.editarValor(p, WINDOWS, control.id, true);
  assert.equal(again.edicion.texto, FILE, "the text to edit is the whole path");
  const untouched = P.confirmar(again);
  assert.deepEqual(CV.currentValue(untouched.g.nodos[0]), { kind: 0, components: ["C", "a", "b.txt"] }, "confirming it untouched keeps the value");
  const notAPath = (() => {
    let q = P.editarValor(p, WINDOWS, control.id, true);
    for (const key of "<Not A Path>") q = P.teclear(q, key);
    return CV.currentValue(P.confirmar(q).g.nodos[0]);
  })();
  assert.deepEqual(notAPath, NOT_A_PATH);
  const posix = P.confirmar(((q) => { for (const key of "/tmp/x") q = P.teclear(q, key); return q; })(P.editarValor(twoObjects(), POSIX, control.id, true)));
  assert.deepEqual(CV.currentValue(posix.g.nodos[0]), { kind: 0, components: ["tmp", "x"] }, "the control reads the text with the rules of its window");
});

test("a press inside the field of the control types in it, and the indicator is not typed into", () => {
  const p = twoObjects();
  const [control, indicator] = p.g.nodos;
  const middle = (n) => ({ x: P.caja(n).x + 50, y: P.caja(n).y + 13 });
  assert.equal(P.pulsar(p, WINDOWS, { tipo: "casilla", id: control.id }, middle(control)).edicion?.nodo, control.id);
  assert.equal(P.pulsar(p, WINDOWS, { tipo: "casilla", id: indicator.id }, middle(indicator)).edicion, null);
});

test("the browse button sets the control's current value to the path chosen", () => {
  const p = twoObjects();
  const control = p.g.nodos[0];
  const chosen = P.fijarRuta({ ...p, valores: { [control.id]: "stale" } }, control.id, fileOn("windows"));
  assert.deepEqual(CV.currentValue(chosen.g.nodos[0]), { kind: 0, components: ["C", "a", "b.txt"] });
  assert.equal(chosen.valores[control.id], undefined);
});

test("the Electron bridge offers the file dialog to the browse button", () => {
  const read = (name) => readFileSync(new URL(`../../editor/electron/${name}`, import.meta.url), "utf8");
  assert.match(read("preload.cjs"), /elegirRuta: \(\) => ipcRenderer\.invoke\("path:choose"\)/);
  assert.match(read("main.mjs"), /ipcMain\.handle\("path:choose"[\s\S]*showOpenDialog/);
});

// ——— The values of a Run ———

test("after a Run the indicator shows the path the runtime gave it, with the host's rules", () => {
  const p = twoObjects();
  const indicator = p.g.nodos[1];
  assert.equal(RV.isIndicator(indicator), true);
  assert.equal(RV.isIndicator(p.g.nodos[0]), false);
  const during = { ...p, valores: { [indicator.id]: fileOn("windows") } };
  assert.match(P.contenido(during, WINDOWS), new RegExp(`data-casilla="${indicator.id}"><span class="sd-value">C:\\\\a\\\\b\\.txt</span>`));
  const after = RV.afterRun(p.g, { [indicator.id]: { kind: 0, components: ["C", "a", "b.txt"] } });
  assert.deepEqual(CV.currentValue(after.graph.nodos[1]), { kind: 0, components: ["C", "a", "b.txt"] });
  assert.deepEqual(after.shownValues, {});
  assert.equal(RV.afterRun(after.graph, { [indicator.id]: { kind: 0, components: ["C", "a", "b.txt"] } }).graph, after.graph, "the same path is not a change");
});

// ——— Saving and opening ———

test("a VI with a path control, an indicator and the three constants round-trips through the .sdg", () => {
  let g = Gr.crearEnPanel(Gr.nuevo(), CAT, "path-control", 20, 20, "Path").g;
  g = Gr.crearEnPanel(g, CAT, "path-indicator", 200, 20, "Path 2").g;
  const constant = Gr.crearNodo(g, CAT, "path-constant", 10, 200);
  g = Gr.fijarValor(constant.g, constant.id, fileOn("windows"));
  g = Gr.crearNodo(g, CAT, "empty-path-constant", 10, 300).g;
  g = Gr.crearNodo(g, CAT, "not-a-path-constant", 10, 400).g;
  g = CV.setCurrentValue(g, g.nodos[0].id, fileOn("windows"));
  const text = aTexto(g, CAT);
  const reopened = leer(JSON.parse(text), CAT);
  assert.equal(aTexto(reopened, CAT), text, "saving what was opened gives the same file");
  assert.deepEqual(reopened.nodos.map((n) => n.tipo), ["path-control", "path-indicator", "path-constant", "empty-path-constant", "not-a-path-constant"]);
  assert.deepEqual(reopened.nodos[2].config.value, { kind: 0, components: ["C", "a", "b.txt"] }, "the constant's value is its kind and components");
  assert.deepEqual(CV.currentValue(reopened.nodos[0]), EMPTY_PATH, "a current value is not saved");
  assert.ok(D.contenido({ ...ED.inicial(), g: reopened }, WINDOWS, Gr.tipos(reopened, CAT)).includes("path-texto"), "and the reopened constant draws");
});

// ——— The panel styles ———

test("every panel style dresses the File Path Control and Indicator", () => {
  const dir = new URL("../../editor/src/panel-styles/", import.meta.url);
  const sheet = (name) => readFileSync(new URL(name, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(HC.PLAIN_KINDS.includes("path"));
  assert.ok(HC.ORNAMENT_CLASSES.includes("sd-path-glyph"));
  assert.match(sheet("plain.css"), /\.sd-panel \.sd-path\b/);
  assert.match(sheet("plain.css"), /\.sd-panel \.sd-path-glyph \{ display: none; \}/, "the glyph is ornament in Plain");
  assert.match(sheet("plain.css"), /\.sd-panel \.sd-browse \{[^}]*left: calc\(100% \+ 2px\)[^}]*width: 28px; height: 17px/, "outside the box, 2 px to its right");
  assert.match(sheet("old-school.css"), /\.sd-panel \.sd-path-glyph \{[^}]*display: block/, "Old School draws it");
  assert.match(sheet("solder.css"), /\.sd-panel \.sd-path \.sd-browse/);
});

test("Old School's File Path Control has the measured bevel, cell, divider, text areas and button", () => {
  const css = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector) => css.match(new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]*)\\}`))[1];
  assert.match(rule(".sd-panel .sd-path-cell"), /left: 4px; top: 4px; display: block; width: 8px; height: 17px; background: #b3b3b3/);
  assert.match(rule(".sd-panel .sd-path .sd-field"), /left: 13px; top: 4px; width: 83px; height: 17px; padding: 0 0 0 2px[^}]*background: #fafafa/, "the divider is the 1 px at x = 12");
  assert.match(rule(".sd-panel .sd-path.sd-indicator .sd-field"), /background: #d2d2d2/);
  assert.match(rule(".sd-panel .sd-path-glyph"), /left: 1px; top: 3px; display: block; width: 6px; height: 10px/, "the glyph is black, 6 x 10, at y +7..+16 of the box");
  assert.match(rule(".sd-panel .sd-browse"), /left: 102px; top: 0; width: 28px; height: 17px[^}]*background: linear-gradient\(#cbcbcb, #c2c2c2\)/, "top-aligned with the box, a vertical gradient");
  const bevel = rule(".sd-panel .sd-path");
  assert.deepEqual([...bevel.matchAll(/inset 0 (\d)px 0 (#[0-9a-f]{6})/g)].map(([, , color]) => color), ["#c9c9c9", "#c2c2c2", "#b7b7b7", "#b1b1b1"], "top rows 1-4");
  assert.deepEqual([...bevel.matchAll(/inset 0 -(\d)px 0 (#[0-9a-f]{6})/g)].map(([, , color]) => color), ["#e4e4e4", "#f2f2f2", "#ededed", "#eaeaea"], "bottom rows 1-4, from the edge in");
  assert.deepEqual([...bevel.matchAll(/inset -(\d)px 0 0 (#[0-9a-f]{6})/g)].map(([, , color]) => color), ["#eeeeee", "#f2f2f2", "#ededed", "#e0e0e0"], "right columns 1-4, from the edge in");
  assert.deepEqual([...bevel.matchAll(/inset (\d)px 0 0 (#[0-9a-f]{6})/g)].map(([, , color]) => color), ["#c9c9c9", "#c2c2c2", "#b7b7b7", "#b1b1b1"], "left columns 1-4");
  assert.equal(P.MEDIDAS_PATH_PANEL.ancho, 100);
  assert.equal(P.MEDIDAS_PATH_PANEL.botonAncho, 28);
});

// ——— Glyphs, label and Ctrl+A ———

test("the Empty Path glyph is an anchor and Not A Path's has two squares and an X; each is its own drawing", () => {
  assert.match(G.emptyPathGlyph(TEAL), /M4\.5 1V8.*M2\.5 2\.5H6\.5/, "a stem and a crossbar at the top");
  assert.match(G.emptyPathGlyph(TEAL), /Q4\.5 10/, "and the curve of the feet");
  assert.doesNotMatch(G.emptyPathGlyph(TEAL), /circle/, "no ring with a slash any more");
  const notAPath = G.notAPathGlyph(TEAL);
  assert.equal((notAPath.match(/<rect /g) ?? []).length, 2, "a small square at the top left and one at the bottom right");
  assert.match(notAPath, /M3\.5 3\.5L7\.5 7\.5M3\.5 7\.5L7\.5 3\.5/, "crossed by an X");
});

test("the type cell's glyph is 6 x 10 and Not A Path crosses it", () => {
  assert.match(G.pathCellGlyph(false), /viewBox="0 0 6 10"/);
  assert.doesNotMatch(G.pathCellGlyph(false), /M0\.5 9\.5L5\.5 0\.5/);
  assert.match(G.pathCellGlyph(true), /M0\.5 9\.5L5\.5 0\.5M0\.5 0\.5L5\.5 9\.5/);
  let p = twoObjects();
  const [control, indicator] = p.g.nodos;
  p = withValue(withValue(p, control, fileOn("windows")), indicator, NOT_A_PATH);
  const drawn = P.contenido(p, WINDOWS);
  const cells = [...drawn.matchAll(/<span class="sd-path-glyph" aria-hidden="true">(<svg.*?<\/svg>)<\/span>/g)].map(([, glyph]) => glyph);
  assert.equal(cells.length, 2);
  assert.equal(cells[0], G.pathCellGlyph(false), "a path: the normal glyph");
  assert.equal(cells[1], G.pathCellGlyph(true), "Not A Path: the crossed variant");
});

test("the browse folder is open: a yellow back flap and a #666666 front, outlined in black", () => {
  const folder = G.browseFolderGlyph();
  assert.match(folder, /fill="#ffff00" stroke="#000"/);
  assert.match(folder, /fill="#666666" stroke="#000"/);
});

test("a path's label sits 1 px higher than a numeric's", () => {
  assert.equal(P.cajaObjeto("path-control", 0, 0).separacion, 3);
  assert.equal(P.cajaObjeto("control", 0, 0).separacion, undefined, "a numeric keeps the default gap");
});

test("Ctrl+A while typing in a control's box or a constant selects all its text; the next key replaces it", () => {
  const p = twoObjects();
  const control = p.g.nodos[0];
  let typing = P.editarValor(p, WINDOWS, control.id, false);
  for (const key of "C:\\x") typing = P.teclear(typing, key);
  assert.equal(typing.edicion.todo, false);
  const selected = P.seleccionarTodoTexto(typing);
  assert.equal(selected.edicion.todo, true);
  assert.equal(selected.edicion.texto, "C:\\x", "the text is kept");
  assert.equal(P.teclear(selected, "D").edicion.texto, "D", "typing replaces the selection");
  assert.equal(P.seleccionarTodoTexto(p), p, "nothing being typed: nothing happens");
  const string = placed(P.inicial(), "str-control", { x: 100, y: 200 });
  let stringTyping = P.editarValor(string, WINDOWS, string.g.nodos[0].id, false);
  for (const key of "abc") stringTyping = P.teclear(stringTyping, key);
  assert.equal(P.teclear(P.seleccionarTodoTexto(stringTyping), "z").edicion.texto, "z", "a string control too");
  const { g, id } = place("path-constant", 0, 0, fileOn("windows"));
  const constantTyping = ED.editar({ ...ED.inicial(), g }, WINDOWS, id);
  const afterClick = { ...constantTyping, edicion: { ...constantTyping.edicion, todo: false } };
  assert.equal(ED.teclear(ED.seleccionarTodoTexto(afterClick), "X").edicion.texto, "X", "a constant on the diagram");
});
