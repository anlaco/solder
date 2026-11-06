// The Call Library Function Node in the editor (DT-080): its place in Functions ▸ Connectivity ▸ Libraries & Executables, the node
// on the diagram, its configuration dialog and its right-click menu. Every measure comes from
// labview-captures/reports/2026-11-06-clfn.md (the node, the dialog, the menu), 2026-11-06-clfn-run.md (the header's colour by
// thread, the dialog's parts) and 2026-11-06-connectivity-palette.md (the palettes); the captures are local evidence and are not
// committed. What the reports did not measure is marked in the modules.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { callLibraryPrototype, newParameter, PARAMETER_TYPES, RETURN_TYPES, DATA_TYPES } from "../../core/model/call-library.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as CL from "../../editor/src/block-diagram/call-library-nodes.mjs";
import * as CLD from "../../editor/src/block-diagram/call-library-dialog.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { MEDIDAS_PALETA, celdasSubpaleta, paleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";
import { OLD_SCHOOL_TOKENS } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const AQUI = { x: 10, y: 20 };
const CONNECTIVITY = "palette.functions.connectivity";
const LIBRARIES = `${CONNECTIVITY}.libraries-executables`;
const CLFN_ENTRY = `${LIBRARIES}.call-library-function-node`;
const withPalette = () => ({ ...inicial(), paleta: paletaNueva("palette.functions", 40, 30) });
const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

// ——— The palettes ———

test("Functions ▸ Connectivity unfolds in four columns with the measured cells and labels", () => {
  const opened = clic(withPalette(), INV, CONNECTIVITY, AQUI);
  assert.ok(opened.paleta.desplegadas.includes(CONNECTIVITY), "the category is done, so it unfolds");
  const html = paleta(INV, opened.paleta);
  const cell = (slug) => {
    const [, left, top] = html.match(new RegExp(`data-id="${CONNECTIVITY}\\.${slug}"[^>]* style="left:([\\d.]+)px;top:([\\d.]+)px`)) ?? assert.fail(`${slug} is not drawn`);
    const P = MEDIDAS_PALETA;
    return [Math.round((Number(top) - P.sobreRejilla) / (P.pasoIcono + P.altoEtiqueta)) + 1, Math.round((Number(left) - P.margenRejilla) / P.pasoIcono) + 1];
  };
  // (row, column) of p2d.png: the blanks are Advanced Memory, Internet and DIAdem, which LabVIEW's folder lists without a palette.
  const MEASURED = {
    "libraries-executables": [1, 1], "source-control": [1, 2], "web-services": [1, 4],
    "dot-net": [2, 1], "input-device-control": [2, 2], activex: [2, 3], "windows-registry-access-ovis": [2, 4],
    python: [3, 1], matlab: [3, 2], database: [3, 3], datafinder: [4, 2],
  };
  for (const [slug, expected] of Object.entries(MEASURED)) assert.deepEqual(cell(slug), expected, slug);
  assert.deepEqual(INV.hijos(CONNECTIVITY).map((e) => ultimo(e.id)), Object.keys(MEASURED), "LabVIEW's order");
  // Every folder carries its label under the icon and its whole name as the hover name; one label is clipped as LabVIEW's is.
  for (const entry of INV.hijos(CONNECTIVITY)) {
    assert.match(html, new RegExp(`data-id="${entry.id}" title="${entry.etiqueta.replace(/[().]/g, "\\$&").replace(/&/g, "&amp;")}"`), `${entry.etiqueta}: hover name`);
    assert.ok(G.SUBPALETAS[ultimo(entry.id)], `${entry.etiqueta} has an icon`);
  }
  assert.match(html, /class="etiqueta-carpeta"[^>]*>Windows Registry Acces…</, "the clipped label");
  assert.match(html, /class="etiqueta-carpeta"[^>]*>Libraries &amp; Executables</);
  // Only Libraries & Executables was opened in LabVIEW: the other folders are greyed and say why (DT-035).
  assert.match(html, new RegExp(`class="carpeta" data-id="${LIBRARIES}"`));
  for (const entry of INV.hijos(CONNECTIVITY).filter((e) => e.id !== LIBRARIES)) {
    assert.ok(esHueco(entry), `${entry.etiqueta} is greyed`);
    assert.match(INV.explicacion(entry).solder, /has not been opened in LabVIEW yet/, entry.etiqueta);
  }
  assert.equal(INV.entrada(CONNECTIVITY).estado, "built");
});

