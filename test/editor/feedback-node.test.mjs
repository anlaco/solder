// The Feedback Node in the editor (DT-109): its place in Functions ▸ Programming ▸ Structures, its size, cells, colours and
// terminals, its right-click menu, its Properties dialog, and what is saved. Every number comes from
// labview-captures/reports/2026-11-26-feedback-node-look.md (the look, the dialog) and 2026-11-26-feedback-node-behavior.md
// (the menu), and from the captures menu2c.png, dlg1c.png and dlg2c.png; what the reports did not say is marked in the modules.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import * as FB from "../../editor/src/block-diagram/feedback-node-geometry.mjs";
import * as FD from "../../editor/src/block-diagram/feedback-node-dialog.mjs";
import { feedbackBody } from "../../editor/src/block-diagram/feedback-node-view.mjs";
import * as DS from "../../editor/src/debugging/debug-state.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import * as MD from "../../editor/src/window/modal-dialog.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { celdasSubpaleta } from "../../editor/src/window/window-view.mjs";
import { CAT, INV, buildOVI } from "../helpers.mjs";
import { OLD_SCHOOL_TOKENS } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const STRUCTURES = "palette.functions.programming.structures";
const ENTRY = `${STRUCTURES}.feedback-node`;
const nodeOf = (g, id) => g.nodos.find((candidate) => candidate.id === id);

/** A Feedback Node at (100, 60) on a diagram of its own, with `config` merged into the palette's configuration. */
function node(config = {}) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, "feedback-node", 100, 60);
  const g = Gr.fijarConfig(created.g, created.id, config);
  return { g, id: created.id, n: nodeOf(g, created.id) };
}
const sizeOf = (config) => { const { n } = node(config); const box = D.caja(n, CTX); return [box.ancho, box.alto]; };
const rect = (zone) => [zone.x, zone.y, zone.ancho, zone.alto];

/** A Feedback Node whose initializer is wired from `constant` (a block and its config), alone on the diagram. */
function withInitializer(block, constantConfig, config = {}) {
  const feedback = node(config);
  const created = Gr.crearNodo(feedback.g, CAT, block, 0, 0);
  const configured = Gr.fijarConfig(created.g, created.id, constantConfig);
  const wired = Gr.conectar(configured, CAT, { nodo: created.id, puerto: "result", dir: "out" }, { nodo: feedback.id, puerto: "initializer", dir: "in" });
  assert.equal(wired.motivo, undefined);
  return { g: wired.g, id: feedback.id };
}

// ——— The palette ———

test("the Feedback Node is placeable from Structures and a dropped one has the palette's configuration", () => {
  const entry = INV.entrada(ENTRY);
  assert.equal(entry.estado, "built");
  assert.equal(esHueco(entry), false);
  assert.equal(entry.bloque, "feedback-node");
  assert.ok(celdasSubpaleta(INV, STRUCTURES).sitios.some((site) => site.e.id === ENTRY), "it is in the folder's grid");
  const dropped = ED.pulsar(ED.moverA(ED.coger(ED.inicial(), entry.bloque), CTX, { x: 100, y: 100 }), CTX, { tipo: "fondo" }, { x: 100, y: 100 });
  const placed = dropped.g.nodos[0];
  assert.equal(placed.tipo, "feedback-node");
  assert.deepEqual(placed.config, { delay: 1, initializerLoopsOut: 0, direction: "left", showEnable: false, header: "arrow" }, "arrow left, delay 1, initializer on the node");
  assert.equal(dropped.g.cables.length, 0, "initializer unwired");
  assert.deepEqual(dropped.seleccion, [placed.id]);
  assert.equal(dropped.feedbackDialog, undefined, "no dialog when it is dropped");
});

// ——— Size and cells ———

