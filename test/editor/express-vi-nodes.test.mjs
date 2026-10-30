// Express VIs in the editor (DT-069, stage A, on Time Delay): placing one asks for its configuration, the node as LabVIEW
// draws it in its two states, the dialog, its OK as one undo step, the right-click menu and the file. Measured in LabVIEW 2026
// Q3: labview-captures/reports/2026-10-29-express-vi-common.md and 2026-10-29-time-delay.md. What was NOT measured is written
// down in editor/src/block-diagram/express-nodes.mjs (where a configured node keeps its icon and its other terminals).

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import { aTexto, escribir, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as XD from "../../editor/src/block-diagram/express-dialog.mjs";
import * as TD from "../../editor/src/block-diagram/time-delay-dialog.mjs";
import * as XN from "../../editor/src/block-diagram/express-nodes.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import * as EM from "../../editor/src/window/edit-menu.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV, leer as readJson } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const TIME_DELAY = "palette.functions.programming.timing.time-delay";
const MENU = "context.express-vi";
const nodeOf = (g, id) => g.nodos.find((node) => node.id === id);

/** Time Delay dropped from the palette as the editor does it: picked, moved to the diagram and clicked down. */
function dropTimeDelay(at = { x: 200, y: 100 }) {
  const entry = INV.entrada(TIME_DELAY);
  const picked = ED.coger(ED.inicial(), entry.bloque);
  const dropped = ED.pulsar(ED.moverA(picked, CTX, at), CTX, { tipo: "fondo" }, at);
  return { d: dropped, id: dropped.g.nodos[0].id };
}

/** What the window does with the intent of a click on a part of the open dialog. */
function clickDialog(d, part, side = "diagram") {
  const open = MD.openDialog(side === "diagram" ? d : null, null);
  return { open, intent: MD.clickIntent(open, `${XD.DIALOG_ID}.${part}`) };
}

/** What the window does with a key typed into the open dialog: the dialog it leaves, or the intent if it is not just a new state. */
function typeIntoDialog(d, keys) {
  let current = d;
  for (const key of keys) {
    const intent = MD.keyIntent(MD.openDialog(current, null), { key });
    if (intent?.dialog) current = { ...current, expressDialog: intent.dialog };
  }
  return current;
}

const accept = (d) => MD.accepted(MD.openDialog(d, null), d.g);

test("Time Delay is placed from the Timing palette and opens its configuration dialog", () => {
  const entry = INV.entrada(TIME_DELAY);
  assert.equal(entry.estado, "built");
  assert.equal(entry.bloque, "time-delay");
  assert.ok(G.FUNCIONES["time-delay"] && G.CAJAS["time-delay"] && G.EXPRESS_ICONS["time-delay"], "its palette glyph and its node icon");
  const { d, id } = dropTimeDelay();
  const node = nodeOf(d.g, id);
  assert.equal(node.tipo, "time-delay");
  assert.equal(node.config.configured, false, "dropped, it is unconfigured");
  const open = MD.openDialog(d, null);
  assert.equal(open?.mod, XD, "the shared dialog frame drives it");
  assert.equal(open.dialog.titulo, "Configure Time Delay [Time Delay]", "the title is Configure <name> [<caption>] (measured)");
  assert.equal(open.dialog.dropped, true);
  assert.equal(open.dialog.body.text, "1.000", "it opens with the node's 1 s");
  Gr.tipos(d.g, CAT); // resolves with nothing wired
});