test("Libraries & Executables opens with the Call Library Function Node placeable and System Exec.vi greyed", () => {
  const sites = celdasSubpaleta(INV, LIBRARIES);
  assert.equal(sites.columnas, 2);
  assert.deepEqual(sites.sitios.map((s) => [s.fila + 1, s.columna + 1, s.e.etiqueta]), [[1, 1, "Call Library Function Node"], [1, 2, "System Exec.vi"]]);
  let state = clic(withPalette(), INV, CONNECTIVITY, AQUI);
  state = clic(state, INV, LIBRARIES, AQUI, 0);
  assert.deepEqual(state.paleta.cascada.map((c) => c.id), [LIBRARIES], "the folder opens its subpalette");
  const html = subpaletas(INV, state.paleta);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${CLFN_ENTRY}"`), "the node is placeable");
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${LIBRARIES}\\.system-exec-vi"`), "System Exec.vi is greyed");
  const systemExec = INV.entrada(`${LIBRARIES}.system-exec-vi`);
  assert.ok(esHueco(systemExec));
  assert.match(INV.explicacion(systemExec).solder, /^Missing: /);
  for (const slug of ["call-library-function-node", "system-exec-vi"]) assert.ok(G.FUNCIONES[slug] && G.CAJAS[slug], `${slug} has its icon`);
  // Placing it puts the node on the diagram.
  const entry = INV.entrada(CLFN_ENTRY);
  assert.equal(entry.estado, "built");
  assert.equal(entry.bloque, "call-library");
  const dropped = ED.pulsar(ED.moverA(ED.coger(ED.inicial(), entry.bloque), CTX, { x: 100, y: 100 }), CTX, { tipo: "fondo" }, { x: 100, y: 100 });
  assert.equal(dropped.g.nodos[0].tipo, "call-library");
  assert.equal(dropped.callLibraryDialog, undefined, "the node is dropped unconfigured, without a dialog (unverified in LabVIEW)");
});

// ——— The node ———

const MEAN_LIKE = {
  library: "C:\\Program Files\\National Instruments\\LabVIEW 2026\\resource\\lvanlys.*", function: "Mean_head", thread: "any",
  "return-type": { type: "numeric", "data-type": "i32" },
  parameters: [
    { name: "xH", type: "adapt-to-type", constant: true, "data-format": "handles-by-value" },
    { name: "mean", type: "adapt-to-type", "data-format": "handles-by-value" },
    { name: "dsperr", type: "adapt-to-type", "data-format": "handles-by-value" },
  ],
};

/** A node of the block with `config` merged into its defaults, on a diagram at (100, 60). */
function node(config = {}) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, "call-library", 100, 60);
  const configured = Gr.fijarConfig(created.g, created.id, config);
  return { g: configured, n: nodeOf(configured, created.id) };
}

test("the node is 40 x 27 empty, 40 x 51 like Mean (DBL) and one row taller per parameter", () => {
  const empty = node();
  assert.deepEqual([D.caja(empty.n, CTX).ancho, D.caja(empty.n, CTX).alto], [40, 27], "empty: 40 x 27");
  const mean = node(MEAN_LIKE);
  assert.deepEqual([D.caja(mean.n, CTX).ancho, D.caja(mean.n, CTX).alto], [40, 51], "Mean (DBL): 40 x 51");
  const withPath = node({ ...MEAN_LIKE, "specify-path-on-diagram": true });
  assert.equal(D.caja(withPath.n, CTX).alto, 51, "the path pins are in the header: the node does not grow");
  assert.equal(D.caja(node({ parameters: [newParameter([])] }).n, CTX).alto, 35);
  // Drawn: the header's 18 px, then the rows of 8 px, each with two cells and a 2 px divider.
  const html = D.nodo ? "" : "";
  assert.equal(html, "");
  const drawing = CL.callLibraryBody(mean.n, { ancho: 40, alto: 51 });
  assert.equal([...drawing.matchAll(/width="2" height="8" fill="#000000"/g)].length, 4, "a divider on the return row and on each parameter row");
  assert.match(drawing, /viewBox="0 0 40 51"/);
});

test("the terminals sit where LabVIEW has them: path y 0, error y 9, rows from y 18, 8 px apart", () => {
  const terminals = (n) => D.terminales(n, CTX);
  const place = (t, n) => [t.x - n.x, t.y - n.y];
  // Empty: error in and out only; the wire leaves the left edge (x 0) and the right outline pixel (x 39).
  const empty = node();
  const emptyTerminals = terminals(empty.n);
  assert.deepEqual(emptyTerminals.map((t) => `${t.dir}:${t.puerto}`), ["in:error-in", "out:error-out"]);
  assert.deepEqual(emptyTerminals.map((t) => place(t, empty.n)), [[0, 13.5], [39, 13.5]]);
  assert.deepEqual(emptyTerminals.map((t) => t.zona.alto), [9, 9], "an error pin is 9 px tall");
  assert.equal(emptyTerminals[0].zona.ancho, 13, "and 13 px wide");
  assert.deepEqual([emptyTerminals[0].zona.x, emptyTerminals[0].zona.y], [empty.n.x - 6.5, empty.n.y + 9]);
  // Mean-like: the return value's output on the first row (y 18), then a pair per parameter 8 px lower each.
  const mean = node(MEAN_LIKE);
  const meanTerminals = terminals(mean.n);
  const at = (port) => meanTerminals.find((t) => t.puerto === port);
  assert.deepEqual(meanTerminals.map((t) => t.puerto), ["error-in", "arg-0-in", "arg-1-in", "arg-2-in", "error-out", "return", "arg-0-out", "arg-1-out", "arg-2-out"]);
  assert.deepEqual(["return", "arg-0-out", "arg-1-out", "arg-2-out"].map((port) => at(port).zona.y - mean.n.y), [18, 26, 34, 42], "rows from y 18, 8 px each");
  assert.deepEqual(["return", "arg-0-out", "arg-1-out", "arg-2-out"].map((port) => at(port).zona.alto), [8, 8, 8, 8]);
  assert.deepEqual(["arg-0-in", "arg-1-in", "arg-2-in"].map((port) => at(port).y - mean.n.y), [30, 38, 46], "each wire in the middle of its row");
  assert.equal(at("return").x - mean.n.x, 39, "the return value is an output on the right");
  assert.equal(meanTerminals.some((t) => t.puerto === "return" && t.dir === "in"), false, "the return value has no input");
  // Specify path on diagram adds the path pins at the very top (y 0), over the error pins.
  const withPath = node({ ...MEAN_LIKE, "specify-path-on-diagram": true });
  const pathTerminals = terminals(withPath.n);
  const pathIn = pathTerminals.find((t) => t.puerto === "path-in");
  const pathOut = pathTerminals.find((t) => t.puerto === "path-out");
  assert.deepEqual([pathIn.zona.y - withPath.n.y, pathIn.zona.alto, pathOut.zona.y - withPath.n.y], [0, 9, 0]);
  assert.equal(pathTerminals.find((t) => t.puerto === "error-in").zona.y - withPath.n.y, 9);
  assert.equal(pathTerminals.find((t) => t.puerto === "arg-0-out").zona.y - withPath.n.y, 26, "the rows do not move with the path pins");
});

