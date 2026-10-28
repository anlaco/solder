// The file functions in the editor (DT-067 §10 (b)): Open/Create/Replace File, Close File, Write to Text File, Read from Text File,
// Get File Size and Delete, placed from Functions ▸ Programming ▸ File I/O with their nodes, terminals, the file refnum's wire
// and the right-click menus of the two text functions. What was measured: the palette places and the connector index of each terminal
// (labview-captures/reports/2026-10-26-file-io-palette.md), the menus and what Read Lines does (2026-10-26-file-io-behavior.md §2-3).
// What was NOT measured, and is only checked to be consistent: the size and look of the nodes, the place of their terminals and the
// look of the refnum's wire (see editor/src/block-diagram/file-nodes.mjs). The captures are local evidence and are never committed.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { blockForTerminal } from "../../core/model/create-on-terminal.mjs";
import { COLORES, FILE_REFNUM, PATH, aspecto } from "../../core/model/types.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as H from "../../editor/src/block-diagram/undo-history.mjs";
import { FILE_NODE_BLOCKS } from "../../editor/src/block-diagram/file-nodes.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const ROOT = "palette.functions.programming.file-io";
const WRITE = "context.write-to-text-file";
const READ = "context.read-from-text-file";
const labels = (root) => INV.hijos(root).map((e) => e.etiqueta);
const separated = (root) => INV.hijos(root).filter((e) => e.separado).map((e) => e.etiqueta);

const PLACES = [
  ["open-create-replace-file", `${ROOT}.open-create-replace-file`],
  ["close-file", `${ROOT}.close-file`],
  ["write-to-text-file", `${ROOT}.write-to-text-file`],
  ["read-from-text-file", `${ROOT}.read-from-text-file`],
  ["get-file-size", `${ROOT}.advanced-file-functions.get-file-size`],
  ["delete", `${ROOT}.advanced-file-functions.delete`],
];

/** A diagram with one node of `block`, and the editor's state on it. */
function withNode(block, x = 100, y = 60) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, block, x, y);
  return { d: { ...ED.inicial(), g: created.g }, id: created.id, g: created.g };
}
const nodeOf = (g, id) => g.nodos.find((n) => n.id === id);

/** Wires `from.port` to `to.port` of two nodes. */
function wire(g, from, fromPort, to, toPort) {
  const wired = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
  assert.equal(wired.motivo, undefined, `${fromPort} -> ${toPort}`);
  return wired.g;
}

// ——— The palette ———

test("the six file functions are placed from the File I/O palettes", () => {
  for (const [block, id] of PLACES) {
    const entry = INV.entrada(id);
    assert.equal(entry.estado, "built", id);
    assert.equal(entry.bloque, block, id);
    assert.ok(CAT.bloque(block), `${block} is in the catalog`);
    assert.ok(G.FUNCIONES[ultimo(id)] && G.CAJAS[ultimo(id)], `${id} has its icon and box`);
    let d = ED.coger(ED.inicial(), entry.bloque);
    d = ED.pulsar(ED.moverA(d, CTX, { x: 100, y: 100 }), CTX, { tipo: "fondo" }, { x: 100, y: 100 });
    assert.equal(d.g.nodos[0].tipo, block, id);
    Gr.tipos(d.g, CAT); // it resolves with nothing wired
  }
  // Everything else of the file functions that is not done stays greyed, the datalog copies of Open and Close included.
  for (const id of [`${ROOT}.write-to-binary-file`, `${ROOT}.format-into-file`, `${ROOT}.advanced-file-functions.datalog.open-create-replace-file`, `${ROOT}.advanced-file-functions.datalog.close-file`, `${ROOT}.advanced-file-functions.move`, `${ROOT}.advanced-file-functions.get-file-position`]) {
    assert.ok(esHueco(INV.entrada(id)), id);
    assert.match(INV.explicacion(INV.entrada(id)).solder, /^Missing: /, id);
  }
});

// ——— The nodes ———

