// The right-click menus of the path objects (DT-067 §10 (a)): the File Path Control and Indicator on the panel, their terminals
// on the diagram and the Path, Empty Path and Not A Path constants. Rows, their order and their separators come from
// labview-captures/reports/2026-10-26-path-type.md §1 and §2 (local evidence, never committed). What was not read is
// unverified: the indicator's menu below its first rows, the terminal indicator's labels and the Not A Path Constant's rows.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { EMPTY_PATH, pathFromText } from "../../core/model/paths.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const labels = (root) => INV.hijos(root).map((e) => e.etiqueta);
const separated = (root) => INV.hijos(root).filter((e) => e.separado).map((e) => e.etiqueta);
const FILE = pathFromText("C:\\a\\b.txt", "windows");

/** A panel with one object of `block`, and the open menu of the diagram or the panel on it. */
function panelObject(block) {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "Path");
  return { g: placed.g, id: placed.id };
}
const panelMenu = (block, root) => {
  const { g, id } = panelObject(block);
  return { g, id, menu: ED.abrirMenu({ ...P.inicial(), g }, root, id, 0, 0) };
};
const diagramMenu = (block, root) => {
  const placed = Gr.crearNodo(Gr.nuevo(), CAT, block, 0, 0);
  return { g: placed.g, id: placed.id, menu: ED.abrirMenu({ ...ED.inicial(), g: placed.g }, root, placed.id, 0, 0) };
};

// ——— The File Path Control and Indicator on the panel ———