test("the configuration dialog opens as Time Delay is dropped and Cancel keeps the node unconfigured", () => {
  const { d, id } = dropTimeDelay();
  const { intent } = clickDialog(d, "cancel");
  assert.deepEqual(intent, { cancel: true });
  assert.deepEqual(MD.keyIntent(MD.openDialog(d, null), { key: "Escape" }), { cancel: true });
  assert.deepEqual(clickDialog(d, "close").intent, { cancel: true }, "the X of the title bar cancels too");
  // Cancelling changes nothing in the VI: the node stays, as dropped.
  assert.equal(nodeOf(d.g, id).config.configured, false);
  assert.equal(nodeOf(d.g, id).config.delay, 1);
  // The dialog shows the buttons OK (default), Cancel and Help, Help greyed with its reason (the editor has no help yet).
  const html = MD.openDialog(d, null).mod.view(INV, d.expressDialog);
  assert.match(html, /data-id="dialog\.express-vi\.ok"/);
  assert.match(html, /pv-boton defecto" data-id="dialog\.express-vi\.ok"/, "OK is the default button");
  assert.match(html, /pv-boton hueco" data-id="dialog\.express-vi\.help"/, "Help is greyed");
  assert.deepEqual(clickDialog(d, "help").intent, { explain: true });
  assert.equal(INV.entrada(`${XD.DIALOG_ID}.help`).necesita, "ayuda-contextual");
  assert.match(html, /Configure Time Delay \[Time Delay\]/);
  assert.match(html, /Time delay \(seconds\)/);
});

test("OK configures the node as one undo step named Change Attribute", () => {
  const { d, id } = dropTimeDelay();
  let history = H.registrar(H.nuevo(Gr.nuevo()), d.g, undefined);
  assert.equal(H.undoName(history), undefined, "the drop is a step with no name");
  const typed = typeIntoDialog(d, ["2", ".", "5"]);
  assert.deepEqual(clickDialog(typed, "ok").intent, { accept: true });
  const configured = accept(typed);
  assert.deepEqual([nodeOf(configured, id).config.configured, nodeOf(configured, id).config.delay], [true, 2.5]);
  history = H.registrar(history, configured, XD.stepName());
  assert.equal(history.antes.length, 2, "the placing and the OK: two steps, the OK is one");
  assert.equal(H.undoName(history), "Change Attribute");
  assert.equal(EM.editMenuVariants("block-diagram", { canUndo: true, canRedo: false, canCopy: false, hasSelection: false, clipboardFilled: false, undoName: H.undoName(history) }).rotulos.get("window.block-diagram.menu.edit.undo"), "Undo Change Attribute");
  const undone = H.deshacer(history);
  assert.equal(nodeOf(undone.g, id).config.configured, false, "one Ctrl+Z returns the unconfigured node");
  assert.equal(nodeOf(undone.g, id).config.delay, 1);
  assert.equal(H.undoName(undone.h), undefined, "and the step before has no name");
  assert.equal(H.redoName(undone.h), "Change Attribute");
  assert.equal(H.rehacer(undone.h).g, configured, "Redo does the OK again");
  // An OK with nothing changed still configures an unconfigured node (measured) ...
  const plain = accept(d);
  assert.equal(nodeOf(plain, id).config.configured, true);
  assert.equal(nodeOf(plain, id).config.delay, 1);
  // ... but on a configured node an OK that changes nothing is not a step to undo.
  const again = { ...d, g: plain, expressDialog: XD.open(nodeOf(plain, id), CAT) };
  assert.equal(accept(again), plain);
});

test("the field of Time Delay's dialog shows three decimals, keeps the value whole and a negative becomes 0", () => {
  const node = (delay) => ({ id: "n1", tipo: "time-delay", config: { configured: true, delay } });
  const open = (delay) => XD.open(node(delay), CAT);
  assert.equal(open(2.123456).body.text, "2.123", "shown with three decimals (measured)");
  assert.equal(TD.changes(open(2.123456).body).delay, 2.123456, "and kept whole (measured)");
  const typed = (keys, delay = 1) => TD.changes(keys.reduce((body, key) => TD.key(body, key), open(delay).body)).delay;
  assert.equal(typed(["-", "5"]), 0, "a negative number becomes 0 (measured)");
  assert.equal(typed(["0", ".", "0", "0", "1", "5"]), 0.0015);
  assert.equal(typed(["1", "e", "9"]), 1e9, "there is no greatest (measured)");
  assert.equal(typed(["2", ",", "5"]), 2.5, "a comma is the decimal point");
  assert.equal(typed(["a", "b"], 3), 3, "what is not a number is not typed (unverified: LabVIEW's own rule)");
  assert.equal(typed(["Backspace"], 3), 3, "an empty field goes back to the value it opened with (unverified)");
  assert.equal(typed(["5", "Backspace", "7"]), 7);
  // The first key replaces the selected text; the next ones go after it.
  const dialog = open(1.5);
  assert.equal(TD.key(dialog.body, "9").text, "9");
  // Keys: Enter accepts, a key with Ctrl is not for the dialog, and a key the field does not take changes nothing.
  assert.deepEqual(XD.key(dialog, { key: "Enter" }), { accept: true });
  assert.equal(XD.key(dialog, { key: "s", ctrlKey: true }), null);
  assert.equal(XD.key(dialog, { key: "x" }), null);
  assert.equal(XD.key(dialog, { key: "4" }).dialog.body.text, "4");
});

test("the Time Delay node is drawn as measured: 96 x 67 with its icon, caption, chevron and edge terminals", () => {
  const { d, id } = dropTimeDelay();
  const node = nodeOf(d.g, id);
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 67]);
  // Terminals: 3 x 5 marks at y 4, 22 and 33 (measured, compare report); the wire attaches at the middle of the mark.
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  assert.deepEqual([at["delay-time"].x, at["delay-time"].y - box.y, at["delay-time"].dir], [box.x, 4 + 2.5, "in"]);
  assert.deepEqual([at["error-in"].x, at["error-in"].y - box.y], [box.x, 33 + 2.5]);
  assert.deepEqual([at["error-out"].x, at["error-out"].y - box.y, at["error-out"].dir], [box.x + 95, 22 + 2.5, "out"]);
  const html = D.contenido(d, CTX, Gr.tipos(d.g, CAT));
  assert.match(html, /class="express-icon" style="left:32px;top:4px"><svg viewBox="0 0 32 32"/, "the 32 x 32 icon at (32, 4)");
  assert.match(html, />Time Delay<\/div>/, "the caption");
  assert.match(html, /class="express-chevron" style="left:45px;top:58px"><svg viewBox="0 0 7 7"[^>]*><path d="M0\.5 0\.5L3\.5 3\.5L6\.5 0\.5M0\.5 3\.5L3\.5 6\.5L6\.5 3\.5" fill="none" stroke="var\(--express-chevron\)"/, "the grey double chevron, 7 x 7 at (45, 58)");
  assert.match(html, /width:96px;height:67px/);
  const marks = [...html.matchAll(/class="express-mark" style="left:(\d+)px;top:([\d.]+)px"><svg width="3" height="5"[^>]*><path d="M0 0h1v5h-1zM1 1h1v3h-1zM2 2h1v1h-1z" fill="(#[0-9a-f]+)"/g)].map(([, left, top, color]) => [Number(left), Number(top), color]);
  assert.deepEqual(marks, [[2, 4, "#ff7f00"], [2, 33, "#7f7f00"], [91, 22, "#7f7f00"]], "right-pointing triangles 1 px inside the border: left x 2, right x 91; Delay Time orange, the error clusters #7f7f00");
  assert.doesNotMatch(html, /express-row/, "no rows while unconfigured");
  // The look is tokens, so a theme can take them: the measured colours are in both themes.
  assert.match(G.EXPRESS_ICONS["time-delay"], /rx="3"/);
  assert.match(G.EXPRESS_ICONS["time-delay"], /<rect x="2" y="1" width="28" height="2" fill="var\(--express-icon-bar\)"\/>/, "one black row, then a 2 px bar (rows 5 and 6 of the node)");
});