test("the Feedback Node is 32 x 24 and grows with the delay, the enable cell, the Z-transform header and an initializer moved out", () => {
  assert.deepEqual(sizeOf({}), [32, 24], "one box: the arrow cell over the initializer cell");
  assert.deepEqual([1, 2, 3, 9].map((delay) => sizeOf({ delay })[0]), [32, 39, 39, 39], "one digit: 7 px wider (delay 3: 39)");
  assert.deepEqual(sizeOf({ delay: 12 }), [45, 24], "two digits: 13 px wider");
  assert.deepEqual(sizeOf({ showEnable: true }), [32, 36], "the 12 px enable cell");
  assert.deepEqual(sizeOf({ header: "z-transform" }), [32, 48], "the 24 px Z row");
  assert.deepEqual(sizeOf({ header: "z-transform", delay: 3 }), [32, 48], "the number leaves the arrow row: the width is back to 32");
  assert.deepEqual(sizeOf({ initializerLoopsOut: 1 }), [32, 13], "the arrow row alone when the initializer is on a loop");
  assert.deepEqual(sizeOf({ delay: 0 }), [32, 24], "LabVIEW ignores a delay of 0 or less");
  const stack = (config) => FB.cellStack(FB.feedbackConfig({ config }));
  assert.deepEqual(stack({ showEnable: true }).cells, { arrow: { top: 0, height: 12 }, enable: { top: 12, height: 12 }, initializer: { top: 24, height: 12 } });
  assert.equal(stack({ header: "z-transform" }).cells.initializer.top, 36, "the initializer of the 48 px node is at y + 36");
});

test("the terminals of the Feedback Node are the measured rectangles, swapped by the direction of the arrow", () => {
  const rects = (config) => { const { n } = node(config); return Object.fromEntries(D.terminales(n, CTX, undefined, Gr.nuevo()).map((t) => [t.puerto, rect(t.zona)])); };
  const [x, y] = [100, 60];
  const left = rects({});
  assert.deepEqual(left.input, [x + 16, y, 16, 12], "arrow left: the input is the right half of the arrow cell");
  assert.deepEqual(left.output, [x, y, 16, 12], "and the output the left half");
  assert.deepEqual(left.initializer, [x, y + 12, 32, 12], "the initializer cell, the whole width");
  const right = rects({ direction: "right" });
  assert.deepEqual([right.input, right.output], [[x, y, 16, 12], [x + 16, y, 16, 12]], "arrow right: input left, output right");
  assert.deepEqual(right.initializer, left.initializer, "the other cells are not mirrored");
  assert.deepEqual(rects({ delay: 12 }).output.concat(rects({ delay: 12 }).input), [x, y, 16, 12, x + 29, y, 16, 12], "delay 12: the halves at x and x + 29");
  const shown = rects({ showEnable: true });
  assert.deepEqual([shown.enable, shown.initializer], [[x, y + 12, 32, 12], [x, y + 24, 32, 12]], "enable (x, y + 12), the initializer moves down");
  assert.equal(rects({ header: "z-transform" }).initializer[1], y + 36);
  const { n } = node({});
  assert.deepEqual(D.terminales(n, CTX, undefined, Gr.nuevo()).map((t) => t.puerto), ["input", "output", "initializer", "enable"], "LabVIEW's Terminals[] order");
});

test("a wire reaches the middle of the arrow cell on its edge and the initializer at the bottom centre", () => {
  const point = (config, port) => { const { n } = node(config); const t = D.terminales(n, CTX, undefined, Gr.nuevo()).find((candidate) => candidate.puerto === port); return [t.x, t.y]; };
  assert.deepEqual(point({}, "input"), [132, 66], "arrow left: the input wire is on the right edge");
  assert.deepEqual(point({}, "output"), [100, 66], "and the output's on the left edge");
  assert.deepEqual(point({ direction: "right" }, "input"), [100, 66]);
  assert.deepEqual(point({ direction: "right" }, "output"), [132, 66]);
  assert.deepEqual(point({}, "initializer"), [116, 84], "the bottom centre");
  assert.deepEqual(point({ showEnable: true }, "initializer"), [116, 96], "of the taller node");
  const { g, n } = node({});
  const constant = Gr.crearNodo(g, CAT, "const", 0, 0);
  const wired = Gr.conectar(constant.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: n.id, puerto: "input", dir: "in" });
  const ends = D.extremos(wired.g, CTX);
  assert.deepEqual([ends.get(`${n.id}.input`).x, ends.get(`${n.id}.input`).y], [132, 66]);
});

test("the enable terminal is there only while Show Enable Terminal is on", () => {
  const html = (config) => { const { g, n } = node(config); return D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT)).match(new RegExp(`data-nodo="${n.id}" data-puerto="enable"`)); };
  assert.equal(html({}), null);
  assert.ok(html({ showEnable: true }));
});

// ——— Drawing ———

const bodyOf = (config, resolved, state) => { const { n } = node(config); return feedbackBody(n, D.caja(n, CTX), resolved, state); };

