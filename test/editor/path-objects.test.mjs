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

test("a scalar path wire is two pixel rows, the second shifted 1 px", () => {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "path-constant", 0, 0);
  const strip = Gr.crearNodo(constant.g, CAT, "strip-path", 160, 0);
  const wired = Gr.conectar(strip.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: strip.id, puerto: "path", dir: "in" });
  assert.equal(wired.motivo, undefined, "a path wires to a path");
  const rows = wireRows(wired.g);
  assert.equal(rows.length, 2, "two pixel rows make the 2 px");
  for (const row of rows) assert.match(row, /stroke="#007f7f" stroke-width="1" stroke-dasharray="3 1"/);
  assert.deepEqual(rows.map((row) => row.match(/stroke-dashoffset="(\d+)"/)[1]), ["0", "1"]);
});

test("the wire of an array of paths is three pixel rows, #.###. / ###.### / #.###.", () => {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "path-constant", 0, 0);
  const build = Gr.crearNodo(constant.g, CAT, "build-array", 160, 0);
  const wired = Gr.conectar(build.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: build.id, puerto: "element-0", dir: "in" });
  assert.equal(wired.motivo, undefined);
  const indicator = Gr.crearEnPanel(wired.g, CAT, "arr-indicator", 300, 40, "Array", { type: { array: PATH } });
  const withIndicator = Gr.conectar(indicator.g, CAT, { nodo: build.id, puerto: "result", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" });
  const rows = [...html(withIndicator.g).matchAll(/<g class="cable"[^>]*>([\s\S]*?)<\/g>/g)].flatMap(([, wire]) => [...wire.matchAll(/<polyline [^>]*>/g)].map(([row]) => row)).filter((row) => row.includes("stroke-dasharray=\"3 1\"")).slice(-3); // the last wire is the array's; the first is the scalar into Build Array
  assert.deepEqual(rows.map((row) => row.match(/stroke-dashoffset="(\d+)"/)[1]), ["2", "0", "2"], "the outer rows start two pixels into the pattern");
  assert.deepEqual(rows.map((row) => row.match(/translate\(([-\d.]+) /)[1]), ["-1", "0", "1"], "3 px: the rows a pixel apart");
});

// ——— The terminals ———

function panelTerminal(block, compact) {
  let g = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "Path").g;
  const id = g.nodos[0].id;
  if (compact) g = Gr.alternarIcono(g, id);
  return { g, id };
}

test("the terminals are 32 x 32 with View As Icon and 33 x 16 without, control and indicator", () => {
  for (const [block, compact, size] of [["path-control", false, [32, 32]], ["path-indicator", false, [32, 32]], ["path-control", true, [33, 16]], ["path-indicator", true, [33, 16]]]) {
    const { g, id } = panelTerminal(block, compact);
    const box = withBox(g, id);
    assert.deepEqual([box.ancho, box.alto], size, `${block}${compact ? " compact" : ""}`);
  }
});

test("the wire leaves a path control by its arrow and enters a path indicator by its", () => {
  const { g, id } = panelTerminal("path-control", false);
  const box = withBox(g, id);
  const out = D.terminales(g.nodos[0], WINDOWS).find((terminal) => terminal.dir === "out");
  assert.deepEqual([out.x, out.y], [box.x + 32, box.y + 22], "at the right edge, level with the arrow");
  const indicator = panelTerminal("path-indicator", true);
  const into = D.terminales(indicator.g.nodos[0], WINDOWS).find((terminal) => terminal.dir === "in");
  assert.deepEqual([into.x, into.y], [withBox(indicator.g, indicator.id).x, withBox(indicator.g, indicator.id).y + 8]);
});

test("the icon terminal has the teal frame, the word Path and the two-box glyph", () => {
  const control = G.terminalPath(true, false);
  assert.match(control, /viewBox="0 0 32 32"/);
  assert.match(control, /<rect x="1" y="1" width="30" height="30" fill="var\(--paper\)" stroke="#007f7f" stroke-width="2"\/>/, "a control: 2 px frame");
  assert.match(control, />Path<\/text>/);
  assert.equal((control.match(/<rect x="0.5" y="0.5" width="5" height="4"\/>/g) ?? []).length, 2, "the picture and the tab at the bottom each carry the two boxes");
  assert.match(G.terminalPath(false, false), /<rect x="0.5" y="0.5" width="31" height="31" fill="var\(--paper\)" stroke="#007f7f" stroke-width="1"\/>/, "an indicator: 1 px frame");
  const drawn = html(panelTerminal("path-control", false).g);
  assert.match(drawn, /class="glifo-terminal-panel"><svg viewBox="0 0 32 32"/);
});