test("configured, the Delay Time terminal leaves the icon for a white row and the node is 96 x 82", () => {
  const { d, id } = dropTimeDelay();
  const configured = { ...d, g: accept(d) };
  const node = nodeOf(configured.g, id);
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 82]);
  assert.equal(box.y, nodeOf(d.g, id).y, "nothing moves up: the node only grows downwards (measured)");
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  assert.deepEqual([at["delay-time"].x, at["delay-time"].y - box.y], [box.x, 62 + 2.5], "Delay Time at its row, mark at y 62");
  assert.equal(at["delay-time"].zona.alto, 16, "and its zone is the row");
  assert.deepEqual([at["error-in"].x, at["error-in"].y - box.y], [box.x, 33 + 2.5], "the others stay on the icon where they were");
  assert.deepEqual([at["error-out"].x, at["error-out"].y - box.y], [box.x + 95, 22 + 2.5]);
  const html = D.contenido(configured, CTX, Gr.tipos(configured.g, CAT));
  assert.match(html, /class="express-row in last" style="top:57px;height:16px"><span style="left:13px;color:#ff7f00">Delay Time \(s\)<\/span>/, "the row, lines at y 57 and 72, its label at x 14");
  assert.match(html, /class="express-icon" style="left:32px;top:4px"/, "the icon stays at (32, 4)");
  assert.match(html, /class="express-chevron" style="left:45px;top:73px"/, "the chevron under the row");
  const marks = [...html.matchAll(/class="express-mark" style="left:(\d+)px;top:([\d.]+)px"><svg[^>]*><path[^>]*fill="([^"]+)"/g)].map(([, left, top, color]) => [Number(left), Number(top), color]);
  assert.deepEqual(marks, [[2, 62, "var(--express-black)"], [2, 33, "#7f7f00"], [91, 22, "#7f7f00"]], "the row's terminal is a black triangle at x 2, y 62; the others keep their type colour");
  assert.match(html, /width:96px;height:82px/);
  assert.equal(XN.ROW_PITCH, 16);
});