test("a wire reaches the terminals of the node", () => {
  const { g, n } = node(MEAN_LIKE);
  const constant = Gr.crearNodo(g, CAT, "const", 0, 0);
  const wired = Gr.conectar(constant.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: n.id, puerto: "arg-1-in", dir: "in" });
  assert.equal(wired.motivo, undefined);
  const ends = D.extremos(wired.g, CTX);
  assert.deepEqual([ends.get(`${n.id}.arg-1-in`).x, ends.get(`${n.id}.arg-1-in`).y], [100, 60 + 38]);
  assert.deepEqual([ends.get(`${n.id}.arg-1-out`).x, ends.get(`${n.id}.arg-1-out`).y], [139, 60 + 38]);
});

test("the header is orange in the UI thread and pale yellow in any thread", () => {
  const body = (config) => { const { n } = node(config); return CL.callLibraryBody(n, D.caja(n, CTX)); };
  assert.match(body({ thread: "ui" }), /fill="var\(--call-library-ui-thread-fill\)"/);
  assert.doesNotMatch(body({ thread: "ui" }), /call-library-any-thread-fill/);
  assert.match(body({ thread: "any" }), /fill="var\(--call-library-any-thread-fill\)"/);
  assert.doesNotMatch(body({ thread: "any" }), /call-library-ui-thread-fill/);
  assert.equal(CL.headerFill(node().n), "var(--call-library-ui-thread-fill)", "a new node runs in the UI thread (measured)");
  // Old School's tokens are the measured colours (clfn-run: #ffaf00 and #ffffcc); the cells of a void return are #cccccc.
  assert.equal(OLD_SCHOOL_TOKENS.get("--call-library-ui-thread-fill"), "#ffaf00");
  assert.equal(OLD_SCHOOL_TOKENS.get("--call-library-any-thread-fill"), "#ffffcc");
  assert.equal(OLD_SCHOOL_TOKENS.get("--call-library-void-cell-fill"), "#cccccc");
});

test("the cells of the node show the glyph of their type and are grey for void", () => {
  const void_ = node();
  const voidDrawing = CL.callLibraryBody(void_.n, { ancho: 40, alto: 27 });
  assert.equal([...voidDrawing.matchAll(/fill="var\(--call-library-void-cell-fill\)"/g)].length, 2, "both cells of a void return are grey");
  const mean = node(MEAN_LIKE);
  const drawing = CL.callLibraryBody(mean.n, { ancho: 40, alto: 51 });
  assert.match(drawing, />I32</, "the return value is an I32 (measured: blue)");
  assert.equal([...drawing.matchAll(/>\*</g)].length, 6, "Adapt to Type in both cells of its three rows");
  const typed = node({ "return-type": { type: "numeric", "data-type": "dbl" }, parameters: [{ name: "a", type: "array", "data-type": "i32", dimensions: 1, "array-format": "array-data-pointer" }, { name: "s", type: "string", "string-format": "c-string-pointer" }] });
  const typedDrawing = CL.callLibraryBody(typed.n, D.caja(typed.n, CTX));
  assert.match(typedDrawing, />DBL</);
  assert.match(typedDrawing, /fill="#ff7f00">DBL</, "DBL is orange (measured)");
  assert.match(typedDrawing, /fill="#0000ff">\[\]</, "an array of I32 is blue brackets");
  assert.match(typedDrawing, />abc</);
});

// ——— The right-click menu ———

const openMenu = (d, nodeId, port = null) => ED.abrirMenu(d, D.menuDe(nodeOf(d.g, nodeId), port, d.g, false, CAT), nodeId, 0, 0, port);