test("the File Path Control has its measured menu on the panel", () => {
  const root = "context.path-control";
  assert.deepEqual(labels(root), ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "Create", "Replace",
    "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "Browse Options...", "Properties"]);
  assert.deepEqual(separated(root), ["Make Type Def.", "Description and Tip...", "Create", "Browse Options...", "Properties"]);
  assert.deepEqual(labels(`${root}.visible-items`), ["Label", "Caption", "Scrollbar", "Browse Button"]);
  assert.deepEqual(labels(`${root}.create`), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  assert.deepEqual(labels(`${root}.data-operations`), ["Reinitialize to Default Value", "Make Current Value Default", "Cut Data", "Copy Data", "Paste Data"]);
  assert.deepEqual(separated(`${root}.data-operations`), ["Cut Data"]);
  assert.deepEqual(labels(`${root}.advanced`), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "Hide Control", "Enabled State", "Allow Dropping"]);
  assert.deepEqual(separated(`${root}.advanced`), ["Hide Control"]);
  // Both the control and the indicator open it.
  for (const block of ["path-control", "path-indicator"]) {
    const { g, id } = panelObject(block);
    assert.equal(P.menuDe(g.nodos.find((n) => n.id === id)), root, block);
  }
  // Allow Dropping and the browse button are ticked on a control; the indicator's browse button is not (it is greyed there).
  const control = panelMenu("path-control", root);
  const controlMarks = ED.marcados(control.menu, CTX);
  assert.ok(controlMarks.has(`${root}.advanced.allow-dropping`) && controlMarks.has(`${root}.visible-items.browse-button`));
  const indicator = panelMenu("path-indicator", root);
  const indicatorMarks = ED.marcados(indicator.menu, CTX);
  assert.ok(indicatorMarks.has(`${root}.advanced.allow-dropping`) && !indicatorMarks.has(`${root}.visible-items.browse-button`));
  // The indicator's first rows say Change to Control (reports/2026-10-26-path-type.md §1).
  assert.equal(ED.variantes(indicator.menu, CTX).rotulos.get(`${root}.change-to-indicator`), "Change to Control");
  assert.equal(ED.variantes(control.menu, CTX).rotulos?.get(`${root}.change-to-indicator`), undefined);
  // The rows that open a submenu draw their arrow, also the ones whose contents are not declared (Replace).
  const html = D.menuContextual(INV, indicator.menu.menu, indicatorMarks, undefined, ED.variantes(indicator.menu, CTX));
  assert.match(html, /Change to Control/);
  assert.equal((html.match(/flecha-menu/g) ?? []).length, 5, "Visible Items, Create, Replace, Data Operations and Advanced open submenus");
});

test("Browse Options of a File Path Control is a greyed row that names its reason", () => {
  const entry = INV.entrada("context.path-control.browse-options");
  assert.ok(esHueco(entry));
  assert.equal(entry.necesita, "opciones-de-ruta");
  assert.match(INV.explicacion(entry).solder, /Browse Options of a File Path Control/);
  assert.match(INV.explicacion(entry).labview, /pattern/);
});

test("Data Operations of a path control makes its current value its default", () => {
  for (const [block, root] of [["path-control", "context.path-control"], ["path-control", "context.path-control-terminal"], ["path-indicator", "context.path-control-terminal"]]) {
    const { g, id } = panelObject(block);
    const withValue = CV.setCurrentValue(g, id, FILE);
    const open = (graph) => ED.abrirMenu({ ...ED.inicial(), g: graph }, root, id, 0, 0);
    const made = ED.orden(open(withValue), `${root}.data-operations.make-current-value-default`, CTX);
    assert.deepEqual(made.g.nodos[0].config.value, FILE, `${block}: the current value is the default`);
    const other = CV.setCurrentValue(made.g, id, pathFromText("D:\\other", "windows"));
    const back = ED.orden(open(other), `${root}.data-operations.reinitialize-to-default-value`, CTX);
    assert.deepEqual(CV.currentValue(back.g.nodos[0]), FILE, `${block}: reinitialized to the default`);
  }
  const fresh = CV.currentValue(panelObject("path-control").g.nodos[0]);
  assert.deepEqual(fresh, EMPTY_PATH);
  for (const root of ["context.path-control", "context.path-control-terminal"]) {
    assert.equal(INV.entrada(`${root}.data-operations.make-current-value-default`).estado, "built", root);
    assert.equal(INV.entrada(`${root}.data-operations.reinitialize-to-default-value`).estado, "built", root);
  }
});

// ——— The terminals on the diagram ———

test("the terminals of a path have their measured menus", () => {
  const root = "context.path-control-terminal";
  assert.deepEqual(labels(root), ["Visible Items", "Find Control", "Make Type Def.", "Hide Control", "Change to Indicator", "Change to Array", "Change to Constant",
    "Description and Tip...", "File I/O Palette", "Create", "Data Operations", "Advanced", "View As Icon", "Properties"]);
  assert.deepEqual(separated(root), ["Make Type Def.", "Hide Control", "File I/O Palette", "View As Icon", "Properties"]);
  assert.deepEqual(INV.hijos(root).filter((e) => !esHueco(e)).map((e) => ultimo(e.id)), ["data-operations", "view-as-icon"], "what is done: Data Operations and View As Icon");
  for (const block of ["path-control", "path-indicator"]) {
    const { g, id } = panelObject(block);
    assert.equal(D.menuDe(g.nodos.find((n) => n.id === id), null, g), root, block);
  }
  // The control says Find Control, Hide Control and Change to Indicator; the indicator's follow the other indicator terminals (unverified).
  const control = ED.variantes(panelMenu("path-control", root).menu, CTX);
  assert.equal(control.rotulos?.size ?? 0, 0);
  const indicator = ED.variantes(panelMenu("path-indicator", root).menu, CTX);
  assert.deepEqual([...indicator.rotulos], [[`${root}.change-to-indicator`, "Change to Control"], [`${root}.find-control`, "Find Indicator"], [`${root}.hide-control`, "Hide Indicator"]]);
  // File I/O Palette opens a submenu, which is not declared yet.
  const menu = panelMenu("path-control", root).menu;
  const html = D.menuContextual(INV, menu.menu, ED.marcados(menu, CTX), undefined, ED.variantes(menu, CTX));
  const row = html.match(/<div class="item-menu hueco" data-id="context\.path-control-terminal\.file-i-o-palette"[^>]*>(.*?)<\/div>/)[1];
  assert.match(row, /flecha-menu/);
  assert.equal(INV.entrada(`${root}.file-i-o-palette`).necesita, "paleta-archivos-en-menu");
});

test("View As Icon of the terminal of a path switches between 38 x 38 and 32 x 16", () => {
  const root = "context.path-control-terminal";
  const { g, id } = panelObject("path-control");
  const menu = ED.abrirMenu({ ...ED.inicial(), g }, root, id, 0, 0);
  assert.ok(ED.marcados(menu, CTX).has(`${root}.view-as-icon`), "ticked while the icon shows");
  const flipped = ED.orden(menu, `${root}.view-as-icon`, CTX);
  assert.equal(flipped.g.nodos[0].vista.compacto, true);
  const box = D.caja(flipped.g.nodos[0], CTX);
  assert.deepEqual([box.ancho, box.alto], [32, 16]);
  assert.ok(!ED.marcados(ED.abrirMenu({ ...ED.inicial(), g: flipped.g }, root, id, 0, 0), CTX).has(`${root}.view-as-icon`), "unticked once compact");
  assert.equal(INV.entrada(`${root}.view-as-icon`).estado, "built");
});

test("the menu of a path wire names the File I/O Palette, and a numeric wire keeps Numeric Palette", () => {
  const wired = (constantBlock, sink, sinkPort) => {
    const constant = Gr.crearNodo(Gr.nuevo(), CAT, constantBlock, 0, 0);
    const target = Gr.crearNodo(constant.g, CAT, sink, 100, 0);
    const g = Gr.conectar(target.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: target.id, puerto: sinkPort, dir: "in" }).g;
    return ED.abrirMenu({ ...ED.inicial(), g }, ED.WIRE_MENU_ROOT, g.cables[0].id, 0, 0);
  };
  const paletteRow = `${ED.WIRE_MENU_ROOT}.numeric-palette`;
  assert.equal(ED.variantes(wired("path-constant", "strip-path", "path"), CTX).rotulos.get(paletteRow), "File I/O Palette");
  assert.equal(ED.variantes(wired("const", "add", "a"), CTX).rotulos.get(paletteRow), undefined);
});