test("a wire to a terminal that moves into a row stays through the reconfiguration", () => {
  const { d, id } = dropTimeDelay();
  const constant = Gr.crearNodo(d.g, CAT, "const", 20, 60);
  const wired = Gr.conectar(constant.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: id, puerto: "delay-time", dir: "in" });
  assert.equal(wired.motivo, undefined);
  const before = { ...d, g: wired.g };
  const after = { ...before, g: accept(before) };
  assert.deepEqual(after.g.cables.map((c) => [c.de.nodo, c.de.puerto, c.a.nodo, c.a.puerto]), before.g.cables.map((c) => [c.de.nodo, c.de.puerto, c.a.nodo, c.a.puerto]), "the wire is the same one");
  const ends = D.extremos(after.g, CTX);
  const row = ends.get(`${id}.delay-time`);
  assert.equal(row.y - D.caja(nodeOf(after.g, id), CTX).y, 62 + 2.5, "and now it ends at the row");
  assert.ok([...Gr.tipos(after.g, CAT).cables.values()].every((cable) => !cable.roto));
  assert.match(D.contenido(after, CTX, Gr.tipos(after.g, CAT)), /<svg class="cables"/, "and the diagram draws it");
});

test("the right-click menu of an Express VI is the one measured", () => {
  const { d, id } = dropTimeDelay();
  const node = nodeOf(d.g, id);
  assert.equal(D.menuDe(node, null, d.g, false, CAT), MENU, "the body has the Express VI menu");
  assert.equal(D.menuDe(node, "delay-time", d.g, false, CAT), "context.function", "a terminal keeps the function's");
  const rows = INV.hijos(MENU).map((row) => `${row.etiqueta}${row.separado ? " |" : ""}`);
  assert.deepEqual(rows, [
    "Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint |", "Disable Breakpoint", "Palette |", "Replace", "Open Front Panel |",
    "Size To Text |", "View As Icon", "Remove and Rewire |", "Create", "Properties |",
  ], "Visible Items, Help, Examples, Description, —, Add Breakpoint, —, <Palette>, Replace, —, Open Front Panel, —, Size To Text, View As Icon, —, Remove and Rewire, Create, —, Properties (Disable Breakpoint only with a breakpoint)");
  assert.deepEqual(INV.hijos(`${MENU}.visible-items`).map((row) => row.etiqueta), ["Caption"]);
  assert.deepEqual(INV.hijos(`${MENU}.create`).map((row) => row.etiqueta), ["Constant", "Control", "Indicator", "Channel Writer...", "All Controls and Indicators", "All Constants"]);
  // The palette row is named after the Express VI's palette, and Caption is ticked (measured).
  const opened = ED.abrirMenu(d, MENU, id, 0, 0);
  assert.equal(ED.variantes(opened, CTX).rotulos.get(`${MENU}.palette`), "Timing Palette");
  assert.ok(ED.marcados(opened, CTX).has(`${MENU}.visible-items.caption`));
  assert.ok(!ED.marcados(opened, CTX).has(`${MENU}.view-as-icon`), "View As Icon is not ticked on the node's default look (measured)");
  const html = D.menuContextual(INV, opened.menu, ED.marcados(opened, CTX), undefined, ED.variantes(opened, CTX));
  assert.match(html, />Timing Palette</);
  assert.equal((html.match(/class="separador-menu"/g) ?? []).length, 6, "six separators");
  // What the editor cannot do greys with its reason (DT-035): Open Front Panel says why, as every row without code.
  const frontPanel = INV.entrada(`${MENU}.open-front-panel`);
  assert.ok(esHueco(frontPanel));
  assert.match(INV.explicacion(frontPanel).solder, /converting an Express OVI to a standard subOVI.*DT-069 §7/);
  for (const row of ["help", "examples", "description-and-tip", "palette", "replace", "size-to-text", "remove-and-rewire", "visible-items.caption"]) assert.ok(esHueco(INV.entrada(`${MENU}.${row}`)), row);
  for (const row of ["add-breakpoint", "create", "properties", "view-as-icon"]) assert.ok(!esHueco(INV.entrada(`${MENU}.${row}`)), row);
  // Create ▸ Constant, Control and Indicator need a terminal and are greyed on the body.
  const { desactivados } = ED.variantes(opened, CTX);
  for (const row of ["constant", "control", "indicator"]) assert.ok(desactivados.has(`${MENU}.create.${row}`), row);
});

test("All Constants from the menu of an Express VI wires constants to the inputs that have none", () => {
  const { d, id } = dropTimeDelay();
  const made = ED.orden(ED.abrirMenu(d, MENU, id, 0, 0), `${MENU}.create.all-constants`, CTX);
  assert.equal(made.menu, null);
  assert.deepEqual(made.g.cables.map((c) => c.a.puerto).sort(), ["delay-time", "error-in"]);
  const created = ED.orden(ED.abrirMenu(d, MENU, id, 0, 0), `${MENU}.create.all-controls-and-indicators`, CTX);
  assert.ok(created.g.cables.length >= 3, "controls for the inputs and an indicator for the output");
});