/** The rows of a right-click menu (or of one of its submenus): label, greyed, ticked, and a separator before it. */
function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), (text) => text.length * 6, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[3], label: m[4].replaceAll("&amp;", "&"), greyed: /hueco|desactivado/.test(m[2]), separated: !!m[1], checked: /marcado/.test(m[2]),
  }));
}
/** Opens the submenus of `ids`, one in the other, as hovering them does. */
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);
const shown = (rows) => rows.flatMap((r) => (r.separated ? ["---", r.label] : [r.label]));

test("the right-click menu of the node is the measured one", () => {
  const { g, n } = node(MEAN_LIKE);
  const d = openMenu({ ...ED.inicial(), g }, n.id);
  assert.equal(d.menu.raiz, "context.call-library");
  const rows = menuRows(d);
  assert.deepEqual(shown(rows), [
    "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Libraries & Executables Palette", "Replace", "---", "Name Format",
    "Configure...", "Create C File", "---", "Remove and Rewire", "Create", "---", "Properties",
  ]);
  const greyed = rows.filter((r) => r.greyed).map((r) => r.label);
  assert.deepEqual(greyed, ["Visible Items", "Help", "Examples", "Description and Tip...", "Libraries & Executables Palette", "Replace", "Create C File", "Remove and Rewire", "Properties"]);
  for (const hole of rows.filter((r) => r.greyed)) assert.match(INV.explicacion(INV.resolver(hole.id)).solder, /^Missing: /, hole.label);
  // Name Format ticks No Names (measured); Create has the two commands that apply to every terminal.
  const nameFormat = menuRows(hover(d, "context.call-library.name-format"), "context.call-library.name-format");
  assert.deepEqual(nameFormat.map((r) => [r.label, r.checked, r.greyed]), [["No Names", true, false], ["Names", false, true]]);
  assert.deepEqual(menuRows(hover(d, "context.call-library.create"), "context.call-library.create").map((r) => r.label), ["All Controls and Indicators", "All Constants"]);
  assert.deepEqual(menuRows(hover(d, "context.call-library.visible-items"), "context.call-library.visible-items").map((r) => r.label), ["Label"]);
  assert.equal(D.menuDe(n, "arg-0-in", g, false, CAT), "context.call-library", "its terminals share the node's menu");
});

test("Create ▸ All Constants and All Controls and Indicators make an object for each terminal that takes one", () => {
  const { g, n } = node({ "return-type": { type: "numeric", "data-type": "i32" }, parameters: [{ name: "a", type: "numeric", "data-type": "i32", pass: "value" }] });
  const opened = openMenu({ ...ED.inicial(), g }, n.id);
  const constants = ED.orden(opened, "context.call-library.create.all-constants", CTX);
  const kinds = (d) => d.g.nodos.filter((x) => x.id !== n.id).map((x) => x.tipo).sort();
  assert.ok(kinds(constants).length >= 1, "a constant for the unwired inputs");
  const controls = ED.orden(opened, "context.call-library.create.all-controls-and-indicators", CTX);
  assert.ok(kinds(controls).some((kind) => /indicator/.test(kind)), "an indicator for the outputs");
});

test("Configure... and a double click open the dialog with the node's configuration", () => {
  const { g, n } = node(MEAN_LIKE);
  const d = openMenu({ ...ED.inicial(), g }, n.id);
  const configured = ED.orden(d, "context.call-library.configure", CTX);
  assert.equal(configured.menu, null);
  assert.equal(configured.callLibraryDialog.nodo, n.id);
  assert.equal(configured.callLibraryDialog.config.function, "Mean_head");
  assert.deepEqual(configured.callLibraryDialog.config.parameters.map((p) => p.name), ["xH", "mean", "dsperr"]);
  assert.equal(MD.openDialog(configured, null).mod, CLD, "the window shows it as a modal dialog");
  // The double click does the same, and on anything else it changes nothing.
  assert.equal(ED.openCallLibraryConfiguration({ ...ED.inicial(), g }, n.id).callLibraryDialog.nodo, n.id);
  const other = Gr.crearNodo(g, CAT, "add", 0, 0);
  const untouched = { ...ED.inicial(), g: other.g };
  assert.equal(ED.openCallLibraryConfiguration(untouched, other.id), untouched);
  // The browse button asks the window for the system's file dialog; its answer becomes the library box's text.
  const dialog = configured.callLibraryDialog;
  assert.deepEqual(CLD.click(dialog, `${CLD.DIALOG_ID}.browse`), { browse: true });
  assert.equal(CLD.withLibrary(dialog, "/usr/lib/libm.so.6").config.library, "/usr/lib/libm.so.6");
});

// ——— The dialog ———