test("the compact terminal is white with a 2 px teal frame, the small glyph and the light teal patch with the arrow", () => {
  const control = G.terminalPath(true, true);
  assert.match(control, /viewBox="0 0 33 16"/);
  assert.match(control, /<rect x="1" y="1" width="31" height="14" fill="var\(--paper\)" stroke="#007f7f" stroke-width="2"\/>/);
  assert.match(control, /fill="#b2d8d8"/);
  assert.match(control, /fill="var\(--terminal-direction-arrow\)"/);
  assert.ok(control.indexOf("translate(5 ") > 0 && control.indexOf('x="22.5"') > 0, "the glyph at the left and the patch at the data end");
  assert.ok(G.terminalPath(false, true).includes('<rect x="0.5" y="2.5" width="10" height="11" fill="#b2d8d8"'), "an indicator's patch is at the left");
});

// ——— The constants ———

const place = (block, x = 0, y = 0, value) => {
  const made = Gr.crearNodo(Gr.nuevo(), CAT, block, x, y);
  return { g: value === undefined ? made.g : Gr.fijarValor(made.g, made.id, value), id: made.id };
};

test("a Path Constant measures 21 x 19 empty and grows to the right with its text", () => {
  const { g, id } = place("path-constant");
  const empty = withBox(g, id);
  assert.deepEqual([empty.ancho, empty.alto], [21, 19], "measured: 21 x 19");
  const typed = withBox(Gr.fijarValor(g, id, fileOn("windows")), id);
  assert.equal(typed.alto, 19);
  assert.equal(typed.ancho, 21 + D.anchoTexto(FILE) + D.MEDIDAS_PATH_CONSTANT.relleno, "the glyph, the text and its padding (LabVIEW's 65 depends on its font)");
  assert.equal(typed.x, empty.x, "it grows to the right");
  const long = withBox(Gr.fijarValor(g, id, pathFromText(`C:\\${"folder\\".repeat(20)}file.txt`, "windows")), id);
  assert.ok(long.ancho > 400, "a long value is not clipped");
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
  assert.equal(D.caja(d.g.nodos[0], WINDOWS, d.edicion).ancho, 21 + D.anchoTexto(FILE) + 2, "it grows while typed");
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
  assert.ok(shown.startsWith("...\\") && shown.endsWith("\\f"), shown);
  assert.ok(shown.length < "\\\\server\\share\\a rather long folder name\\f".length);
});

test("abbreviatePath keeps the trailing components that fit behind a leading ...", () => {
  const fits = (text) => text.length <= 12;
  assert.equal(abbreviatePath("C:\\a\\b", fits, "windows"), "C:\\a\\b", "a path that fits is shown whole");
  assert.equal(abbreviatePath("C:\\aaa\\bbb\\cc\\f", fits, "windows"), "...\\bbb\\cc\\f");
  assert.equal(abbreviatePath("\\\\server\\share\\f", (text) => text.length <= 6, "windows"), "...\\f");
  assert.equal(abbreviatePath("/home/anlaco/file.txt", (text) => text.length <= 12, "posix"), "...\\file.txt".replace("\\", "/"));
  assert.equal(abbreviatePath("C:\\a very long folder name", () => false, "windows"), "...\\a very long folder name", "the last component stays even when it does not fit");
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
  assert.match(rule(".sd-panel .sd-browse"), /left: 102px; top: 4px; width: 28px; height: 17px[^}]*background: #c3c3c3/);
  assert.match(rule(".sd-panel .sd-path"), /#c9c9c9[\s\S]*#d3d3d3[\s\S]*#eaeaea[\s\S]*#c2c2c2[\s\S]*#b7b7b7[\s\S]*#adadad[\s\S]*#f2f2f2[\s\S]*#b1b1b1[\s\S]*#eeeeee/, "the four rows of the bevel");
  assert.equal(P.MEDIDAS_PATH_PANEL.ancho, 100);
  assert.equal(P.MEDIDAS_PATH_PANEL.botonAncho, 28);
});