// ——— The constants ———

test("the Path Constant has its measured menu", () => {
  const root = "context.path-constant";
  assert.deepEqual(labels(root), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "File I/O Palette", "Create",
    "Replace", "Data Operations", "Advanced", "Size To Text", "Left Justify Text", "Right Justify Text", "Browse for Path...", "Properties"]);
  assert.deepEqual(separated(root), ["Make Type Def.", "Description and Tip...", "File I/O Palette", "Size To Text", "Browse for Path...", "Properties"]);
  const { g, id } = diagramMenu("path-constant", root);
  assert.equal(D.menuDe(g.nodos.find((n) => n.id === id), null, g), root);
  const marks = ED.marcados(diagramMenu("path-constant", root).menu, CTX);
  assert.ok(marks.has(`${root}.size-to-text`) && marks.has(`${root}.left-justify-text`) && !marks.has(`${root}.right-justify-text`), "Size To Text and Left Justify Text are ticked");
  assert.ok(INV.hijos(root).every((e) => esHueco(e) || e.id === root), "nothing of it is done yet");
  assert.equal(INV.entrada("context.path-constant.browse-for-path").necesita, "dialogos-de-archivo");
});

test("the Empty Path Constant and the Not A Path Constant have their menus", () => {
  const empty = "context.empty-path-constant";
  assert.deepEqual(labels(empty), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Description and Tip...", "File I/O Palette", "Create", "Replace",
    "Data Operations", "Advanced", "Properties"]);
  assert.deepEqual(separated(empty), ["Description and Tip...", "File I/O Palette", "Properties"]);
  const notAPath = "context.not-a-path-constant";
  assert.deepEqual(labels(notAPath), labels(empty), "the same rows as the Empty Path Constant's: only its height and row count were read, so the words are unverified");
  assert.equal(INV.entrada(notAPath).captura, undefined, "unverified: no capture of its words");
  for (const [block, root] of [["empty-path-constant", empty], ["not-a-path-constant", notAPath]]) {
    const { g, id } = diagramMenu(block, root);
    assert.equal(D.menuDe(g.nodos.find((n) => n.id === id), null, g), root, block);
  }
});

test("every greyed row of the path menus says what is missing", () => {
  const holes = INV.entradas.filter((e) => /^context\.(path-|empty-path-|not-a-path-)/.test(e.id) && esHueco(e));
  assert.ok(holes.length > 60);
  for (const hole of holes) {
    const { labview, solder } = INV.explicacion(hole);
    assert.ok(labview && /^Missing: /.test(solder), hole.id);
  }
});