/** The window's way to a click on a part of the open dialog: the intent, and the dialog it leaves when it is a new state. */
function clickPart(d, part) {
  const open = MD.openDialog(d, null);
  const intent = MD.clickIntent(open, `${CLD.DIALOG_ID}.${part}`);
  return { intent, d: intent?.dialog ? { ...d, callLibraryDialog: intent.dialog } : d };
}
const clickParts = (d, ...parts) => parts.reduce((current, part) => clickPart(current, part).d, d);
function typeKeys(d, ...keys) {
  let current = d;
  for (const key of keys) {
    const intent = MD.keyIntent(MD.openDialog(current, null), { key });
    if (intent?.dialog) current = { ...current, callLibraryDialog: intent.dialog };
  }
  return current;
}
const accept = (d) => MD.accepted(MD.openDialog(d, null), d.g);
const dialogOf = (config) => { const { g, n } = node(config); return { d: ED.openCallLibraryConfiguration({ ...ED.inicial(), g }, n.id), id: n.id }; };
const view = (d) => MD.openDialog(d, null).mod.view(INV, MD.openDialog(d, null).dialog);

test("the dialog opens with the measured tabs, rings and defaults", () => {
  const { d } = dialogOf({});
  const dialog = d.callLibraryDialog;
  assert.deepEqual([CLD.SIZE.width, CLD.SIZE.height, dialog.titulo], [677, 458, "Call Library Function"]);
  assert.equal(dialog.tab, "function");
  const functionTab = view(d);
  for (const tab of ["Function", "Parameters", "Callbacks", "Error Checking"]) assert.match(functionTab, new RegExp(`>${tab}</div>`), tab);
  // Fresh: Run in UI thread, C, a void prototype (measured: `void  funcName(void );`) and the greyed wizard link.
  assert.match(functionTab, /<span>void  funcName\(void \);<\/span>/);
  assert.match(functionTab, /class="pv-radio marcada" data-id="dialog\.call-library\.thread-ui"/);
  assert.match(functionTab, /class="pv-radio marcada" data-id="dialog\.call-library\.convention-c"/);
  assert.match(functionTab, /class="pv-radio" data-id="dialog\.call-library\.thread-any"/);
  assert.match(functionTab, /class="pv-radio" data-id="dialog\.call-library\.convention-stdcall"/);
  assert.match(functionTab, /class="pv-check" data-id="dialog\.call-library\.specify-path"/);
  assert.match(functionTab, /Library name or path/);
  assert.match(functionTab, /Function name/);
  assert.match(functionTab, /class="clfn-enlace hueco" data-id="dialog\.call-library\.wizard"[^>]*>Consider using a wizard instead\.\.\.</);
  assert.match(functionTab, /data-id="dialog\.call-library\.ok"/);
  assert.match(functionTab, /class="pv-boton defecto"/, "OK is the default button");
  assert.ok(esHueco(INV.resolver("dialog.call-library.function-name-list")), "the function list is greyed");
  assert.match(INV.explicacion(INV.resolver("dialog.call-library.function-name-list")).solder, /^Missing: /);
  assert.match(functionTab, /class="clfn-flecha-campo"/, "the function name has its drop-down");
  // Tabs.
  const parameters = view({ ...d, callLibraryDialog: CLD.click(dialog, "dialog.call-library.tab-parameters").dialog });
  assert.match(parameters, />return type</, "the list starts with the return type");
  assert.match(parameters, /class="pv-combo clfn-anillo" data-id="dialog\.call-library\.ring-type"[^>]*><span class="pv-texto clfn-texto">Void</, "its Type is Void by default");
  const callbacks = view({ ...d, callLibraryDialog: CLD.click(dialog, "dialog.call-library.tab-callbacks").dialog });
  for (const part of ["callback-reserve", "callback-unreserve", "callback-abort"]) {
    assert.match(callbacks, new RegExp(`class="pv-combo clfn-anillo hueco" data-id="dialog\\.call-library\\.${part}"`), `${part} is greyed`);
    assert.deepEqual(CLD.click(dialog, `dialog.call-library.${part}`), { explain: true });
  }
  assert.match(callbacks, /MgErr Proc\(InstanceDataPtr \*instanceState\);/);
  const errors = view({ ...d, callLibraryDialog: CLD.click(dialog, "dialog.call-library.tab-error-checking").dialog });
  assert.match(errors, /class="pv-radio marcada" data-id="dialog\.call-library\.error-default"/, "Default is selected");
  for (const level of ["Maximum", "Default", "Disabled"]) assert.match(errors, new RegExp(`${level}</span>`));
  assert.equal([...errors.matchAll(/class="pv-nota clfn-descripcion"/g)].length, 3, "each level has its description");
});

