// The Polymorphic OVI window (DT-074 §5): its controls at the measured rectangles, its list, its buttons, its dialog,
// its menu bar, and how it is saved and opened. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-05-polymorphic-window.md). The state is pure and the view is a string, so none of it
// needs a browser or Electron.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as Paths from "../../editor/src/common/vi-paths.mjs";
import * as Poly from "../../core/model/polymorphic.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as Registry from "../../editor/electron/vi-registry.mjs";
import * as State from "../../editor/src/polymorphic-window/polymorphic-window-state.mjs";
import * as View from "../../editor/src/polymorphic-window/polymorphic-window-view.mjs";
import * as E from "../../editor/src/window/window-state.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { CAT, INV, RAIZ, buildVI } from "../helpers.mjs";

const measure = (text) => text.length * 6;
const windowSize = { width: 482, height: 358 };
const draw = (state) => View.polymorphicWindow(INV, state, measure, windowSize);
const PREFIX = "window.polymorphic-ovi";
const TITLE_BAR = 33;

/** The `x, y, width, height` of the element with `data-id`, in page pixels. */
function rectOf(html, id) {
  const match = html.match(new RegExp(`data-id="${id.replaceAll(".", "\\.")}" style="left:(-?[\\d.]+)px;top:(-?[\\d.]+)px;width:([\\d.]+)px;height:([\\d.]+)px"`));
  assert.ok(match, `${id} is drawn with a rectangle`);
  return match.slice(1).map(Number);
}
/** The same, with the y of the whole window (title bar included), as the report gives it. */
const windowRect = (html, id) => {
  const [x, y, width, height] = rectOf(html, id);
  return [x, y + TITLE_BAR, width, height];
};
const withInstances = (state, ...paths) => paths.reduce(State.addInstance, state);

test("the Polymorphic OVI window has its controls at the measured rectangles and opens empty with LabVIEW's options", () => {
  assert.deepEqual([View.WINDOW_SIZE.width, View.WINDOW_SIZE.height], [482, 391]);
  const state = State.emptyState();
  const html = draw(state);
  // x, y, width, height in window pixels, from the report's p1.png.
  const measured = {
    "empty-marker": [8, 68, 27, 25],
    "edit-icon": [314, 75, 108, 23],
    icon: [427, 70, 32, 32],
    instances: [9, 114, 418, 145],
    "move-up": [432, 158, 27, 25],
    "move-down": [432, 187, 27, 25],
    add: [60, 265, 108, 23],
    remove: [176, 265, 108, 23],
    "edit-name": [292, 265, 108, 23],
    help: [371, 329, 58, 21],
  };
  for (const [id, rectangle] of Object.entries(measured)) assert.deepEqual(windowRect(html, `${PREFIX}.${id}`), rectangle, id);
  const at = (id) => {
    const origin = html.match(new RegExp(`data-id="${PREFIX}\\.${id}" style="left:(-?[\\d.]+)px;top:(-?[\\d.]+)px"`));
    assert.ok(origin, `${id} is drawn at a point`);
    return [Number(origin[1]), Number(origin[2]) + TITLE_BAR];
  };
  assert.deepEqual(at("draw-polymorphic-icon").concat(at("draw-instance-icon")), [9, 320, 9, 340], "the two radios");
  assert.deepEqual(at("show-selector-by-default").concat(at("allow-adapt")), [201, 321, 201, 341], "the two checkboxes");
  assert.match(html, /<div class="po-label" style="left:10px;top:68px">Instance OVIs<\/div>/, "the label at 10,101");
  assert.match(html, /<div class="po-label" style="left:11px;top:269px">Block Diagram Appearance:<\/div>/, "the label at 11,302");

  // The marker of an empty list, Remove and Edit Name... greyed with nothing selected, the arrows greyed.
  assert.ok(State.showsEmptyMarker(state) && html.includes("po-empty-marker"));
  const greyed = (id) => new RegExp(`class="[^"]*desactivado[^"]*" data-id="${PREFIX}\\.${id}"`).test(html);
  assert.deepEqual(["remove", "edit-name", "move-up", "move-down", "add"].map(greyed), [true, true, true, true, false]);
  // The options LabVIEW opens with: Draw Polymorphic OVI Icon on, Show Selector by Default off, Allow ... Adapt on.
  const checked = (id) => new RegExp(`class="po-choice [^"]*marcada[^"]*" data-id="${PREFIX}\\.${id}"`).test(html);
  assert.deepEqual(["draw-polymorphic-icon", "draw-instance-icon", "show-selector-by-default", "allow-adapt"].map(checked), [true, false, false, true]);
  assert.match(html, /Allow Polymorphic OVI<br>to Adapt to Data Type/, "on two lines, as measured");
  assert.ok(html.includes("Draw Polymorphic OVI Icon") && html.includes("Draw Instance OVI Icon") && html.includes("Show Selector by Default"));
  // Its icon is the generic polymorphic one until there is another; the window is a 32 x 32 image of what the .sdp holds.
  assert.match(html, /<div class="po-icon"[^>]*><svg/);
  // Help is not done: it is drawn as a hole and explains why when clicked (the convention of the other dialogs).
  assert.match(html, new RegExp(`class="po-button hueco" data-id="${PREFIX}\\.help"`));
  assert.equal(INV.entrada(`${PREFIX}.help`).estado, "todo");
  const explained = E.clic(E.inicial(), INV, `${PREFIX}.help`, { x: 10, y: 10 });
  assert.equal(explained.abierta.id, `${PREFIX}.help`);
});