test("the Feedback Node is drawn in the colour of its type: black while unknown, then blue, orange, pink and green", () => {
  const typed = (block, constantConfig) => { const { g, id } = withInitializer(block, constantConfig); return feedbackBody(nodeOf(g, id), D.caja(nodeOf(g, id), CTX), Gr.tipos(g, CAT), { wired: { initializer: true } }); };
  assert.match(bodyOf({}), /fill="#000000"/, "unresolved: black");
  assert.doesNotMatch(bodyOf({}), /#0000ff|#ff7f00|#ff00ff|#007f00/);
  const colours = { integer: typed("num-const", { value: 0, type: "i32" }), double: typed("const", { value: 0.5 }), string: typed("str-const", { value: "x" }), boolean: typed("bool-const", { value: true }) };
  assert.match(colours.integer, /fill="#0000ff"/);
  assert.match(colours.double, /fill="#ff7f00"/);
  assert.match(colours.string, /fill="#ff00ff"/);
  assert.match(colours.boolean, /fill="#007f00"/);
  // The inside is a token of the theme, and Old School's is the measured #ffffcc.
  assert.match(colours.integer, /fill="var\(--feedback-node-fill\)"/);
  assert.equal(OLD_SCHOOL_TOKENS.get("--feedback-node-fill"), "#ffffcc");
  assert.doesNotMatch(colours.integer, /fill="#000000"/, "nothing of a known type stays black");
});

test("the arrow, the number, the glyphs and the Z row are drawn where they were measured", () => {
  const arrowLeft = bodyOf({});
  assert.match(arrowLeft, /<polygon points="6,6 12,3 12,9"/, "left arrow: the tip at x + 6, a head 6 wide and 6 tall");
  assert.match(arrowLeft, /<rect x="12" y="5" width="14" height="2"/, "and a 2 px shaft at rows 5 and 6 up to x + 25");
  assert.match(bodyOf({ direction: "right" }), /<polygon points="26,6 20,3 20,9"/, "right arrow: the tip at x + 26");
  assert.match(bodyOf({ direction: "right" }), /<rect x="7" y="5" width="13" height="2"/, "the shaft from x + 7");
  assert.doesNotMatch(arrowLeft, /class="feedback-delay"/, "delay 1 shows no number");
  const delayed = bodyOf({ delay: 3 });
  assert.match(delayed, /<text x="16" y="10.5"[^>]*class="feedback-delay">3<\/text>/, "delay 3: the digit at x + 16, in the arrow cell");
  assert.match(delayed, /viewBox="0 0 39 24"/);
  assert.match(bodyOf({ delay: 10, direction: "right" }), /class="feedback-delay">10</);
  // The initializer cell: an asterisk while unwired, a stem over an up triangle when wired; a moved-out one has no cell at all.
  assert.match(arrowLeft, /<line /, "the asterisk");
  const wired = bodyOf({}, undefined, { wired: { initializer: true } });
  assert.doesNotMatch(wired, /<line /);
  assert.match(wired, /<polygon points="16,19 19,22 13,22"/, "the up triangle: rows 19 to 21, 6 px wide");
  assert.match(wired, /<rect x="15" y="14" width="2" height="2"/, "the stem's dashes: rows 14-15 and 17-18");
  assert.match(wired, /<rect x="15" y="17" width="2" height="2"/);
  assert.doesNotMatch(bodyOf({ initializerLoopsOut: 1 }), /<line |<polygon points="16,/);
  // Show enable: a green question mark while unwired.
  assert.match(bodyOf({ showEnable: true }), /fill="#007f00"[^>]*font-weight="bold">\?</);
  assert.doesNotMatch(bodyOf({ showEnable: true }, undefined, { wired: { enable: true } }), />\?</);
  // The Z-transform header: a Z and -N at the top right, no number in the arrow row.
  const z = bodyOf({ header: "z-transform", delay: 3 });
  assert.match(z, /class="feedback-z">Z</);
  assert.match(z, /class="feedback-exponent">-3</);
  assert.doesNotMatch(z, /class="feedback-delay"/);
  assert.match(bodyOf({ header: "z-transform" }), /class="feedback-exponent">-1</);
});

test("moved out of its loop the initializer is a 16 x 12 terminal on the loop's left border, level with i", () => {
  const vi = buildOVI(CAT, (b) => {
    b.loop("loop", "for-loop");
    b.node("fb", "feedback-node", { initializerLoopsOut: 1 }, "loop");
  });
  const feedback = nodeOf(vi.g, vi.id.fb);
  const loop = nodeOf(vi.g, vi.id.loop);
  const loopBox = D.caja(loop, CTX);
  const initializer = D.terminales(feedback, CTX, undefined, vi.g).find((t) => t.puerto === "initializer");
  const expected = [loopBox.x, loopBox.y + loopBox.alto - D.MEDIDAS_ESTRUCTURA.sobreElPie - 3, 16, 12];
  assert.deepEqual(rect(initializer.zona), expected, "level with the loop's bottom, 3 px above the top of the iteration terminal");
  assert.deepEqual([initializer.x, initializer.y], [loopBox.x, expected[1] + 6], "the wire ends on its left edge, in the middle");
  const body = feedbackBody(feedback, D.caja(feedback, CTX), Gr.tipos(vi.g, CAT), { loopTerminalBox: { x: expected[0], y: expected[1], ancho: 16, alto: 12 } });
  assert.match(body, /<polygon points="[^"]*"[^>]*\/><\/svg>$/, "the diamond is drawn last, in the type's colour");
  assert.match(body, /fill="var\(--feedback-node-fill\)"/);
  assert.equal(FB.initializerLoopId(vi.g, feedback), vi.id.loop);
  // The loop that is not there leaves the initializer at the node's bottom.
  const loose = node({ initializerLoopsOut: 1 });
  assert.equal(D.terminales(loose.n, CTX, undefined, loose.g).find((t) => t.puerto === "initializer").x, loose.n.x + 16);
  // The drawn wire ends on the loop's terminal.
  const constant = Gr.crearNodo(vi.g, CAT, "const", 0, 0);
  const wired = Gr.conectar(constant.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: vi.id.fb, puerto: "initializer", dir: "in" });
  assert.deepEqual([D.extremos(wired.g, CTX).get(`${vi.id.fb}.initializer`).x, D.extremos(wired.g, CTX).get(`${vi.id.fb}.initializer`).y], [initializer.x, initializer.y]);
});

// ——— The right-click menu ———

const openMenu = (d, nodeId, port = null) => ED.abrirMenu(d, D.menuDe(nodeOf(d.g, nodeId), port, d.g, false, CAT), nodeId, 5, 6, port);

/** The rows of a right-click menu (or of one of its submenus): label, greyed, ticked, and a separator before it. */
function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), (text) => text.length * 6, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[3], label: m[4].replaceAll("&amp;", "&"), greyed: /hueco|desactivado/.test(m[2]), separated: !!m[1], checked: /marcado/.test(m[2]),
  }));
}
const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);
const shown = (rows) => rows.flatMap((row) => (row.separated ? ["---", row.label] : [row.label]));
const ROOT = "context.feedback-node";