/** Terminals by port name. */
const terminalsOf = (n) => Object.fromEntries(D.terminales(n, CTX).map((t) => [t.puerto, t]));

// The table of reports/2026-10-28-file-nodes-look.md §1: [port, x, y, w, h] from the node's top-left corner. Pins: x 0 left, x 31 right,
// x 12 top and bottom.
const RECTANGLES = {
  "open-create-replace-file": [["file-path", 0, 0, 8, 8], ["operation", 0, 8, 8, 8], ["access", 0, 16, 8, 8], ["error-in", 0, 24, 8, 8], ["prompt", 8, 0, 8, 16], ["disable-buffering", 8, 16, 8, 16],
    ["refnum-out", 24, 0, 8, 8], ["cancelled", 24, 16, 8, 8], ["error-out", 24, 24, 8, 8]],
  "close-file": [["refnum", 0, 0, 16, 8], ["error-in", 0, 24, 16, 8], ["path", 16, 0, 16, 8], ["error-out", 16, 24, 16, 8]],
  "write-to-text-file": [["file", 0, 0, 8, 8], ["text", 0, 8, 8, 8], ["error-in", 0, 24, 8, 8], ["prompt", 8, 0, 8, 16], ["refnum-out", 24, 0, 8, 8], ["cancelled", 24, 16, 8, 8], ["error-out", 24, 24, 8, 8]],
  "read-from-text-file": [["file", 0, 0, 8, 8], ["count", 0, 8, 8, 8], ["error-in", 0, 24, 8, 8], ["prompt", 8, 0, 8, 16],
    ["refnum-out", 24, 0, 8, 8], ["text", 24, 8, 8, 8], ["cancelled", 24, 16, 8, 8], ["error-out", 24, 24, 8, 8]],
  "get-file-size": [["file", 0, 0, 16, 8], ["error-in", 0, 24, 16, 8], ["refnum-out", 16, 0, 16, 8], ["size", 16, 8, 16, 8], ["error-out", 16, 24, 16, 8]],
  delete: [["path", 0, 0, 8, 8], ["entire-hierarchy", 0, 8, 8, 8], ["confirm", 0, 16, 8, 8], ["error-in", 0, 24, 8, 8], ["prompt", 8, 0, 8, 16],
    ["deleted-path", 24, 0, 8, 8], ["cancelled", 24, 16, 8, 8], ["error-out", 24, 24, 8, 8]],
};

test("the six file nodes are 32 x 32 with every terminal where LabVIEW has it", () => {
  assert.deepEqual(Object.keys(RECTANGLES).sort(), [...FILE_NODE_BLOCKS].sort());
  for (const [block, rectangles] of Object.entries(RECTANGLES)) {
    const { g, id } = withNode(block);
    const n = nodeOf(g, id);
    const box = D.caja(n, CTX);
    assert.deepEqual([box.ancho, box.alto], [32, 32], `${block}: 32 x 32`);
    assert.deepEqual([G.TAMANOS[block], G.CAJAS[block]], [[32, 32], [0, 0, 48, 48]], `${block}: the icon fills the node`);
    const { in: inputs, out: outputs } = CAT.puertos(n);
    const terminals = D.terminales(n, CTX);
    assert.deepEqual(terminals.map((t) => t.puerto), [...inputs, ...outputs].map((p) => p.name), `${block}: one terminal per port, in the catalog's order`);
    assert.equal(rectangles.length, terminals.length, `${block}: the table has every terminal`);
    for (const [port, x, y, w, h] of rectangles) {
      const t = terminals.find((candidate) => candidate.puerto === port) ?? assert.fail(`${block}.${port} has no terminal`);
      assert.deepEqual(t.zona, { x: n.x + x, y: n.y + y, ancho: w, alto: h }, `${block}.${port}: its hot rectangle`);
      const vertical = port === "prompt" || port === "disable-buffering";
      if (vertical) assert.deepEqual([t.x, t.y, t.lado], [n.x + 12, n.y + (port === "prompt" ? 0 : 31), port === "prompt" ? "top" : "bottom"], `${block}.${port}: the pin on the edge`);
      else assert.deepEqual([t.x, t.y], [n.x + (x === 0 ? 0 : 31), n.y + y + 4], `${block}.${port}: the pin on its row`);
    }
  }
  // The side terminals are on rows 8 px apart.
  const { g: readGraph, id: readId } = withNode("read-from-text-file");
  const read = terminalsOf(nodeOf(readGraph, readId));
  assert.deepEqual(["refnum-out", "text", "cancelled", "error-out"].map((port) => read[port].y), [64, 72, 80, 88]);
  assert.deepEqual(["refnum-out", "text", "cancelled", "error-out"].map((port) => read[port].y), [64, 72, 80, 88]);
});