test("the instance list shows the file name with its extension, empty names for the defaults, and selects a row", () => {
  const empty = draw(State.emptyState());
  // Columns OVI Name 10-237, Menu Name 237-320, Selector Name 320-401 (window pixels), under a 17 px header with 18 px rows.
  assert.equal(View.LAYOUT.headerHeight, 17);
  assert.equal(View.LAYOUT.rowHeight, 18);
  assert.deepEqual(View.LAYOUT.columns, { fileName: [10, 237], menuName: [237, 320], selectorName: [320, 401] });
  assert.match(empty, /<div class="po-header" style="height:17px"><span class="po-cell" style="left:1px;width:227px">OVI Name<\/span><span class="po-cell" style="left:228px;width:83px">Menu Name<\/span><span class="po-cell" style="left:311px;width:81px">Selector Name<\/span><\/div>/);
  assert.equal((empty.match(/class="po-row vacia"/g) ?? []).length, 7, "empty striped rows fill the 145 px box");

  let state = withInstances(State.emptyState(), "Integer/Step (I64).sdg", "Step (DBL).sdg");
  assert.deepEqual(State.rowCells(state.instances[0]), ["Step (I64).sdg", "", ""], "the file name with its extension, the names empty");
  assert.equal(State.showsEmptyMarker(state), false, "the marker is gone once an instance is added");
  let html = draw(state);
  assert.ok(!html.includes("po-empty-marker"));
  assert.match(html, /<div class="po-row seleccionada" data-row="1" style="top:35px;height:18px"><span class="po-cell" style="left:18px;width:210px">Step \(DBL\)\.sdg<\/span>/, "the last row added is selected, its text indented 17 px");
  state = State.select(state, 0);
  assert.equal(state.selected, 0);
  assert.match(draw(state), /<div class="po-row seleccionada" data-row="0" style="top:17px/);
  assert.equal(State.select(state, 5), state, "there is no sixth row");
});

test("Add appends the instance selected, Remove, Move Up and Move Down follow the selection and stop at the ends", () => {
  const empty = State.emptyState();
  const first = State.addInstance(empty, "A.sdg");
  assert.deepEqual([first.instances.length, first.selected], [1, 0], "appended and selected");
  const third = withInstances(first, "B.sdg", "C.sdg");
  assert.equal(third.selected, 2);
  const buttons = (state) => State.buttonStates(state);
  assert.deepEqual(buttons(empty), { moveUp: false, moveDown: false, remove: false, editName: false });
  assert.deepEqual(buttons(third), { moveUp: true, moveDown: false, remove: true, editName: true }, "the last row cannot move down");
  assert.deepEqual(buttons(State.select(third, 0)), { moveUp: false, moveDown: true, remove: true, editName: true }, "the first row cannot move up");
  assert.deepEqual(buttons(State.select(withInstances(empty, "A.sdg"), 0)), { moveUp: false, moveDown: false, remove: true, editName: true }, "a single row cannot move");
  assert.deepEqual(buttons({ ...third, selected: null }), { moveUp: false, moveDown: false, remove: false, editName: false }, "nothing selected");

  // The arrows move the selected row by one, and it stays selected.
  const up = State.moveSelected(third, -1);
  assert.deepEqual([up.instances.map((i) => i.path), up.selected], [["A.sdg", "C.sdg", "B.sdg"], 1]);
  assert.equal(State.moveSelected(State.select(third, 0), -1).instances[0].path, "A.sdg", "stopped at the top");
  assert.equal(State.moveSelected(third, 1), third, "stopped at the bottom");
  // Remove takes the selected row out; nothing is selected after it (not measured).
  const removed = State.removeSelected(State.select(third, 1));
  assert.deepEqual([removed.instances.map((i) => i.path), removed.selected], [["A.sdg", "C.sdg"], null]);
  assert.equal(State.removeSelected(empty), empty);
  // The disabled buttons are drawn greyed and the page ignores them: they do nothing in the state either.
  assert.equal(State.moveSelected({ ...third, selected: null }, 1).instances.length, 3);
});

test("Edit Name opens the dialog over the selected row and an empty name goes back to its default", () => {
  assert.equal(State.openNameDialog(State.emptyState()).nameDialog, null, "greyed with nothing selected");
  let state = withInstances(State.emptyState(), "Step (I64).sdg", "Step (DBL).sdg");
  state = State.openNameDialog(State.select(state, 0));
  assert.deepEqual(state.nameDialog, { index: 0, menuName: "", selectorName: "", focus: "menuName" });
  const html = draw(state);
  // "Edit Instance Name", 353 x 237, with "Menu Name" and "Polymorphic OVI Selector Name" fields of 300 x 32, OK, Cancel, Help.
  assert.deepEqual([View.NAME_DIALOG_LAYOUT.width, View.NAME_DIALOG_LAYOUT.height], [353, 237]);
  assert.deepEqual([View.NAME_DIALOG_LAYOUT.menuField.width, View.NAME_DIALOG_LAYOUT.menuField.height, View.NAME_DIALOG_LAYOUT.selectorField.width, View.NAME_DIALOG_LAYOUT.selectorField.height], [300, 32, 300, 32]);
  for (const text of ["Edit Instance Name", "Menu Name", "Polymorphic OVI Selector Name", ">OK<", ">Cancel<", ">Help<"]) assert.ok(html.includes(text), text);
  assert.match(html, /data-field="menuName"[^>]*><span class="po-field-text"><\/span><span class="caret">/, "the caret is in the first field");

  state = State.typeInNameDialog(State.typeInNameDialog(state, "menuName", "Integer"), "selectorName", "Whole");
  assert.equal(state.nameDialog.focus, "selectorName");
  assert.deepEqual([State.typedText("ab", "c"), State.typedText("ab", "Backspace"), State.typedText("ab", "Enter")], ["abc", "a", "ab"]);
  const accepted = State.acceptNameDialog(state);
  assert.equal(accepted.nameDialog, null);
  assert.deepEqual(State.rowCells(accepted.instances[0]), ["Step (I64).sdg", "Integer", "Whole"]);
  assert.deepEqual(State.rowCells(accepted.instances[1]), ["Step (DBL).sdg", "", ""], "the other row is not touched");
  assert.equal(State.cancelNameDialog(state).instances[0].menuName, "", "Cancel leaves the names");

  // What is stored: a name left empty is the default and stores nothing, and the selector name goes on following the menu name.
  const file = JSON.parse(State.toText(accepted));
  assert.deepEqual(file.instances[0], { ovi: "Step (I64).sdg", "menu-name": "Integer", "selector-name": "Whole" });
  assert.deepEqual(file.instances[1], { ovi: "Step (DBL).sdg" });
  const onlyMenu = State.acceptNameDialog(State.typeInNameDialog(State.openNameDialog(State.select(withInstances(State.emptyState(), "Step (I64).sdg"), 0)), "menuName", "Integer"));
  assert.deepEqual(JSON.parse(State.toText(onlyMenu)).instances[0], { ovi: "Step (I64).sdg", "menu-name": "Integer" }, "an empty selector name stores nothing");
  const renamed = State.acceptNameDialog(State.typeInNameDialog(State.openNameDialog(State.select(onlyMenu, 0)), "menuName", "Whole"));
  assert.equal(Poly.readPolymorphic(State.toText(renamed)).instances[0].selectorName, "Whole", "it follows the menu name");
  assert.deepEqual(State.rowCells(State.acceptNameDialog(State.typeInNameDialog(State.openNameDialog(State.select(onlyMenu, 0)), "menuName", "  "))["instances"][0]), ["Step (I64).sdg", "", ""], "blanks are an empty name");
});

test("the options and Edit Icon write the sdp, whose text reads back the same", () => {
  let state = State.emptyState();
  state = State.setDrawIcon(state, Poly.DRAW_ICON.INSTANCE);
  state = State.toggleShowSelectorByDefault(state);
  state = State.toggleAdaptToDataType(state);
  const read = Poly.readPolymorphic(State.toText(state));
  assert.deepEqual([read.drawIcon, read.showSelectorByDefault, read.adaptToDataType], [Poly.DRAW_ICON.INSTANCE, true, false]);
  const html = draw(state);
  assert.match(html, new RegExp(`class="po-choice po-radio marcada" data-id="${PREFIX}\\.draw-instance-icon"`));
  assert.match(html, new RegExp(`class="po-choice po-check marcada" data-id="${PREFIX}\\.show-selector-by-default"`));
  assert.doesNotMatch(html, new RegExp(`class="po-choice po-check marcada" data-id="${PREFIX}\\.allow-adapt"`));
  assert.equal(State.setDrawIcon(state, "nonsense"), state);

  // Edit Icon...: until Solder has an icon editor, an SVG file is the icon (a deviation, spec rule 123); it is kept in the .sdp
  // and drawn as an image from a data URI, so nothing in it runs.
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><script>alert(1)</script><rect width="32" height="32"/></svg>';
  const withIcon = State.setIcon(state, icon);
  assert.equal(withIcon.icon, icon);
  assert.equal(Poly.readPolymorphic(State.toText(withIcon)).icon, icon, "the icon is the text of the SVG document");
  const drawn = draw(withIcon);
  assert.match(drawn, /<div class="po-icon"[^>]*><img src="data:image\/svg\+xml;charset=utf-8,[^"]+" width="32" height="32"/);
  assert.doesNotMatch(drawn, /<script/);
  for (const notAnIcon of ["", "hello", "<html></html>", "x".repeat(State.MAX_ICON_TEXT_LENGTH + 1), null]) assert.equal(State.setIcon(state, notAnIcon), state, "not an SVG icon");
  assert.equal(INV.entrada(`${PREFIX}.edit-icon`).estado, "built");

  // The whole text round trips through the file format and its schema.
  const round = State.fromText(State.toText(withInstances(withIcon, "a/One.sdg", "<ovilib>/Instr/Two.sdg")));
  assert.deepEqual(round.instances.map((instance) => instance.path), ["a/One.sdg", "<ovilib>/Instr/Two.sdg"]);
  assert.deepEqual([round.drawIcon, round.showSelectorByDefault, round.adaptToDataType, round.icon], [Poly.DRAW_ICON.INSTANCE, true, false, icon]);
  assert.throws(() => State.fromText("{"), Poly.PolymorphicFileError);
});

test("the menu bar has LabVIEW's eight titles and the File rows run the window's commands", () => {
  const titles = INV.hijos(`${PREFIX}.menu`).map((entry) => entry.etiqueta);
  assert.deepEqual(titles, ["File", "Edit", "View", "Project", "Operate", "Tools", "Window", "Help"], "measured: no toolbar");
  const html = draw(State.emptyState());
  for (const title of titles) assert.ok(html.includes(`<span class="texto">${title}</span>`), title);
  // Only File has rows: the others were not measured, so they are holes that say so.
  assert.deepEqual(titles.filter((_, index) => INV.tieneContenido(INV.hijos(`${PREFIX}.menu`)[index].id)), ["File"]);
  const explained = E.clic(E.inicial(), INV, `${PREFIX}.menu.edit`, { x: 5, y: 5 });
  assert.equal(explained.abierta.id, `${PREFIX}.menu.edit`);
  assert.equal(INV.entrada(`${PREFIX}.menu.edit`).necesita, "menus-de-la-ventana-polimorfica");
  // Opening File draws its rows, with the built ones plain and the rest holes.
  const opened = E.abrirMenuBarra(E.inicial(), INV, `${PREFIX}.menu.file`, { x: 0, y: 20 });
  const menu = View.polymorphicWindow(INV, { ...State.emptyState(), menuBarra: opened.menuBarra }, measure, windowSize);
  for (const row of ["New OVI", "New...", "Open...", "Close", "Save", "Save As...", "Exit"]) assert.ok(menu.includes(`>${row}</span>`), row);
  // Each command of the table is a built row, with its shortcut.
  for (const [row, command] of Object.entries(State.MENU_COMMANDS)) {
    const entry = INV.entrada(`${PREFIX}.menu.file.${row}`);
    assert.equal(entry.estado, "built", `${row} (${command}) is done`);
  }
  assert.deepEqual(["new-vi", "open", "close", "save", "exit"].map((row) => INV.entrada(`${PREFIX}.menu.file.${row}`).atajo), ["Ctrl+N", "Ctrl+O", "Ctrl+W", "Ctrl+S", "Ctrl+Q"]);
  // The page runs them through the main process.
  const page = readFileSync(path.join(RAIZ, "editor/src/polymorphic-window/polymorphic-window.mjs"), "utf8");
  for (const call of ["solder?.nuevoVI()", "solder?.nuevo()", "solder?.abrir()", "solder?.cerrarVentana()", "solder?.salir()", "solder?.guardar("]) assert.ok(page.includes(call), call);
});

test("a polymorphic OVI is registered with its own window and title, numbered with the other Untitled", () => {
  const registry = Registry.createRegistry();
  const ovi = registry.open().entry;
  const polymorphic = registry.open({ kind: Registry.ENTRY_KINDS.POLYMORPHIC }).entry;
  assert.deepEqual([Registry.viName(ovi), Registry.viName(polymorphic)], ["Untitled 1", "Untitled 2"], "measured: the next Untitled number");
  assert.deepEqual(Registry.windowKindsOf(polymorphic), ["polymorphic"]);
  assert.deepEqual(Registry.windowKindsOf(ovi), Registry.WINDOW_KINDS);
  assert.equal(Registry.primaryWindowKind(polymorphic), "polymorphic");
  assert.equal(Registry.primaryWindowKind(ovi), "front-panel");
  assert.equal(Registry.windowTitle(polymorphic, "polymorphic"), "Untitled 2 Polymorphic OVI");
  const text = State.toText(State.emptyState());
  Registry.recordChange(polymorphic, text);
  assert.equal(Registry.windowTitle(polymorphic, "polymorphic"), "Untitled 2 Polymorphic OVI", "the first report is the saved version");
  Registry.recordChange(polymorphic, State.toText(State.toggleShowSelectorByDefault(State.emptyState())));
  assert.equal(Registry.windowTitle(polymorphic, "polymorphic"), "Untitled 2 Polymorphic OVI *", "an edit adds the asterisk");
  assert.equal(Registry.isDirty(polymorphic), true, "closing it asks Save, Don't Save or Cancel (the Close dialog of the OVIs)");
  Registry.recordSave(polymorphic, "/lib/Step.sdp", text);
  assert.equal(Registry.windowTitle(polymorphic, "polymorphic"), "Step.sdp Polymorphic OVI");
  assert.equal(registry.findByPath("/lib/Step.sdp"), polymorphic);
});

test("Save writes a sdp with its instances relative to it and the paths are rebased when it moves", () => {
  // Saved nowhere yet: an instance is stored with its absolute path, and a first save makes it relative.
  const untitled = Paths.untitledKey(2);
  const stored = Paths.storedPathFor(untitled, "/home/ana/lib/Step (I64).sdg");
  assert.equal(stored, "/home/ana/lib/Step (I64).sdg");
  const text = State.toText(State.addInstance(State.emptyState(), stored));
  const rebased = Paths.rebaseText(text, untitled, "/home/ana/lib/Step.sdp");
  assert.equal(JSON.parse(rebased).instances[0].ovi, "Step (I64).sdg", "relative to the .sdp");
  assert.equal(Paths.rebaseText(rebased, "/home/ana/lib/Step.sdp", "/home/ana/lib/Step.sdp"), rebased, "saved in place: nothing moves");
  assert.equal(JSON.parse(Paths.rebaseText(rebased, "/home/ana/lib/Step.sdp", "/home/ana/other/Step.sdp")).instances[0].ovi, "../lib/Step (I64).sdg", "Save As elsewhere");
  // An OVI of ovi.lib is stored symbolically and never moves; a saved .sdp stores what it adds relative to itself.
  const withOviLib = State.toText(State.addInstance(State.emptyState(), Paths.storedPathFor("/home/ana/lib/Step.sdp", "/opt/solder/ovi.lib/Instr/Serial.sdg", "/opt/solder/ovi.lib")));
  assert.equal(JSON.parse(withOviLib).instances[0].ovi, "<ovilib>/Instr/Serial.sdg");
  assert.equal(Paths.rebaseText(withOviLib, "/home/ana/lib/Step.sdp", "/elsewhere/Step.sdp"), withOviLib);
  assert.equal(Paths.storedPathFor("/home/ana/lib/Step.sdp", "/home/ana/lib/sub/Two.sdg"), "sub/Two.sdg");
  // Save As adds .sdp, as the polymorphic OVI's own extension (a Solder choice: LabVIEW saves it as a .vi).
  assert.equal(Paths.polymorphicSavePathFor("/lib/Step"), "/lib/Step.sdp");
  assert.equal(Paths.polymorphicSavePathFor("/lib/Step.sdp"), "/lib/Step.sdp");
  assert.equal(Paths.polymorphicSaveProposal(null, "Untitled 2"), "Untitled 2.sdp");
  assert.equal(Paths.polymorphicSaveProposal("/lib/Step.sdp", "Step.sdp"), "/lib/Step.sdp");
  // The main process asks Save As with the .sdp filter, and the text written is what rebaseText gives back to the page.
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /polymorphic \? polymorphicSavePathFor\(result\.filePath\)/);
  assert.match(main, /filters: polymorphic \? POLYMORPHIC_FILTERS : FILTERS/);
});