/** A Feedback Node inside `depth` For Loops, one in the other (the outermost 300 x 200 at the origin, each next one 30 px in), on a diagram. */
function nestedNode(depth, config = {}) {
  let g = Gr.nuevo();
  let outer;
  for (let level = 0; level < depth; level++) {
    const loop = Gr.crearEstructura(g, CAT, "for-loop", 30 * level, 30 * level, 300 - 60 * level, 200 - 60 * level);
    g = outer ? Gr.meter(loop.g, CAT, [loop.id], outer) : loop.g;
    outer = loop.id;
  }
  const created = Gr.crearNodo(g, CAT, "feedback-node", 30 * depth + 20, 30 * depth + 20);
  g = Gr.fijarConfig(created.g, created.id, config);
  return { g: depth ? Gr.meter(g, CAT, [created.id], outer) : g, id: { fb: created.id } };
}

test("the right-click menu of the Feedback Node has LabVIEW's rows in order and greys what does not apply", () => {
  const { g, id } = withInitializer("str-const", { value: "x" });
  const d = openMenu({ ...ED.inicial(), g }, id);
  assert.equal(d.menu.raiz, ROOT);
  const rows = menuRows(d);
  // As in menu2c.png: separators after Description and Tip, Add Breakpoint, Create, Appearance, Replace and Remove and Rewire.
  assert.deepEqual(shown(rows), [
    "Visible Items", "Help", "Examples", "Description and Tip...", "---", "Add Breakpoint", "---", "Structures Palette", "String Palette", "Create", "---",
    "Show Enable Terminal", "Globally Initialize", "Move Initializer One Loop Out", "Move Initializer One Loop In", "Change Direction", "Appearance", "---",
    "Replace with Shift Register", "---", "Remove and Rewire", "---", "Properties",
  ]);
  assert.deepEqual(rows.filter((row) => row.greyed).map((row) => row.label), [
    "Visible Items", "Help", "Examples", "Description and Tip...", "Structures Palette", "String Palette", "Move Initializer One Loop Out",
    "Move Initializer One Loop In", "Appearance", "Replace with Shift Register", "Remove and Rewire",
  ], "outside a loop both Move rows are greyed, as in the capture");
  for (const hole of rows.filter((row) => row.greyed && !/Move|Replace with Shift Register/.test(row.label))) assert.match(INV.explicacion(INV.resolver(hole.id)).solder, /^Missing: /, hole.label);
  assert.deepEqual(rows.filter((row) => row.checked).map((row) => row.label), ["Globally Initialize"], "ticked on its row, as seen");
  const initialize = menuRows(hover(d, `${ROOT}.globally-initialize`), `${ROOT}.globally-initialize`);
  assert.deepEqual(initialize.map((row) => [row.label, row.checked, row.greyed]), [["Initialize On First Call", true, false], ["Initialize On Compile Or Load", false, true]]);
  assert.match(INV.explicacion(INV.resolver(initialize[1].id)).solder, /not built yet/, "greyed, saying why");
  assert.equal(INV.entrada(`${ROOT}.replace-with-shift-register`).estado, "built", "built: greyed here only because the node is in no loop (feedback-node-insertion.test.mjs)");
  assert.deepEqual(menuRows(hover(d, `${ROOT}.create`), `${ROOT}.create`).map((row) => row.label), ["Constant", "Control", "Indicator"]);
  // A numeric node says Numeric Palette; the menu is the node's from every terminal.
  const numeric = withInitializer("num-const", { value: 0, type: "i32" });
  assert.ok(shown(menuRows(openMenu({ ...ED.inicial(), g: numeric.g }, numeric.id))).includes("Numeric Palette"));
  assert.equal(D.menuDe(nodeOf(g, id), "output", g, false, CAT), ROOT);
  assert.equal(D.menuDe(nodeOf(g, id), null, g, false, CAT), ROOT);
});