test("the file nodes are drawn with their own icons, one per function, and Read Lines changes Read's", () => {
  const seen = new Set();
  for (const block of FILE_NODE_BLOCKS) {
    const glyph = G.FUNCIONES[block];
    assert.match(glyph, /viewBox="0 0 32 32"/, `${block}: drawn at the node's size`);
    assert.doesNotMatch(glyph, /<text/, `${block}: icon only, no label (measured)`);
    assert.match(glyph, /fill="var\(--node-fill\)" stroke="var\(--path-node-border\)" stroke-width="1"/, `${block}: the node fill and a 1 px border`);
    assert.equal(D.glifosPorBloque(INV).get(block), block, `${block}: the node takes the glyph of its palette element`);
    seen.add(glyph);
    const { g } = withNode(block);
    assert.match(D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT)), /<svg/, `${block}: the diagram draws the icon`);
  }
  assert.equal(seen.size, 6, "every function has its own drawing");
  // Read from Text File with Read Lines on has a different icon (reports/2026-10-28-file-nodes-look.md §5).
  const read = withNode("read-from-text-file");
  const plain = D.contenido({ ...ED.inicial(), g: read.g }, CTX, Gr.tipos(read.g, CAT));
  const lines = ED.orden(ED.abrirMenu(read.d, READ, read.id, 0, 0), `${READ}.read-lines`, CTX);
  const withLines = D.contenido(lines, CTX, Gr.tipos(lines.g, CAT));
  assert.notEqual(plain, withLines, "the icon changes");
  assert.ok(withLines.includes(G.FUNCIONES["read-from-text-file-lines"]) && plain.includes(G.FUNCIONES["read-from-text-file"]));
  assert.deepEqual([G.TAMANOS["read-from-text-file-lines"], G.CAJAS["read-from-text-file-lines"]], [[32, 32], [0, 0, 48, 48]]);
});

// ——— The file refnum's wire ———

test("a file refnum wire is the path's teal but solid, and does not coerce to a number", () => {
  const look = aspecto(FILE_REFNUM);
  // reports/2026-10-28-file-nodes-look.md §2-3: #007f7f, 1 px, solid; the path's wire has the same colour and is dashed.
  assert.equal(look.color, "#007f7f");
  assert.equal(look.color, COLORES.path);
  assert.equal(look.dashed, undefined, "the refnum's wire is solid");
  assert.equal(aspecto(PATH).dashed, true, "the path's is dashed");
  assert.equal(look.dimension, 0);
  for (const other of ["i32", "dbl", "string", "boolean"]) assert.notEqual(aspecto(other).color, look.color, other);
  // Open's refnum goes into Close, and into the `file` input of Write to Text File; into a number it is a broken wire.
  let { g, id: open } = withNode("open-create-replace-file");
  const close = Gr.crearNodo(g, CAT, "close-file", 300, 60);
  g = wire(close.g, open, "refnum-out", close.id, "refnum");
  const write = Gr.crearNodo(g, CAT, "write-to-text-file", 300, 160);
  g = wire(write.g, open, "refnum-out", write.id, "file");
  const resolved = Gr.tipos(g, CAT);
  assert.equal(resolved.salidas.get(`${open}.refnum-out`), FILE_REFNUM);
  assert.equal(resolved.entradas.get(`${write.id}.file`), FILE_REFNUM, "a refnum wired to `file` makes it a refnum input");
  assert.ok([...resolved.cables.values()].every((cable) => !cable.roto));
  const read = Gr.crearNodo(g, CAT, "read-from-text-file", 300, 260);
  const number = Gr.conectar(read.g, CAT, { nodo: open, puerto: "refnum-out", dir: "out" }, { nodo: read.id, puerto: "count", dir: "in" });
  assert.equal(number.motivo, undefined, "the wire is made, as in LabVIEW, and broken");
  const [brokenWire] = [...Gr.tipos(number.g, CAT).cables.values()].filter((cable) => cable.roto);
  assert.match(brokenWire.roto, /expects I32 and the wire carries file refnum/, "a refnum does not go into a number");
});