test("File Open takes a sdp and Open Polymorphic OVI on a node opens its window", () => {
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /title: "Open", properties: \["openFile"\], filters: OVI_AND_POLYMORPHIC_FILTERS/, "the Open dialog lists .sdp");
  assert.match(main, /kind: kindOfFile\(filePath\)/, "a .sdp opens as a polymorphic OVI");
  assert.match(main, /const kindOfFile = \(filePath\) => \(isPolymorphicPath\(filePath\) \? ENTRY_KINDS\.POLYMORPHIC : ENTRY_KINDS\.OVI\)/);
  assert.match(main, /new-dialog:accept/);
  // The row is done in the node's menu, and the editor window sends the .sdp's own file to the main process.
  assert.equal(INV.entrada("context.polymorphic-subvi.open-polymorphic-ovi").estado, "built");
  const editorWindow = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.match(editorWindow, /"open-polymorphic-ovi": \(nodeId\) => abrirPolimorfico\(nodeId\)/);
  assert.match(editorWindow, /cat\.polymorphicOf\?\.\(grafo\(\)\.nodos\.find\(\(n\) => n\.id === nodeId\)\);\n  if \(polymorphic\) window\.solder\?\.abrirRuta\(polymorphic\.key\)/);
  assert.equal(Paths.isVIFile("/lib/Step.sdp"), false, "it is not an OVI file: the registry takes it by its own extension");
  assert.ok(Poly.isPolymorphicPath("/lib/STEP.SDP"));
});