test("Show Enable Terminal, Change Direction and Move Initializer One Loop Out and In change the node's configuration", () => {
  // Show Enable Terminal ticks, and takes the cell away again; a wired enable terminal stays.
  const { g, id } = node({});
  let d = ED.orden(openMenu({ ...ED.inicial(), g }, id), `${ROOT}.show-enable-terminal`, CTX);
  assert.equal(nodeOf(d.g, id).config.showEnable, true);
  assert.equal(d.menu, null);
  assert.ok(menuRows(openMenu(d, id)).find((row) => row.label === "Show Enable Terminal").checked);
  const wiredEnable = Gr.conectar(Gr.crearNodo(d.g, CAT, "bool-const", 0, 0).g, CAT, { nodo: `n${d.g.siguiente}`, puerto: "result", dir: "out" }, { nodo: id, puerto: "enable", dir: "in" });
  assert.equal(wiredEnable.motivo, undefined);
  const refused = ED.orden(openMenu({ ...d, g: wiredEnable.g }, id), `${ROOT}.show-enable-terminal`, CTX);
  assert.equal(nodeOf(refused.g, id).config.showEnable, true, "it does not go away under a wire");
  assert.equal(refused.aviso.texto, "The enable terminal is wired.");
  d = ED.orden(openMenu(d, id), `${ROOT}.show-enable-terminal`, CTX);
  assert.equal(nodeOf(d.g, id).config.showEnable, false);
  // Change Direction swaps the arrow; Initialize On First Call does nothing but close the menu.
  d = ED.orden(openMenu(d, id), `${ROOT}.change-direction`, CTX);
  assert.equal(nodeOf(d.g, id).config.direction, "right");
  assert.equal(nodeOf(ED.orden(openMenu(d, id), `${ROOT}.change-direction`, CTX).g, id).config.direction, "left");
  assert.equal(ED.orden(openMenu(d, id), `${ROOT}.globally-initialize.initialize-on-first-call`, CTX).g, d.g);
  // Move Initializer One Loop Out and In, clamped to the loops the node is in.
  const vi = nestedNode(2);
  let nested = { ...ED.inicial(), g: vi.g };
  const rowsOf = () => Object.fromEntries(menuRows(openMenu(nested, vi.id.fb)).map((row) => [row.label, row.greyed]));
  const loopsOut = () => nodeOf(nested.g, vi.id.fb).config.initializerLoopsOut;
  assert.deepEqual([rowsOf()["Move Initializer One Loop Out"], rowsOf()["Move Initializer One Loop In"]], [false, true], "in two loops: Out enabled, In greyed at 0");
  nested = ED.orden(openMenu(nested, vi.id.fb), `${ROOT}.move-initializer-one-loop-out`, CTX);
  assert.equal(loopsOut(), 1);
  assert.deepEqual([rowsOf()["Move Initializer One Loop Out"], rowsOf()["Move Initializer One Loop In"]], [false, false]);
  nested = ED.orden(openMenu(nested, vi.id.fb), `${ROOT}.move-initializer-one-loop-out`, CTX);
  assert.equal(loopsOut(), 2);
  assert.deepEqual([rowsOf()["Move Initializer One Loop Out"], rowsOf()["Move Initializer One Loop In"]], [true, false], "Out greyed with no loop left, as measured");
  assert.equal(ED.orden(openMenu(nested, vi.id.fb), `${ROOT}.move-initializer-one-loop-out`, CTX).g, nested.g, "and it does nothing");
  nested = ED.orden(openMenu(nested, vi.id.fb), `${ROOT}.move-initializer-one-loop-in`, CTX);
  assert.equal(loopsOut(), 1);
  // Dragged out of its loops, the node's initializer comes back to the outermost loop that is left.
  const twoOut = Gr.fijarConfig(vi.g, vi.id.fb, { initializerLoopsOut: 2 });
  assert.equal(nodeOf(ED.alojar(twoOut, CTX, [vi.id.fb]), vi.id.fb).config.initializerLoopsOut, 2, "still in both loops");
  const away = Gr.mover(twoOut, [vi.id.fb], 600, 600);
  assert.equal(nodeOf(ED.alojar(away, CTX, [vi.id.fb]), vi.id.fb).config.initializerLoopsOut, 0, "out of every loop there is no loop to hold the initializer");
  // Every change is one step of undo.
  const history = H.registrar(H.registrar(H.nuevo(Gr.nuevo()), g, undefined), ED.orden(openMenu({ ...ED.inicial(), g }, id), `${ROOT}.change-direction`, CTX).g, "Change Direction");
  assert.equal(nodeOf(H.deshacer(history).g, id).config.direction, "left");
});