test("a Run with only file functions asks for the I/O port of the editor", () => {
  let { g, id: path } = withNode("path-constant", 0, 0);
  const open = Gr.crearNodo(g, CAT, "open-create-replace-file", 100, 0);
  g = wire(open.g, path, "result", open.id, "file-path");
  const close = Gr.crearNodo(g, CAT, "close-file", 300, 0);
  g = wire(close.g, open.id, "refnum-out", close.id, "refnum");
  const compiled = compilar(g, CAT, { name: "files" });
  assert.equal(compiled.errores, undefined, JSON.stringify(compiled.errores));
  assert.equal(compiled.usesInstrumentIo, true, "editor-window.mjs hands this Run the port when `usesInstrumentIo` is true");
});

// ——— The menus ———

test("the right-click menu of Write to Text File is the measured one", () => {
  // wt-menu_s.png, in its order (Disable Breakpoint only appears once there is a breakpoint).
  assert.deepEqual(labels(WRITE), ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint", "Disable Breakpoint", "File I/O Palette", "String Palette", "Create", "Replace", "Convert EOL", "Remove and Rewire", "Properties"]);
  assert.deepEqual(separated(WRITE), ["Add Breakpoint", "File I/O Palette", "Replace", "Remove and Rewire", "Properties"]);
  const { g, id } = withNode("write-to-text-file");
  assert.equal(D.menuDe(nodeOf(g, id), null, g), WRITE);
  assert.equal(D.menuDe(nodeOf(g, id), "text", g), WRITE, "every terminal has the body's menu (their own were not read)");
  const html = D.menuContextual(INV, { raiz: WRITE, x: 0, y: 0 });
  assert.equal((html.match(/class="separador-menu"/g) ?? []).length, 5, "the five separators of the capture");
  assert.ok(!/Disable Breakpoint/.test(html), "Disable Breakpoint is not shown while there is no breakpoint");
  // What is done is Visible Items, the breakpoints, Create and Convert EOL; the rest is greyed with its reason.
  assert.deepEqual(INV.hijos(WRITE).filter((e) => !esHueco(e)).map((e) => e.etiqueta), ["Visible Items", "Add Breakpoint", "Disable Breakpoint", "Create", "Convert EOL"]);
  assert.equal(INV.entrada(`${WRITE}.file-i-o-palette`).necesita, "paleta-archivos-en-menu");
  for (const row of ["file-i-o-palette", "string-palette", "replace", "remove-and-rewire", "properties"]) assert.match(INV.explicacion(INV.entrada(`${WRITE}.${row}`)).solder, /^Missing: /, row);
  assert.match(html, /data-id="context\.write-to-text-file\.file-i-o-palette"[^>]*>[\s\S]*?flecha-menu/, "File I/O Palette opens a submenu");
  // Terminals shows the node's terminals, ticked.
  let d = ED.abrirMenu(withNode("write-to-text-file").d, WRITE, id, 0, 0);
  d = ED.orden(d, `${WRITE}.visible-items.terminals`, CTX);
  assert.equal(d.g.nodos[0].vista.terminales, true);
  assert.ok(ED.marcados(ED.abrirMenu(d, WRITE, id, 0, 0), CTX).has(`${WRITE}.visible-items.terminals`));
});

test("the right-click menu of Read from Text File is the measured one", () => {
  // rt-menu_s.png: Create comes after Remove and Rewire here.
  assert.deepEqual(labels(READ), ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint", "Disable Breakpoint", "File I/O Palette", "Replace", "Read Lines", "Convert EOL", "Representation", "Remove and Rewire", "Create", "Properties"]);
  assert.deepEqual(separated(READ), ["Add Breakpoint", "File I/O Palette", "Remove and Rewire", "Properties"]);
  const { g, id } = withNode("read-from-text-file");
  assert.equal(D.menuDe(nodeOf(g, id), null, g), READ);
  assert.equal((D.menuContextual(INV, { raiz: READ, x: 0, y: 0 }).match(/class="separador-menu"/g) ?? []).length, 4);
  assert.deepEqual(INV.hijos(READ).filter((e) => !esHueco(e)).map((e) => e.etiqueta), ["Visible Items", "Add Breakpoint", "Disable Breakpoint", "Read Lines", "Convert EOL", "Create"]);
  assert.match(INV.explicacion(INV.entrada(`${READ}.representation`)).solder, /^Missing: /);
  assert.match(D.menuContextual(INV, { raiz: READ, x: 0, y: 0 }), /data-id="context\.read-from-text-file\.representation"[^>]*>[\s\S]*?flecha-menu/, "Representation opens a submenu");
});

test("Create on the node menu of the text functions wires a constant to a terminal", () => {
  const { d, id } = withNode("read-from-text-file");
  const made = ED.orden(ED.abrirMenu(d, READ, id, 0, 0, "count", { x: 50, y: 60 }), `${READ}.create.constant`, CTX);
  assert.equal(made.menu, null);
  const constant = made.g.nodos.find((n) => n.tipo === "num-const");
  assert.deepEqual(made.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[constant.id, id, "count"]]);
  assert.equal(made.g.nodos.find((n) => n.id === constant.id).config.type, "i32");
  // Without a terminal under the mouse the rows are greyed.
  const { desactivados } = ED.variantes(ED.abrirMenu(d, READ, id, 0, 0), CTX);
  for (const row of ["constant", "control", "indicator"]) assert.ok(desactivados.has(`${READ}.create.${row}`), row);
});

// ——— Convert EOL and Read Lines ———

const choose = (d, root, id, row) => ED.orden(ED.abrirMenu(d, root, id, 0, 0), `${root}.${row}`, CTX);
const marks = (d, root, id) => ED.marcados(ED.abrirMenu(d, root, id, 0, 0), CTX);

test("Convert EOL and Read Lines are ticked from the menu of the text file nodes", () => {
  // Convert EOL is ticked by default on both; Read Lines is not, and only Read from Text File has it.
  const write = withNode("write-to-text-file");
  assert.deepEqual([...marks(write.d, WRITE, write.id)].filter((row) => /convert-eol|read-lines/.test(row)), [`${WRITE}.convert-eol`]);
  const read = withNode("read-from-text-file");
  assert.deepEqual([...marks(read.d, READ, read.id)].filter((row) => /convert-eol|read-lines/.test(row)), [`${READ}.convert-eol`]);
  // Each row toggles its key of the node's config, and the menu shows it.
  let d = choose(write.d, WRITE, write.id, "convert-eol");
  assert.equal(nodeOf(d.g, write.id).config["convert-eol"], false);
  assert.equal(d.menu, null, "the menu closes");
  assert.ok(!marks(d, WRITE, write.id).has(`${WRITE}.convert-eol`));
  d = choose(d, WRITE, write.id, "convert-eol");
  assert.equal(nodeOf(d.g, write.id).config["convert-eol"], true);
  d = choose(read.d, READ, read.id, "read-lines");
  assert.equal(nodeOf(d.g, read.id).config["read-lines"], true);
  assert.ok(marks(d, READ, read.id).has(`${READ}.read-lines`));
  assert.ok(marks(d, READ, read.id).has(`${READ}.convert-eol`), "the two rows are independent");
  d = choose(d, READ, read.id, "convert-eol");
  assert.deepEqual([nodeOf(d.g, read.id).config["read-lines"], nodeOf(d.g, read.id).config["convert-eol"]], [true, false]);
  // A node that was saved without the key has the measured defaults: Convert EOL on and Read Lines off.
  const withoutConfig = { ...read.d, g: { ...read.d.g, nodos: read.d.g.nodos.map((n) => ({ ...n, config: {} })) } };
  assert.ok(marks(withoutConfig, READ, read.id).has(`${READ}.convert-eol`));
  assert.ok(!marks(withoutConfig, READ, read.id).has(`${READ}.read-lines`));
  // Each toggle is one step of undo.
  let history = H.nuevo(read.g);
  const toggled = choose(read.d, READ, read.id, "read-lines");
  history = H.registrar(history, toggled.g);
  const undone = H.deshacer(history);
  assert.equal(nodeOf(undone.g, read.id).config["read-lines"], false, "undo unticks Read Lines");
  assert.equal(nodeOf(H.rehacer(undone.h).g, read.id).config["read-lines"], true, "redo ticks it again");
});

test("Read Lines with count wired makes the text output an array of strings, and a wired string indicator breaks", () => {
  let { g, id: read } = withNode("read-from-text-file");
  assert.equal(Gr.tipos(g, CAT).salidas.get(`${read}.text`), "string", "a string without Read Lines");
  const indicator = Gr.crearEnPanel(g, CAT, "str-indicator", 20, 20, "text");
  g = wire(indicator.g, read, "text", indicator.id, "value");
  assert.ok([...Gr.tipos(g, CAT).cables.values()].every((cable) => !cable.roto), "the string indicator is fine");
  // With count unwired Read Lines gives a string, the next line (measured, reports/2026-10-28-file-io-gaps.md Q7).
  const unwiredCount = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, READ, read, 0, 0), `${READ}.read-lines`, CTX);
  assert.equal(Gr.tipos(unwiredCount.g, CAT).salidas.get(`${read}.text`), "string", "count unwired: still a string");
  const count = Gr.crearNodo(g, CAT, "num-const", 0, 0);
  g = wire(Gr.fijarConfig(count.g, count.id, { type: "i32", value: 2 }), count.id, "result", read, "count");
  const lines = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, READ, read, 0, 0), `${READ}.read-lines`, CTX);
  const resolved = Gr.tipos(lines.g, CAT);
  assert.deepEqual(resolved.salidas.get(`${read}.text`), { array: "string" }, "text is a 1D array of strings");
  const wireOfText = lines.g.cables.find((cable) => cable.de.nodo === read);
  assert.ok(resolved.cables.get(wireOfText.id).roto, "the wire to the string indicator is broken, as in LabVIEW");
  // An array indicator takes it, and unticking the row brings back the string.
  const arrayIndicator = Gr.crearEnPanel(lines.g, CAT, "arr-indicator", 20, 120, "lines", { type: { array: "string" } });
  const wired = wire(arrayIndicator.g, read, "text", arrayIndicator.id, "value");
  assert.ok(!Gr.tipos(wired, CAT).cables.get(wired.cables.at(-1).id).roto, "the array indicator takes the lines");
  const back = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: lines.g }, READ, read, 0, 0), `${READ}.read-lines`, CTX);
  assert.equal(Gr.tipos(back.g, CAT).salidas.get(`${read}.text`), "string");
});