test("a saved sdp refreshes the callers that have it open, and the window reads what a caller wrote", () => {
  // A caller's hierarchy lists the .sdp among its keys, which is what the page checks when some OVI is saved.
  const instance = buildVI(CAT, (b) => {
    b.node("x", "control", { type: "i64" });
    b.node("result", "indicator", { type: "i64" });
    b.wire("x.result", "result.value");
    b.connector([{ name: "x", cell: 0 }], [{ name: "result", cell: 9 }]);
  });
  const sdpState = withInstances(State.emptyState(), "Step (I64).sdg");
  const texts = { "/lib/Step.sdp": State.toText(sdpState), "/lib/Step (I64).sdg": Q.aTexto(instance.g, CAT) };
  const probe = buildHierarchy({ rootKey: "/app/main.sdg", rootGraph: Gr.nuevo(), texts, baseCatalog: CAT, readVI: Q.leer });
  const call = buildVI(probe.catalog, (b) => b.node("call", "subvi", Poly.polymorphicNodeConfig("../lib/Step.sdp", Poly.readPolymorphic(texts["/lib/Step.sdp"]))));
  const result = buildHierarchy({ rootKey: "/app/main.sdg", rootGraph: call.g, texts, baseCatalog: CAT, readVI: Q.leer });
  assert.deepEqual(result.errors, []);
  assert.ok(result.keys.includes("/lib/Step.sdp"), "so a save of the .sdp rebuilds this caller's hierarchy");
  const page = readFileSync(path.join(RAIZ, "editor/src/window/editor-window.mjs"), "utf8");
  assert.match(page, /if \(hierarchyKeys\.includes\(key\)\) refrescarJerarquia\(\)/);
  // writeVI tells every window which key was saved, the .sdp's included.
  const main = readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8");
  assert.match(main, /send\("vi:saved", \{ id: entry\.id, key: pathKey\(target\) \}\)/);
});