test("Create works from a terminal of the Feedback Node and Add Breakpoint is one of its rows", () => {
  const { g, id } = withInitializer("num-const", { value: 0, type: "i32" });
  const onBody = menuRows(hover(openMenu({ ...ED.inicial(), g }, id), `${ROOT}.create`), `${ROOT}.create`);
  assert.deepEqual(onBody.map((row) => [row.label, row.greyed]), [["Constant", true], ["Control", true], ["Indicator", true]], "on the body they need a terminal, as for every node");
  const onOutput = openMenu({ ...ED.inicial(), g }, id, "output");
  assert.equal(menuRows(hover(onOutput, `${ROOT}.create`), `${ROOT}.create`).some((row) => row.greyed), false, "on a terminal they work");
  const created = ED.orden(onOutput, `${ROOT}.create.indicator`, CTX);
  assert.ok(created.g.cables.some((wire) => wire.de.nodo === id && wire.de.puerto === "output"), "an indicator wired to the output");
  // The breakpoint rows are the debugger's, by the menu's root, as for a function.
  const state = DS.addBreakpoint(DS.initial(), { node: id });
  const variants = DV.menuVariants(state, g, Gr.tipos(g, CAT), { raiz: ROOT, nodo: id });
  assert.equal(variants.rotulos.get(`${ROOT}.add-breakpoint`), "Remove Breakpoint");
  assert.match(D.menuContextual(INV, { raiz: ROOT, x: 0, y: 0 }, new Set(), (text) => text.length * 7, variants), /Remove Breakpoint[\s\S]*Disable Breakpoint/);
  assert.equal(INV.entrada(`${ROOT}.add-breakpoint`).estado, "built");
});

// ——— The Properties dialog ———