// ——— Create on the enum ports ———

test("Create makes an enum constant, control and indicator with the measured items on Open's operation and access", () => {
  const OPERATION = ["open", "replace", "create", "open or create", "replace or create", "replace or create with confirmation"];
  const ACCESS = ["read/write", "read-only", "write-only"];
  const { d, id } = withNode("open-create-replace-file");
  for (const [port, items] of [["operation", OPERATION], ["access", ACCESS]]) {
    const constant = ED.orden(ED.abrirMenu(d, "context.function", id, 0, 0, port, { x: 50, y: 60 }), "context.function.create.constant", CTX);
    const made = constant.g.nodos.find((n) => n.tipo === "enum-const");
    assert.ok(made, `${port}: an enum constant`);
    assert.deepEqual(made.config.type.enum, items, `${port}: the measured item names, in order`);
    assert.deepEqual(constant.g.cables.map((c) => [c.de.nodo, c.a.nodo, c.a.puerto]), [[made.id, id, port]], `${port}: wired to the terminal`);
    assert.deepEqual(Gr.tipos(constant.g, CAT).cables.get(constant.g.cables[0].id).roto, null, `${port}: the wire is fine`);
    const control = ED.orden(ED.abrirMenu(d, "context.function", id, 0, 0, port, { x: 50, y: 60 }), "context.function.create.control", CTX);
    assert.deepEqual(control.g.nodos.find((n) => n.tipo === "control").config.type.enum, items, `${port}: an enum control`);
  }
});