test("a double click and Properties open the same configuration dialog", () => {
  const { d, id } = dropTimeDelay();
  const configured = { ...d, g: accept(d), expressDialog: null };
  const delayed = { ...configured, g: Gr.fijarConfig(configured.g, id, { delay: 2.123456 }) };
  const byDoubleClick = ED.openConfiguration(delayed, CTX, id);
  const byProperties = ED.orden(ED.abrirMenu(delayed, MENU, id, 0, 0), `${MENU}.properties`, CTX);
  assert.deepEqual(byProperties.expressDialog, byDoubleClick.expressDialog);
  assert.equal(byDoubleClick.expressDialog.titulo, "Configure Time Delay [Time Delay]");
  assert.equal(byDoubleClick.expressDialog.body.text, "2.123", "it opens with the configured value");
  assert.equal(byDoubleClick.expressDialog.dropped, false);
  assert.equal(byProperties.menu, null);
  // What is not an Express VI, or whose dialog is not done, is left alone.
  const add = Gr.crearNodo(Gr.nuevo(), CAT, "add", 0, 0);
  assert.equal(ED.openConfiguration({ ...ED.inicial(), g: add.g }, CTX, add.id).expressDialog, undefined);
  assert.equal(XD.hasDialog("time-delay"), true);
  assert.equal(XD.hasDialog("wait-ms"), false);
});

// ——— The file ———

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(readJson("docs/schema/qvi.schema.json"));

test("the configuration of an Express VI is saved and opens the same, and the file meets the schema", () => {
  const { d, id } = dropTimeDelay({ x: 50, y: 50 });
  const configured = Gr.fijarConfig(accept(typeIntoDialog(d, ["2", ".", "5"])), id, {});
  for (const g of [d.g, configured]) {
    const file = escribir(g, CAT);
    assert.ok(validate(file), JSON.stringify(validate.errors));
    const reopened = leer(aTexto(g, CAT), CAT);
    assert.deepEqual(nodeOf(reopened, reopened.nodos[0].id).config, nodeOf(g, id).config);
    assert.equal(aTexto(reopened, CAT), aTexto(g, CAT), "saving what was opened gives the same file");
  }
  assert.deepEqual(escribir(configured, CAT)["block-diagram"].nodes.find((node) => node.type === "time-delay").config, { configured: true, delay: 2.5 });
  assert.deepEqual(escribir(d.g, CAT)["block-diagram"].nodes.find((node) => node.type === "time-delay").config, { configured: false, delay: 1 });
  // A negative delay is not a valid file.
  const negative = escribir(configured, CAT);
  negative["block-diagram"].nodes.find((node) => node.type === "time-delay").config.delay = -1;
  assert.equal(validate(negative), false);
});