test("the rings of the Parameters tab list what LabVIEW lists, in its order", () => {
  const { d } = dialogOf({});
  const onParameters = clickParts(d, "tab-parameters");
  const options = (current, ring) => {
    const opened = clickPart(current, `ring-${ring}`).d;
    return [...view(opened).matchAll(new RegExp(`data-id="dialog\\.call-library\\.option-${ring}-([^"]+)">([^<]*)<`, "g"))].map((m) => [m[1], m[2].replaceAll("&lt;", "<").replaceAll("&gt;", ">")]);
  };
  // The return type: Void, Numeric, String.
  assert.deepEqual(options(onParameters, "type").map(([value]) => value), [...RETURN_TYPES]);
  assert.deepEqual(options(onParameters, "type").map(([, label]) => label), ["Void", "Numeric", "String"]);
  // A new parameter is arg1, Numeric, Signed 32-bit Integer, by value (measured); its Type lists the nine kinds.
  const added = clickParts(onParameters, "add-parameter");
  assert.deepEqual(added.callLibraryDialog.config.parameters, [newParameter([])]);
  assert.equal(added.callLibraryDialog.current, 1);
  assert.deepEqual(options(added, "type").map(([, label]) => label), ["Numeric", "Array", "String", "Waveform", "Digital Waveform", "Digital Data", "ActiveX", "Adapt to Type", "Instance Data Pointer"]);
  assert.deepEqual(options(added, "type").map(([value]) => value), [...PARAMETER_TYPES]);
  assert.deepEqual(options(added, "data-type").map(([, label]) => label), Object.values(DATA_TYPES).map((type) => type.label));
  assert.equal(options(added, "data-type").length, 12);
  assert.deepEqual(options(added, "pass").map(([, label]) => label), ["Value", "Pointer to Value"]);
  // The type-dependent fields (measured): Array, String and Adapt to Type.
  const labels = (current) => [...view(current).matchAll(/class="pv-etiqueta clfn-etiqueta derecha"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(labels(added), ["Name", "Type", "Data type", "Pass"]);
  const array = clickParts(added, "ring-type", "option-type-array");
  assert.deepEqual(labels(array), ["Name", "Type", "Data type", "Dimensions", "Array format", "Minimum size"]);
  assert.deepEqual(options(array, "array-format").map(([, label]) => label), ["Array Data Pointer", "Array Handle", "Array Handle Pointer"]);
  assert.equal(array.callLibraryDialog.config.parameters[0].dimensions, 1, "Dimensions starts at 1");
  const string = clickParts(added, "ring-type", "option-type-string");
  assert.deepEqual(labels(string), ["Name", "Type", "String format", "Minimum size"]);
  assert.deepEqual(options(string, "string-format").map(([, label]) => label), ["C String Pointer", "Pascal String Pointer", "String Handle", "String Handle Pointer"]);
  const adapt = clickParts(added, "ring-type", "option-type-adapt-to-type");
  assert.deepEqual(labels(adapt), ["Name", "Type", "Data format"]);
  assert.deepEqual(options(adapt, "data-format").map(([, label]) => label), ["Handles by Value", "Pointers to Handles", "Array Data Pointer", "Interface to Data"]);
  assert.deepEqual(labels(clickParts(added, "ring-type", "option-type-instance-data-pointer")), ["Name", "Type"], "Instance Data Pointer has nothing else");
  // Minimum size lists the other parameters, and <None>.
  const two = clickParts(array, "add-parameter");
  const second = clickParts(two, "parameter-1");
  assert.deepEqual(options(second, "minimum-size"), [["none", "<None>"], ["1", "arg2"]], "on the array, the other parameters are listed: arg2");
});

test("Minimum size lists the other parameters and stores the one chosen by name", () => {
  const { d } = dialogOf({ parameters: [{ name: "buffer", type: "string", "string-format": "c-string-pointer" }, { name: "size", type: "numeric", "data-type": "u32", pass: "pointer" }] });
  const onBuffer = clickParts(d, "tab-parameters", "parameter-1");
  const opened = clickPart(onBuffer, "ring-minimum-size").d;
  const choices = [...view(opened).matchAll(/option-minimum-size-([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replaceAll("&lt;", "<").replaceAll("&gt;", ">")]);
  assert.deepEqual(choices, [["none", "<None>"], ["1", "size"]]);
  const chosen = clickParts(opened, "option-minimum-size-1");
  assert.equal(chosen.callLibraryDialog.config.parameters[0]["minimum-size"], "size");
  assert.equal(callLibraryPrototype(chosen.callLibraryDialog.config), "void  funcName(CStr buffer, uint32_t *size);");
  assert.equal(clickParts(chosen, "ring-minimum-size", "option-minimum-size-none").callLibraryDialog.config.parameters[0]["minimum-size"], undefined);
  // Renaming the size parameter keeps the reference to it.
  const renamed = typeKeys(clickParts(chosen, "parameter-2", "name"), "Backspace", "Backspace", "Backspace", "Backspace", "n");
  assert.equal(renamed.callLibraryDialog.config.parameters[1].name, "n");
  assert.equal(renamed.callLibraryDialog.config.parameters[0]["minimum-size"], "n");
});

test("the prototype follows the dialog live", () => {
  const { d } = dialogOf({});
  assert.match(view(d), /<span>void  funcName\(void \);<\/span>/);
  const named = typeKeys(clickParts(d, "function-name"), "G", "e", "t", "T", "i", "c", "k");
  assert.equal(named.callLibraryDialog.config.function, "GetTick", "the box is empty: the typed keys make the name");
  const parameters = clickParts(named, "tab-parameters", "ring-type", "option-type-numeric", "add-parameter");
  assert.match(view(parameters), /<span>int32_t\s+GetTick\(int32_t arg1\);<\/span>/, "measured: `int32_t funcName(int32_t arg1);`");
  const voided = clickParts(parameters, "parameter-0", "ring-type", "option-type-void");
  assert.equal(callLibraryPrototype(voided.callLibraryDialog.config), "void  GetTick(int32_t arg1);");
  const constant = clickParts(parameters, "constant");
  assert.equal(callLibraryPrototype(constant.callLibraryDialog.config), "int32_t GetTick(const int32_t arg1);");
  const pointer = clickParts(parameters, "ring-pass", "option-pass-pointer");
  assert.equal(callLibraryPrototype(pointer.callLibraryDialog.config), "int32_t GetTick(int32_t *arg1);");
  const wide = clickParts(parameters, "ring-data-type", "option-data-type-uptr");
  assert.equal(callLibraryPrototype(wide.callLibraryDialog.config), "int32_t GetTick(uintptr_t arg1);");
});

test("a type Solder does not pass yet is selectable and the dialog says the node cannot run", () => {
  const { d } = dialogOf({ function: "f" });
  const added = clickParts(d, "tab-parameters", "add-parameter");
  const waveform = clickParts(added, "ring-type", "option-type-waveform");
  assert.equal(waveform.callLibraryDialog.config.parameters[0].type, "waveform");
  assert.match(view(waveform), /class="pv-nota clfn-aviso"[^>]*>Solder does not pass this type to a library yet/);
  assert.doesNotMatch(view(added), /clfn-aviso/, "a Numeric parameter carries no note");
  // The node keeps its row (a glyph with "?") but has no terminals for it.
  const applied = accept({ ...waveform, g: waveform.g });
  const configured = nodeOf(applied, waveform.callLibraryDialog.nodo);
  assert.equal(configured.config.parameters[0].type, "waveform");
  assert.equal(D.caja(configured, CTX).alto, 35, "the row is there");
  assert.equal(D.terminales(configured, CTX).some((t) => t.puerto.startsWith("arg-0")), false, "its terminals are not");
  assert.match(CL.callLibraryBody(configured, D.caja(configured, CTX)), />\?</);
  assert.match(Gr.whyCannotRun?.(applied, CAT) ?? "", /|/);
});

test("OK applies the whole configuration as one undo step and the wires follow their parameters", () => {
  const { g, n } = node({ function: "f", parameters: [{ name: "a", type: "numeric", "data-type": "i32", pass: "value" }, { name: "b", type: "numeric", "data-type": "i32", pass: "value" }] });
  // Wire constants into a and b, and the output of b to an indicator.
  let wired = g;
  const wire = (from, fromPort, to, toPort) => { wired = Gr.conectar(wired, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" }).g; };
  const constantA = Gr.crearNodo(wired, CAT, "const", 0, 0); wired = constantA.g;
  const constantB = Gr.crearNodo(wired, CAT, "const", 0, 40); wired = constantB.g;
  const indicator = Gr.crearEnPanel(wired, CAT, "indicator", 300, 40, "out"); wired = indicator.g;
  wire(constantA.id, "result", n.id, "arg-0-in");
  wire(constantB.id, "result", n.id, "arg-1-in");
  wire(n.id, "arg-1-out", indicator.id, "value");
  assert.equal(wired.cables.length, 3);
  let d = ED.openCallLibraryConfiguration({ ...ED.inicial(), g: wired }, n.id);
  let history = H.registrar(H.nuevo(Gr.nuevo()), d.g, undefined);
  // Several changes in one dialog: another function, any thread, stdcall, a new return value, the parameters swapped, one more.
  d = clickParts(d, "thread-any", "convention-stdcall", "tab-error-checking", "error-maximum", "tab-parameters", "parameter-2", "move-up", "add-parameter");
  d = clickParts(d, "parameter-0", "ring-type", "option-type-numeric", "ring-data-type", "option-data-type-u16");
  d = typeKeys(clickParts(d, "tab-function", "function-name"), "2");
  assert.equal(d.g, wired, "nothing is written into the VI until OK");
  assert.deepEqual(clickPart(d, "ok").intent, { accept: true });
  const applied = accept(d);
  const configured = nodeOf(applied, n.id);
  assert.deepEqual([configured.config.thread, configured.config["calling-convention"], configured.config["error-checking"], configured.config.function], ["any", "stdcall", "maximum", "f2"]);
  assert.deepEqual(configured.config["return-type"], { type: "numeric", "data-type": "u16" });
  assert.deepEqual(configured.config.parameters.map((p) => p.name), ["b", "a", "arg3"]);
  assert.equal(configured.config.library, "", "what was not touched stays");
  // b moved to the first place: its wires moved with it, and a's with it to the second.
  const wiresOf = (graph) => graph.cables.map((c) => `${c.de.nodo}.${c.de.puerto}>${c.a.nodo}.${c.a.puerto}`).sort();
  assert.deepEqual(wiresOf(applied), [`${constantA.id}.result>${n.id}.arg-1-in`, `${constantB.id}.result>${n.id}.arg-0-in`, `${n.id}.arg-0-out>${indicator.id}.value`].sort());
  // One step: one Ctrl+Z gives back the node as it was, wires included.
  history = H.registrar(history, applied, CLD.stepName());
  assert.equal(history.antes.length, 2, "the diagram that was built and the OK: the whole dialog is one step");
  assert.equal(H.undoName(history), "Change Attribute");
  const undone = H.deshacer(history);
  assert.equal(undone.g, d.g, "the node and its wires as they were");
  assert.deepEqual(nodeOf(undone.g, n.id).config, nodeOf(wired, n.id).config);
  assert.equal(H.rehacer(undone.h).g, applied, "Redo does the OK again");
  // A parameter deleted takes its wires with it.
  const deleted = accept(clickParts(ED.openCallLibraryConfiguration({ ...ED.inicial(), g: wired }, n.id), "tab-parameters", "parameter-2", "delete-parameter"));
  assert.deepEqual(nodeOf(deleted, n.id).config.parameters.map((p) => p.name), ["a"]);
  assert.deepEqual(wiresOf(deleted), [`${constantA.id}.result>${n.id}.arg-0-in`], "b's two wires are gone");
  // Specify path on diagram adds the path terminals; unticking it takes their wires away.
  const withPath = accept(clickParts(ED.openCallLibraryConfiguration({ ...ED.inicial(), g: wired }, n.id), "specify-path"));
  assert.ok(D.terminales(nodeOf(withPath, n.id), CTX).some((t) => t.puerto === "path-in"));
  assert.equal(withPath.cables.length, 3, "the other wires keep their terminals");
  // An OK that changes nothing is not a step.
  assert.equal(accept(ED.openCallLibraryConfiguration({ ...ED.inicial(), g: wired }, n.id)), wired);
});

test("Cancel and Escape leave the node unchanged", () => {
  const { g, n } = node(MEAN_LIKE);
  let d = ED.openCallLibraryConfiguration({ ...ED.inicial(), g }, n.id);
  d = clickParts(d, "thread-ui", "convention-stdcall", "tab-parameters", "add-parameter");
  assert.deepEqual(clickPart(d, "cancel").intent, { cancel: true });
  assert.deepEqual(clickPart(d, "close").intent, { cancel: true });
  assert.deepEqual(MD.keyIntent(MD.openDialog(d, null), { key: "Escape" }), { cancel: true });
  assert.equal(d.g, g, "the VI is the same object: the draft never touched it");
  assert.deepEqual(nodeOf(d.g, n.id).config, nodeOf(g, n.id).config);
  // Escape closes an open ring first and keeps the dialog.
  const ringOpen = clickPart(d, "ring-type").d;
  const closed = MD.keyIntent(MD.openDialog(ringOpen, null), { key: "Escape" });
  assert.equal(closed.dialog.openRing, null);
  assert.equal(closed.cancel, undefined);
  // Enter accepts, as the default button does.
  assert.deepEqual(MD.keyIntent(MD.openDialog(d, null), { key: "Enter" }), { accept: true });
  // Help is greyed and says why.
  assert.deepEqual(clickPart(d, "help").intent, { explain: true });
  assert.ok(esHueco(INV.resolver("dialog.call-library.help")));
});

test("the text fields take keys and the list moves, deletes and keeps the return type", () => {
  const { d } = dialogOf({ parameters: [{ name: "a", type: "numeric", "data-type": "i32", pass: "value" }, { name: "b", type: "string", "string-format": "c-string-pointer" }] });
  const onList = clickParts(d, "tab-parameters");
  assert.equal(onList.callLibraryDialog.current, 0, "the return type is current at first");
  // The return row has nothing to delete or move, and its Name and Constant are not editable.
  for (const part of ["delete-parameter", "move-up", "move-down", "name", "constant"]) assert.equal(clickPart(onList, part).intent, null, part);
  assert.match(view(onList), /class="pv-check desactivada" data-id="dialog\.call-library\.constant"/);
  // Typing a name.
  const renamed = typeKeys(clickParts(onList, "parameter-1", "name"), "Backspace", "x", "y");
  assert.equal(renamed.callLibraryDialog.config.parameters[0].name, "xy");
  // Moving: up on the first and down on the last do nothing.
  assert.equal(clickPart(clickParts(onList, "parameter-1"), "move-up").intent, null);
  assert.equal(clickPart(clickParts(onList, "parameter-2"), "move-down").intent, null);
  const swapped = clickParts(onList, "parameter-1", "move-down");
  assert.deepEqual(swapped.callLibraryDialog.config.parameters.map((p) => p.name), ["b", "a"]);
  assert.equal(swapped.callLibraryDialog.current, 2, "the row stays selected as it moves");
  // The library box and the browse button.
  const library = typeKeys(clickParts(d, "library"), "l", "i", "b", "m", ".", "*");
  assert.equal(library.callLibraryDialog.config.library, "libm.*");
  // A key with Ctrl goes to the window, not the dialog.
  assert.equal(MD.keyIntent(MD.openDialog(library, null), { key: "a", ctrlKey: true }), null);
});

test("the spec rules and the schema agree with the inventory of the dialog and the menu", () => {
  for (const id of ["dialog.call-library", "dialog.call-library.ok", "dialog.call-library.cancel", "context.call-library", "context.call-library.configure"]) assert.equal(INV.entrada(id).estado, "built", id);
  assert.equal(CLD.UNDO_STEP_NAME, "Change Attribute", "the name of the undo step, as the Express VI's dialogs");
  assert.ok(CAT.bloque("call-library"), "the block is in the catalog");
});