test("Create on a path terminal makes a Path Constant, a File Path Control or a File Path Indicator", () => {
  for (const [kind, block] of [["constant", "path-constant"], ["control", "path-control"], ["indicator", "path-indicator"]]) {
    assert.deepEqual(blockForTerminal(PATH, kind), { tipo: block }, kind);
  }
});

test("the right-click menus of the other four file functions are the measured ones", () => {
  // reports/2026-10-28-file-nodes-look.md §4. Examples greyed on Get File Size and Delete: Solder greys it everywhere (not yet).
  const OPEN_CLOSE = "context.file-function";
  const ADVANCED = "context.advanced-file-function";
  const rows = (paletteLabel) => ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint", "Disable Breakpoint", paletteLabel, "Replace", "Remove and Rewire", "Create", "Properties"];
  assert.deepEqual(labels(OPEN_CLOSE), rows("File I/O Palette"));
  assert.deepEqual(labels(ADVANCED), rows("Advanced File Functions Palette"));
  for (const root of [OPEN_CLOSE, ADVANCED]) {
    assert.deepEqual(separated(root), ["Add Breakpoint", labels(root)[6], "Remove and Rewire", "Properties"], root);
    assert.equal((D.menuContextual(INV, { raiz: root, x: 0, y: 0 }).match(/class="separador-menu"/g) ?? []).length, 4, `${root}: four separators`);
    assert.deepEqual(INV.hijos(root).filter((e) => !esHueco(e)).map((e) => e.etiqueta), ["Visible Items", "Add Breakpoint", "Disable Breakpoint", "Create"], root);
    for (const e of INV.hijos(root).filter(esHueco)) assert.match(INV.explicacion(e).solder, /^Missing: /, e.id);
  }
  for (const block of ["open-create-replace-file", "close-file"]) {
    const { g, id } = withNode(block);
    assert.equal(D.menuDe(nodeOf(g, id), null, g), OPEN_CLOSE, block);
  }
  for (const block of ["get-file-size", "delete"]) {
    const { g, id } = withNode(block);
    assert.equal(D.menuDe(nodeOf(g, id), null, g), ADVANCED, block);
  }
  // Nothing is ticked on them (they have no checkable rows), and Terminals works.
  const { d, id } = withNode("delete");
  assert.equal(ED.marcados(ED.abrirMenu(d, ADVANCED, id, 0, 0), CTX).size, 1, "only View As Icon's general tick");
  const shown = ED.orden(ED.abrirMenu(d, ADVANCED, id, 0, 0), `${ADVANCED}.visible-items.terminals`, CTX);
  assert.equal(shown.g.nodos[0].vista.terminales, true);
});
