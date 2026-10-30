// File Dialog as an Express VI in the editor (DT-069, DT-067 (d2)): placed from Advanced File Functions, its configuration dialog
// and its node. Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-10-29-file-dialog-express.md Q1, Q2 and the capture
// file-io/file-dialog/config-dialog.png (1.5 times the screen). What was NOT measured is in the modules' own comments.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { pathToText } from "../../core/model/paths.mjs";
import { aTexto, escribir, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as XD from "../../editor/src/block-diagram/express-dialog.mjs";
import * as FD from "../../editor/src/block-diagram/file-dialog-express-dialog.mjs";
import * as XN from "../../editor/src/block-diagram/express-nodes.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const PALETTE_ID = "palette.functions.programming.file-io.advanced-file-functions.file-dialog";
const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

function dropFileDialog(at = { x: 200, y: 100 }) {
  const picked = ED.coger(ED.inicial(), INV.entrada(PALETTE_ID).bloque);
  const dropped = ED.pulsar(ED.moverA(picked, CTX, at), CTX, { tipo: "fondo" }, at);
  return { d: dropped, id: dropped.g.nodos[0].id };
}

/** The window clicks the part `part` of the open dialog: the new state of the dialog, the intent otherwise. */
function clickPart(d, part) {
  const intent = MD.clickIntent(MD.openDialog(d, null), `${XD.DIALOG_ID}.${part}`);
  return intent?.dialog ? { ...d, expressDialog: intent.dialog } : intent;
}
const stateOf = (d) => d.expressDialog.body;
const accept = (d) => MD.accepted(MD.openDialog(d, null), d.g);

test("File Dialog is placed from Advanced File Functions and opens its configuration dialog", () => {
  const entry = INV.entrada(PALETTE_ID);
  assert.equal(entry.estado, "built");
  assert.equal(entry.bloque, "file-dialog");
  assert.ok(G.EXPRESS_ICONS["file-dialog"] && G.FUNCIONES["file-dialog"] && G.CAJAS["file-dialog"], "its icon and palette glyph");
  assert.notEqual(G.EXPRESS_ICONS["file-dialog"], G.EXPRESS_ICONS["time-delay"], "an icon of its own");
  assert.doesNotMatch(G.FUNCIONES["file-dialog"], /DLG/, "not the placeholder");
  const { d, id } = dropFileDialog();
  assert.equal(nodeOf(d.g, id).config.configured, false);
  assert.equal(d.expressDialog.titulo, "Configure File Dialog [File Dialog]");
  assert.equal(d.expressDialog.dropped, true);
  assert.deepEqual(stateOf(d), { limit: true, selection: "file", existence: "new-or-existing" }, "File, New or existing, one item (measured defaults)");
  assert.deepEqual(MD.clickIntent(MD.openDialog(d, null), `${XD.DIALOG_ID}.cancel`), { cancel: true });
  assert.equal(nodeOf(d.g, id).config.selection, "file", "Cancel keeps the default configuration");
  Gr.tipos(d.g, CAT);
});

test("File Dialog's configuration dialog maps its choices to the node's keys", () => {
  const { d } = dropFileDialog();
  // Folder + New greys File or folder.
  let state = clickPart(clickPart(d, "selection-folder"), "existence-new");
  assert.deepEqual(stateOf(state), { limit: true, selection: "folder", existence: "new" });
  assert.equal(clickPart(state, "selection-file-or-folder"), null, "a greyed radio does nothing");
  assert.match(MD.openDialog(state, null).mod.view(INV, state.expressDialog), /pv-radio[^"]* desactivada" data-id="dialog\.express-vi\.selection-file-or-folder"/);
  // Unchecking Limit greys the radios and forces File + Existing; checking it again leaves File + Existing.
  const several = clickPart(state, "limit");
  assert.deepEqual(stateOf(several), { limit: false, selection: "file", existence: "existing" });
  assert.equal(clickPart(several, "selection-folder"), null);
  assert.equal(clickPart(several, "existence-new"), null);
  assert.deepEqual(stateOf(clickPart(several, "limit")), { limit: true, selection: "file", existence: "existing" });
  // OK writes selection, existence and multiple.
  const configured = accept(several);
  assert.deepEqual(configured.nodos[0].config, { configured: true, selection: "file", existence: "existing", multiple: true, "llb-files": false });
  const folderNew = accept(state);
  assert.deepEqual([folderNew.nodos[0].config.selection, folderNew.nodos[0].config.existence, folderNew.nodos[0].config.multiple], ["folder", "new", false]);
  // It opens with what the node has.
  assert.deepEqual(XD.open(configured.nodos[0], CAT).body, { limit: false, selection: "file", existence: "existing" });
  // The LLB check box and Use UTF-8 are greyed with their reason.
  assert.deepEqual(clickPart(d, "llb-files"), { explain: true });
  assert.deepEqual(clickPart(d, "use-utf-8"), { explain: true });
  assert.match(INV.explicacion(INV.entrada(`${XD.DIALOG_ID}.llb-files`)).solder, /packed project libraries, which Solder does not have/);
  assert.match(INV.explicacion(INV.entrada(`${XD.DIALOG_ID}.use-utf-8`)).solder, /UTF-8 already \(DT-042 §6\)/);
  assert.ok(esHueco(INV.entrada(`${XD.DIALOG_ID}.llb-files`)) && esHueco(INV.entrada(`${XD.DIALOG_ID}.use-utf-8`)));
  for (const part of ["limit", "selection-file", "selection-folder", "selection-file-or-folder", "existence-existing", "existence-new", "existence-new-or-existing"]) assert.ok(!esHueco(INV.entrada(`${XD.DIALOG_ID}.${part}`)), part);
  // The dialog as measured: 440 x 467, groups, notes and the row of buttons.
  const html = MD.openDialog(d, null).mod.view(INV, d.expressDialog);
  assert.match(html, /width:440px;height:466px/);
  assert.match(html, /class="pv-grupo" style="left:15px;top:43px;width:419px;height:154px"><span class="pv-grupo-titulo">Selection Mode/, "frame x 16..434, y 44..198 on screen");
  assert.match(html, /class="pv-grupo" style="left:15px;top:223px;width:419px/, "String Encoding 3 px higher than before");
  assert.match(html, /data-id="dialog\.express-vi\.limit" style="left:27px;top:64\.5px"/);
  assert.match(html, /String Encoding<\/span>/);
  assert.match(html, /Limit selection to single item/);
  assert.match(html, /pv-radio marcada" data-id="dialog\.express-vi\.selection-file" style="left:46\.5px;top:96\.5px"/, "File is chosen, at the left column (x 47 on screen)");
  assert.match(html, /pv-radio marcada" data-id="dialog\.express-vi\.existence-new-or-existing" style="left:203\.5px;top:136\.5px"/, "New or existing, at the right column");
  assert.match(html, /pv-boton hueco" data-id="dialog\.express-vi\.use-utf-8"[^>]*>Use UTF-8/);
  assert.match(html, /left:182px;top:429px;width:78px;height:22px/, "OK");
  assert.match(html, /data-id="dialog\.express-vi\.cancel" style="left:268px;top:429px/);
  assert.match(html, /data-id="dialog\.express-vi\.help" style="left:355px;top:429px/);
  assert.match(html, /cannot be configured back to system encoding/);
  assert.match(html, /cannot contain UTF-8 strings/);
  const ignored = { limit: true };
  assert.equal(FD.key(ignored, "x"), ignored, "the dialog ignores the keys");
});

test("the File Dialog node is 96 x 93 with seven inputs 9 px apart and four outputs 18 px apart", () => {
  const { d, id } = dropFileDialog();
  const node = nodeOf(d.g, id);
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 93]);
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  const centres = (names) => names.map((name) => at[name].y - box.y);
  assert.deepEqual(centres(["start-path", "default-name", "error-in", "pattern", "pattern-label", "button-label", "prompt"]), [6.5, 15.5, 24.5, 33.5, 42.5, 51.5, 60.5], "pitch 9, centres +6..+60 (the mark's middle pixel)");
  assert.deepEqual(centres(["selected-path", "exists", "cancelled", "error-out"]), [6.5, 24.5, 42.5, 60.5], "pitch 18");
  assert.ok(["start-path", "prompt"].every((name) => at[name].x === box.x) && ["selected-path", "error-out"].every((name) => at[name].x === box.x + 95));
  const html = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(html, /class="express-icon" style="left:32px;top:17px"/, "the icon at (32, 17)");
  assert.match(html, />File Dialog<\/div>/, "its caption");
  assert.match(html, /class="express-chevron" style="left:45px;top:84px"/, "the chevron at the bottom");
  assert.match(html, /class="express-caption" style="top:68\.5px;height:11px">File Dialog/, "the caption, 3.5 px higher than first drawn (LabVIEW ink y 70-81)");
  assert.match(html, /width:96px;height:93px/);
  assert.equal([...html.matchAll(/class="express-mark"/g)].length, 11, "a mark for each terminal");
  assert.equal(XN.expressGrabPoint("file-dialog").y, 47, "it hangs by the middle of its own height");
});

test("configured, selected path goes into a row; several items make it selected paths, an array, and break its wire", () => {
  const { d, id } = dropFileDialog();
  let g = d.g;
  const indicator = Gr.crearEnPanel(g, CAT, "path-indicator", 400, 100, "Path");
  g = indicator.g;
  g = Gr.conectar(g, CAT, { nodo: id, puerto: "selected-path", dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" }).g;
  const wire = () => [...Gr.tipos(g, CAT).cables.values()][0];
  assert.ok(!wire().roto, "a path into a path indicator is fine");
  // OK with the defaults: selected path moves into a row, the rest stay on the icon.
  const single = { ...d, g };
  g = accept(single);
  const node = nodeOf(g, id);
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 83 + 16 + 8 + 1], "one row under the top block");
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  assert.equal(at["selected-path"].y - box.y, 83 + 5 + 2.5, "selected path at its row");
  assert.equal(at["selected-path"].zona.alto, 16);
  assert.equal(at["exists"].y - box.y, 22 + 2.5, "exists, cancelled and error out stay on the icon");
  assert.equal(at["error-in"].y - box.y, 22 + 2.5);
  assert.ok(!wire().roto, "the wire is kept");
  assert.match(D.contenido({ ...single, g }, CTX, Gr.tipos(g, CAT)), /class="express-row out last" style="top:83px;height:16px"><span[^>]*>selected path</);
  // Several items: the output is an array of paths called selected paths, and the indicator's wire breaks.
  const severalDialog = clickPart({ ...single, g, expressDialog: XD.open(nodeOf(g, id), CAT) }, "limit");
  g = accept(severalDialog);
  const ports = CAT.puertos(nodeOf(g, id));
  assert.deepEqual([ports.out[0].label, ports.out[0].type], ["selected paths", { array: "path" }]);
  assert.match(wire().roto ?? "", /./, "the wire to the path indicator is broken (measured: the indicator breaks)");
  assert.match(D.contenido({ ...single, g }, CTX, Gr.tipos(g, CAT)), /<span[^>]*>selected paths</);
});

test("the menu of File Dialog names its palette Advanced File Functions, with Examples greyed", () => {
  const { d, id } = dropFileDialog();
  const opened = ED.abrirMenu(d, D.menuDe(nodeOf(d.g, id), null, d.g, false, CAT), id, 0, 0);
  assert.equal(opened.menu.raiz, XN.EXPRESS_MENU);
  assert.equal(ED.variantes(opened, CTX).rotulos.get(`${XN.EXPRESS_MENU}.palette`), "Advanced File Functions Palette");
  assert.ok(esHueco(INV.entrada(`${XN.EXPRESS_MENU}.examples`)), "Examples is greyed (measured greyed on File Dialog)");
  assert.ok(ED.orden(opened, `${XN.EXPRESS_MENU}.properties`, CTX).expressDialog, "Properties opens its dialog");
  assert.equal(ED.openConfiguration(d, CTX, id).expressDialog.titulo, "Configure File Dialog [File Dialog]");
});

test("the configuration of File Dialog is saved and opens the same", () => {
  const { d, id } = dropFileDialog({ x: 50, y: 50 });
  const configured = accept(clickPart(clickPart(d, "selection-folder"), "existence-existing"));
  const text = aTexto(configured, CAT);
  const reopened = leer(text, CAT);
  assert.deepEqual(reopened.nodos[0].config, nodeOf(configured, id).config);
  assert.equal(aTexto(reopened, CAT), text);
  assert.deepEqual(escribir(configured, CAT)["block-diagram"].nodes[0].config, { configured: true, selection: "folder", existence: "existing", multiple: false, "llb-files": false });
});

test("an array of paths shows each element as a path, so a Run with several items can finish drawing", () => {
  const { d, id } = dropFileDialog();
  const several = Gr.fijarConfig(d.g, id, { configured: true, multiple: true });
  // The indicator Create makes for `selected paths` is an array of paths; the Run's value is an array of paths (objects).
  const made = ED.orden(ED.abrirMenu({ ...d, g: several }, "context.function", id, 0, 0, "selected-path", { x: 400, y: 100 }), "context.function.create.indicator", CTX);
  const indicator = made.g.nodos.find((node) => node.tipo === "arr-indicator");
  assert.deepEqual(indicator.config.type, { array: "path" });
  const panel = P.confirmar(P.inicial(made.g));
  const value = [{ kind: 0, components: ["tmp", "a.txt"] }, { kind: 0, components: ["tmp", "b.txt"] }];
  const html = P.contenido({ ...panel, valores: { [indicator.id]: value } }, CTX);
  const shown = (path) => `<span class="sd-value"><span>${pathToText(path, CTX.pathRules)}</span>`;
  assert.ok(html.includes(shown(value[0])), "the first element is a path display");
  assert.ok(html.includes('class="sd-path-cell"'), "each element has the path's cell (the array shows one element until it is stretched)");
  assert.doesNotThrow(() => P.contenido({ ...panel, valores: { [indicator.id]: [] } }, CTX), "an empty array, which a cancelled Run gives");
});

test("All Controls and Indicators and All Constants on the node keep the objects inside the canvas, even near its top", () => {
  const near = Gr.crearNodo(Gr.nuevo(), CAT, "file-dialog", 20, 10);
  for (const item of ["all-controls-and-indicators", "all-constants"]) {
    const made = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: near.g }, XN.EXPRESS_MENU, near.id, 0, 0), `${XN.EXPRESS_MENU}.create.${item}`, CTX);
    const objects = made.g.nodos.filter((node) => node.id !== near.id);
    assert.ok(objects.length >= 7, `${item}: the objects were made`);
    assert.ok(objects.every((node) => node.x >= 0 && node.y >= 0), `${item}: none above or left of the canvas`);
    for (const side of [objects.filter((node) => node.x < near.g.nodos[0].x), objects.filter((node) => node.x > near.g.nodos[0].x)]) {
      const ys = side.map((node) => node.y);
      assert.equal(new Set(ys).size, ys.length, `${item}: still one above the other on each side`);
    }
  }
  // Away from the edge nothing moves: the stack sits where the terminals put it.
  const far = Gr.crearNodo(Gr.nuevo(), CAT, "file-dialog", 300, 300);
  const made = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: far.g }, XN.EXPRESS_MENU, far.id, 0, 0), `${XN.EXPRESS_MENU}.create.all-constants`, CTX);
  assert.equal(Math.min(...made.g.nodos.filter((node) => node.id !== far.id).map((node) => node.y)), 187);
});

test("a path terminal's menu names the File I/O Palette", () => {
  const { d, id } = dropFileDialog();
  const open = (port) => ED.abrirMenu(d, "context.function", id, 0, 0, port, { x: 300, y: 120 });
  assert.equal(ED.variantes(open("start-path"), CTX).rotulos.get("context.function.numeric-palette"), "File I/O Palette");
  assert.equal(ED.variantes(open("selected-path"), CTX).rotulos.get("context.function.numeric-palette"), "File I/O Palette");
  assert.equal(ED.variantes(open("error-in"), CTX).rotulos.get("context.function.numeric-palette"), "Dialog & User Interface Palette");
  assert.equal(ED.variantes(open("prompt"), CTX).rotulos?.get("context.function.numeric-palette"), undefined, "a string keeps the default");
});