const dialogPart = (part) => `${FD.DIALOG_ID}.${part}`;
function press(d, ...parts) {
  return parts.reduce((current, part) => {
    const intent = MD.clickIntent(MD.openDialog(current, null), dialogPart(part));
    return intent?.dialog ? { ...current, feedbackDialog: intent.dialog } : current;
  }, d);
}
function type(d, text) {
  let current = d;
  for (const key of [...text]) {
    const intent = MD.keyIntent(MD.openDialog(current, null), { key });
    if (intent?.dialog) current = { ...current, feedbackDialog: intent.dialog };
  }
  return current;
}
const accepted = (d) => MD.accepted(MD.openDialog(d, null), d.g);
const dialogFor = (config) => { const { g, id } = node(config); return { d: ED.orden(openMenu({ ...ED.inicial(), g }, id), `${ROOT}.properties`, CTX), id }; };
const dialogView = (d) => MD.openDialog(d, null).mod.view(INV, MD.openDialog(d, null).dialog);

test("the Properties dialog opens with the node's configuration and OK applies it as one undo step", () => {
  const { d, id } = dialogFor({});
  assert.equal(MD.openDialog(d, null).mod, FD, "the window shows it as a modal dialog");
  assert.deepEqual([FD.SIZE.width, FD.SIZE.height, FD.TITLE], [503, 500, "Object Properties"]);
  assert.equal(d.menu, null);
  assert.deepEqual(d.seleccion, [id]);
  // Appearance: Label (not visible, "Feedback Node"), Position, Header Appearance, Arrow Direction; Configuration: Delay and the rest.
  const appearance = dialogView(d);
  for (const text of ["Appearance", "Configuration", "Label", "Visible", "Position", "Left", "Top", "Header Appearance", "Arrow only", "Z-transform and arrow", "Arrow Direction", "Arrow points left", "Arrow points right", "OK", "Cancel", "Help"]) assert.match(appearance, new RegExp(`>${text}<`), text);
  assert.match(appearance, />Feedback Node</);
  assert.match(appearance, />100</);
  assert.match(appearance, />60</);
  const configuration = dialogView(press(d, "tab-configuration"));
  for (const text of ["Delay", "Show enable terminal", "Initialization", "First call", "Compile or load"]) assert.match(configuration, new RegExp(`>${text}<`), text);
  assert.match(configuration, /class="pv-campo clfn-campo"[^>]*><span class="clfn-texto[^"]*">1<\/span>/, "Delay 1 by default");
  assert.match(configuration, /class="pv-radio hueco"[^>]*data-id="dialog\.feedback-node\.initialize-compile-or-load"/, "Compile or load is greyed");
  assert.match(INV.explicacion(INV.resolver(dialogPart("initialize-compile-or-load"))).solder, /not built yet/);
  assert.deepEqual(MD.clickIntent(MD.openDialog(d, null), dialogPart("initialize-compile-or-load")), { explain: true });
  // Several changes in one dialog; nothing is written until OK.
  let edited = press(d, "label-visible", "label", "direction-right", "header-z-transform", "tab-configuration", "show-enable", "delay");
  edited = type(edited, "3");
  assert.equal(edited.g, d.g);
  const applied = accepted(edited);
  const config = nodeOf(applied, id).config;
  assert.deepEqual([config.delay, config.direction, config.header, config.showEnable], [3, "right", "z-transform", true]);
  assert.deepEqual(nodeOf(applied, id).label, { text: "Feedback Node" }, "the label is shown, with its text");
  assert.equal(nodeOf(applied, id).y, 60 - (FB.cellStack(FB.feedbackConfig(nodeOf(applied, id))).height - 24), "the header makes the node grow upwards: its bottom stays");
  assert.equal(nodeOf(applied, id).x, 100);
  // The typed label and the Position fields.
  const typed = type(press(d, "label-visible", "label"), "Z");
  assert.equal(nodeOf(accepted(typed), id).label.text, "Z", "typing replaces the selected text");
  const moved = type(press(type(press(d, "left"), "250"), "top"), "-5");
  assert.deepEqual([nodeOf(accepted(moved), id).x, nodeOf(accepted(moved), id).y], [250, -5]);
  // Delay: 0 and less are ignored (the node keeps what it had), the arrows step by one and never below 1.
  assert.equal(nodeOf(accepted(type(press(press(d, "tab-configuration"), "delay"), "0")), id).config.delay, 1);
  const stepped = press(d, "tab-configuration", "delay-up", "delay-up");
  assert.equal(nodeOf(accepted(stepped), id).config.delay, 3);
  assert.equal(nodeOf(accepted(press(stepped, "delay-down", "delay-down", "delay-down")), id).config.delay, 1);
  // One step of undo, named like the other node dialogs'; an OK that changes nothing makes none.
  let history = H.registrar(H.nuevo(Gr.nuevo()), d.g, undefined);
  history = H.registrar(history, applied, FD.stepName());
  assert.equal(history.antes.length, 2);
  assert.equal(H.undoName(history), "Change Attribute");
  assert.equal(H.deshacer(history).g, d.g);
  assert.equal(accepted(d), d.g, "unchanged: no new graph, so no step");
  // Hiding the label takes it away again.
  const visible = { ...d, g: applied };
  const shownAgain = ED.orden(openMenu(visible, id), `${ROOT}.properties`, CTX);
  assert.equal(shownAgain.feedbackDialog.draft.labelVisible, true);
  assert.equal(nodeOf(accepted(press(shownAgain, "label-visible")), id).label, undefined);
});