test("Time Delay's dialog has the measured layout and spin arrows that step the field", () => {
  const { d } = dropTimeDelay();
  const html = MD.openDialog(d, null).mod.view(INV, d.expressDialog);
  assert.match(html, /class="pv-boton defecto" data-id="dialog\.express-vi\.ok" style="left:14px;top:105px;width:82px;height:22px"/, "buttons 82 x 22 at x 14, 110, 206 and y 105");
  assert.match(html, /data-id="dialog\.express-vi\.cancel" style="left:110px;top:105px/);
  assert.match(html, /data-id="dialog\.express-vi\.help" style="left:206px;top:105px/);
  assert.match(html, /class="pv-campo" style="left:13px;top:60px;width:80px;height:22px"/, "field 80 x 22 at (13, 60)");
  assert.match(html, /class="pv-nota" style="left:16px;top:46px"/, "the label at (16, 46)");
  const up = MD.clickIntent(MD.openDialog(d, null), "dialog.express-vi.spin-up");
  assert.equal(up.dialog.body.text, "2.000", "the up arrow adds 1 (unverified step)");
  const down = MD.clickIntent(MD.openDialog({ ...d, expressDialog: up.dialog }, null), "dialog.express-vi.spin-down");
  assert.equal(TD.changes(down.dialog.body).delay, 1);
  const floor = MD.clickIntent(MD.openDialog({ ...d, expressDialog: down.dialog }, null), "dialog.express-vi.spin-down");
  assert.equal(TD.changes(MD.clickIntent(MD.openDialog({ ...d, expressDialog: floor.dialog }, null), "dialog.express-vi.spin-down").dialog.body).delay, 0, "never below 0");
  assert.equal(MD.clickIntent(MD.openDialog(d, null), "dialog.express-vi.nothing"), null);
});

test("an error terminal's menu names the Dialog & User Interface Palette and Create works on the first click", () => {
  const { d, id } = dropTimeDelay();
  const node = nodeOf(d.g, id);
  const open = (port) => ED.abrirMenu(d, "context.function", id, 0, 0, port, { x: 300, y: 120 });
  assert.equal(ED.variantes(open("error-out"), CTX).rotulos.get("context.function.numeric-palette"), "Dialog & User Interface Palette");
  assert.equal(ED.variantes(open("error-in"), CTX).rotulos.get("context.function.numeric-palette"), "Dialog & User Interface Palette");
  assert.equal(ED.variantes(open("delay-time"), CTX).rotulos?.get("context.function.numeric-palette"), undefined, "a number keeps Numeric Palette");
  for (const [port, kind, wired] of [["error-out", "indicator", true], ["error-in", "constant", true], ["delay-time", "control", true]]) {
    const made = ED.orden(open(port), `context.function.create.${kind}`, CTX);
    assert.equal(made.g.nodos.length, d.g.nodos.length + 1, `${port}: one object`);
    assert.equal(made.g.cables.length, wired ? 1 : 0, `${port}: wired at once`);
  }
  assert.equal(D.menuDe(node, "error-out", d.g, false, CAT), "context.function");
});

test("the Palette row of the Express VI menu has its submenu arrow", () => {
  const { d, id } = dropTimeDelay();
  const opened = ED.abrirMenu(d, MENU, id, 0, 0);
  const html = D.menuContextual(INV, opened.menu, ED.marcados(opened, CTX), undefined, ED.variantes(opened, CTX));
  assert.match(html, /data-id="context\.express-vi\.palette"[^>]*>(?:(?!<\/div>).)*flecha-menu/, "Timing Palette ▸");
});

// ——— Stage B: the rows grown by the bottom edge and View As Icon ———

/** Drags the bottom edge of the node `rows` rows down (negative: up) and lets go, as the window does. */
function dragBottomEdge(d, id, rows) {
  const box = D.caja(nodeOf(d.g, id), CTX);
  const start = { x: box.x + 48, y: box.y + box.alto - 1 };
  const grabbed = ED.pulsar(d, CTX, { tipo: "asa", nodo: id, lado: "abajo" }, start);
  const moved = ED.moverA(grabbed, CTX, { x: start.x, y: start.y + rows * XN.ROW_PITCH });
  return ED.soltar(moved, CTX, null, { x: start.x, y: start.y + rows * XN.ROW_PITCH });
}

test("dragging the bottom edge grows the rows in connector order, never below the configured ones, in one undo step", () => {
  const { d, id } = dropTimeDelay();
  assert.match(D.contenido(d, CTX, Gr.tipos(d.g, CAT)), /class="asa oculta express-edge"[^>]*data-asa="abajo"/, "the bottom edge has its handle");
  let history = H.registrar(H.nuevo(Gr.nuevo()), d.g);
  const grown = dragBottomEdge(d, id, 3);
  assert.equal(grown.accion, null);
  history = H.registrar(history, grown.g, undefined);
  const node = nodeOf(grown.g, id);
  assert.equal(node.vista.rows, 3, "the number of rows is kept in the node (capped at the terminals it has)");
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [96, 114], "67 -> 114 (measured)");
  const html = D.contenido(grown, CTX, Gr.tipos(grown.g, CAT));
  const labels = [...html.matchAll(/class="express-row (in|out)[^"]*"[^>]*><span[^>]*color:(#[0-9a-f]+)"[^>]*>([^<]*)</g)].map(([, side, color, label]) => [side, color, label]);
  assert.deepEqual(labels, [["in", "#ff7f00", "Delay Time (s)"], ["in", "#7f7f00", "error in (no error)"], ["out", "#7f7f00", "error out"]], "the terminals in connector order, with their type's colour");
  assert.match(html, /express-row in" style="top:57px/);
  assert.doesNotMatch(html, /express-chevron/, "no chevron once every terminal is a row (measured)");
  assert.match(html, /left:6px;color:#7f7f00">error in \(no error\)</, "an input label that does not fit moves left to x 7 (measured on error in)");
  assert.match(html, /left:13px;color:#ff7f00">Delay Time/, "one that fits starts at x 14");
  assert.match(html, /left:44\.5px;color:#7f7f00" class="centred">error out</, "an output's label is centred on x 45.5 (measured)");
  assert.match(html, /express-row out last" style="top:89px/, "16 px pitch, the last row's bottom line closes them");
  // A terminal in a row leaves the icon: every mark is in a row, and wires attach there.
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  assert.deepEqual([at["delay-time"].y - box.y, at["error-in"].y - box.y, at["error-out"].y - box.y], [62 + 2.5, 78 + 2.5, 94 + 2.5]);
  assert.equal(at["error-out"].x, box.x + 95);
  assert.deepEqual([...html.matchAll(/class="express-mark" style="left:(\d+)px/g)].map(([, left]) => Number(left)), [2, 2, 91]);
  // One Ctrl+Z restores the 96 x 67.
  assert.equal(history.antes.length, 2);
  const undone = H.deshacer(history);
  assert.deepEqual([D.caja(nodeOf(undone.g, id), CTX).ancho, D.caja(nodeOf(undone.g, id), CTX).alto], [96, 67]);
  // Dragging up removes rows, but not below the configured ones.
  const configured = { ...grown, g: accept({ ...grown, expressDialog: XD.open(node, CAT) }) };
  assert.equal(D.caja(nodeOf(configured.g, id), CTX).alto, 114, "configuring keeps the rows that were dragged out");
  const shrunk = dragBottomEdge(configured, id, -5);
  assert.equal(D.caja(nodeOf(shrunk.g, id), CTX).alto, 82, "one row, the configured one");
  assert.equal(nodeOf(shrunk.g, id).vista, undefined, "and nothing is kept for the rows");
  assert.equal(D.caja(nodeOf(dragBottomEdge(d, id, 1).g, id), CTX).alto, 82, "one step adds one row");
  assert.equal(D.caja(nodeOf(dragBottomEdge(d, id, 9).g, id), CTX).alto, 114, "no more rows than terminals");
});

test("the rows of an Express VI node are saved with its view and open the same", () => {
  const { d, id } = dropTimeDelay({ x: 50, y: 50 });
  const grown = dragBottomEdge(d, id, 2).g;
  const file = escribir(grown, CAT);
  assert.ok(validate(file), JSON.stringify(validate.errors));
  assert.equal(file.layout.diagram["time-delay_1"].rows, 2);
  // View As Icon is written as `true` when on, and absent when off (a terminal's is `false`: its default is the icon).
  const asIcon = Gr.alternarIcono(grown, grown.nodos[0].id);
  const iconFile = escribir(asIcon, CAT);
  assert.equal(iconFile.layout.diagram["time-delay_1"]["view-as-icon"], true);
  assert.ok(validate(iconFile), JSON.stringify(validate.errors));
  assert.equal(nodeOf(leer(aTexto(asIcon, CAT), CAT), grown.nodos[0].id).vista.compacto, true);
  assert.equal("view-as-icon" in escribir(grown, CAT).layout.diagram["time-delay_1"], false);
  const terminal = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 0, 0, "Numeric");
  assert.equal(escribir(Gr.alternarIcono(terminal.g, terminal.id), CAT).layout.diagram[terminal.g.nodos[0].name]["view-as-icon"], false, "a terminal keeps its convention");
  const reopened = leer(aTexto(grown, CAT), CAT);
  assert.equal(nodeOf(reopened, reopened.nodos[0].id).vista.rows, 2);
  assert.equal(aTexto(reopened, CAT), aTexto(grown, CAT));
  const withoutRows = escribir(d.g, CAT);
  assert.equal("rows" in withoutRows.layout.diagram["time-delay_1"], false);
  const zero = escribir(grown, CAT);
  zero.layout.diagram["time-delay_1"].rows = 0;
  assert.equal(validate(zero), false);
});

test("View As Icon draws the node as 38 x 38 with its own menu, and toggling it back restores the rows", () => {
  const { d, id } = dropTimeDelay();
  const configured = { ...d, g: accept(d) };
  const wired = Gr.conectar(Gr.crearNodo(configured.g, CAT, "const", 0, 0).g, CAT, { nodo: "n2", puerto: "result", dir: "out" }, { nodo: id, puerto: "delay-time", dir: "in" });
  const before = { ...configured, g: wired.g };
  // Not done yet in the normal menu: the row is built and toggles the icon view.
  assert.ok(!esHueco(INV.entrada(`${MENU}.view-as-icon`)));
  const toggled = ED.orden(ED.abrirMenu(before, MENU, id, 0, 0), `${MENU}.view-as-icon`, CTX);
  const node = nodeOf(toggled.g, id);
  const box = D.caja(node, CTX);
  assert.deepEqual([box.ancho, box.alto], [38, 38]);
  const html = D.contenido(toggled, CTX, Gr.tipos(toggled.g, CAT));
  assert.match(html, /class="express-frame icon-view"/);
  assert.match(html, /class="express-icon" style="left:3px;top:3px"/, "the icon at (3, 3)");
  assert.doesNotMatch(html.match(/<div class="express-frame icon-view">.*?<\/svg>/)[0], /border-radius|rx=|<path/, "the corners are a hard stepped chamfer, not an arc");
  assert.match(html, /<rect x="4" y="1" width="1" height="1"/, "the staircase of 5 px: the first row starts at x 5 and the next at x 4");
  assert.match(html, /<rect x="0" y="5" width="1" height="1"/, "and the last step at x 0");
  assert.match(html, /<rect x="0" y="32" width="1" height="1"/, "the same at the bottom left: the sixth row from the bottom at x 0");
  assert.match(html, /<rect x="4" y="36" width="1" height="1"/);
  for (const absent of ["express-caption", "express-chevron", "express-row", "express-mark", "express-edge"]) assert.doesNotMatch(html, new RegExp(absent), `${absent} is not drawn`);
  // Wires attach to the edges of the icon: Delay Time higher on the left, error in and error out at mid height.
  const at = Object.fromEntries(D.terminales(node, CTX).map((t) => [t.puerto, t]));
  assert.deepEqual([at["delay-time"].x, at["error-in"].x, at["error-out"].x], [box.x, box.x, box.x + 37]);
  assert.deepEqual([at["delay-time"].y - box.y, at["error-in"].y - box.y, at["error-out"].y - box.y], [15, 31, 31], "the wires meet the box at y 15 and 31 (measured)");
  assert.equal(toggled.g.cables.length, 1, "the wire is kept");
  // Toggling off restores the rows; each toggle is one step.
  const back = ED.orden(ED.abrirMenu(toggled, D.menuDe(node, null, toggled.g, false, CAT), id, 0, 0), `${XN.EXPRESS_ICON_MENU}.view-as-icon`, CTX);
  assert.deepEqual([D.caja(nodeOf(back.g, id), CTX).ancho, D.caja(nodeOf(back.g, id), CTX).alto], [96, 82]);
  assert.equal(H.deshacer(H.registrar(H.nuevo(before.g), toggled.g)).g, before.g, "one Ctrl+Z undoes the toggle");
  // A grown node keeps its rows through the icon view.
  const grown = dragBottomEdge(d, id, 2);
  const iconGrown = ED.orden(ED.abrirMenu(grown, MENU, id, 0, 0), `${MENU}.view-as-icon`, CTX);
  const restored = ED.orden(ED.abrirMenu(iconGrown, XN.EXPRESS_ICON_MENU, id, 0, 0), `${XN.EXPRESS_ICON_MENU}.view-as-icon`, CTX);
  assert.equal(D.caja(nodeOf(restored.g, id), CTX).alto, D.caja(nodeOf(grown.g, id), CTX).alto);
});

test("in the icon view the menu has the measured rows in their order", () => {
  const { d, id } = dropTimeDelay();
  const iconView = { ...d, g: Gr.alternarIcono(d.g, id) };
  const node = nodeOf(iconView.g, id);
  assert.equal(D.menuDe(node, null, iconView.g, false, CAT), XN.EXPRESS_ICON_MENU);
  const rows = INV.hijos(XN.EXPRESS_ICON_MENU).map((row) => `${row.etiqueta}${row.separado ? " |" : ""}`);
  assert.deepEqual(rows, ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint |", "Disable Breakpoint", "Palette |", "Create", "Replace |", "Open Front Panel |", "View As Icon |", "Remove and Rewire |", "Properties |"], "Size To Text is gone and Create comes before Replace");
  const opened = ED.abrirMenu(iconView, XN.EXPRESS_ICON_MENU, id, 0, 0);
  assert.ok(ED.marcados(opened, CTX).has(`${XN.EXPRESS_ICON_MENU}.view-as-icon`), "View As Icon is ticked");
  assert.equal(ED.variantes(opened, CTX).rotulos.get(`${XN.EXPRESS_ICON_MENU}.palette`), "Timing Palette");
  assert.ok(!ED.marcados(ED.abrirMenu(d, MENU, id, 0, 0), CTX).has(`${MENU}.view-as-icon`), "unticked on the normal node");
  const html = D.menuContextual(INV, opened.menu, ED.marcados(opened, CTX), undefined, ED.variantes(opened, CTX));
  assert.equal((html.match(/class="separador-menu"/g) ?? []).length, 7, "seven separators, the first after Description and Tip...");
  const made = ED.orden(opened, `${XN.EXPRESS_ICON_MENU}.create.all-constants`, CTX);
  assert.equal(made.g.cables.length, 2);
  assert.ok(ED.orden(opened, `${XN.EXPRESS_ICON_MENU}.properties`, CTX).expressDialog, "Properties opens the dialog from the icon view");
});