test("Cancel and Escape leave the Feedback Node unchanged", () => {
  const { d } = dialogFor({ delay: 2 });
  const edited = press(d, "direction-right", "tab-configuration", "show-enable");
  assert.deepEqual(MD.clickIntent(MD.openDialog(edited, null), dialogPart("cancel")), { cancel: true });
  assert.deepEqual(MD.keyIntent(MD.openDialog(edited, null), { key: "Escape" }), { cancel: true });
  assert.deepEqual(MD.keyIntent(MD.openDialog(edited, null), { key: "Enter" }), { accept: true });
  assert.equal(edited.g, d.g, "nothing was written");
  assert.equal(nodeOf(d.g, d.seleccion[0]).config.direction, "left");
  assert.equal(MD.keyIntent(MD.openDialog(edited, null), { key: "a", ctrlKey: true }), null);
});

// ——— Saving and opening ———

test("a Feedback Node is saved and opened with all its configuration, the same size and the same terminals", () => {
  const config = { delay: 12, direction: "right", showEnable: true, header: "z-transform", initializerLoopsOut: 1 };
  const vi = buildOVI(CAT, (b) => {
    b.loop("loop", "for-loop");
    b.node("fb", "feedback-node", config, "loop");
  });
  const file = JSON.parse(aTexto(vi.g, CAT));
  const opened = leer(file, CAT);
  const reopened = opened.nodos.find((candidate) => candidate.tipo === "feedback-node");
  assert.deepEqual(reopened.config, nodeOf(vi.g, vi.id.fb).config, "every key of the configuration");
  assert.deepEqual(reopened.config, { ...config });
  assert.deepEqual(D.caja(reopened, CTX), D.caja(nodeOf(vi.g, vi.id.fb), CTX));
  const terminalsOf = (graph, feedback) => D.terminales(feedback, CTX, undefined, graph).map((t) => [t.puerto, ...rect(t.zona), t.x, t.y]);
  assert.deepEqual(terminalsOf(opened, reopened), terminalsOf(vi.g, nodeOf(vi.g, vi.id.fb)));
  // The defaults of a node dropped from the palette travel too.
  const plain = leer(JSON.parse(aTexto(node({}).g, CAT)), CAT).nodos[0];
  assert.deepEqual(plain.config, { delay: 1, initializerLoopsOut: 0, direction: "left", showEnable: false, header: "arrow" });
});

test("the inventory and the catalog agree about the Feedback Node", () => {
  for (const id of [ENTRY, ROOT, `${ROOT}.properties`, `${ROOT}.replace-with-shift-register`, "context.shift-register.replace-with-feedback-node", `${ROOT}.show-enable-terminal`, "dialog.feedback-node", "dialog.feedback-node.ok", "dialog.feedback-node.cancel"]) assert.equal(INV.entrada(id).estado, "built", id);
  for (const id of [`${ROOT}.globally-initialize.initialize-on-compile-or-load`, `${ROOT}.help`, "dialog.feedback-node.help"]) assert.equal(INV.entrada(id).estado, "todo", id);
  assert.deepEqual(Object.keys(CAT.bloque("feedback-node").config), ["delay", "initializerLoopsOut", "direction", "showEnable", "header"]);
  assert.equal(FD.UNDO_STEP_NAME, "Change Attribute");
});
