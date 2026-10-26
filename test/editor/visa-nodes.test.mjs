// The VISA functions in the editor (DT-065, DT-066): their place in Functions ▸ Instrument I/O, their 32 x 32 nodes
// with the terminals where LabVIEW has them, their icons and their right-click menus. Every measure comes from
// labview-captures/reports/2026-10-25-visa-palettes.md §1–3 (the palettes), 2026-10-26-visa-nodes.md (the nodes) and
// 2026-10-26-visa-resource-name-look.md Q5 (the menu of the resource terminal); the captures are local evidence and
// are not committed.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { VISA_RESOURCE } from "../../core/model/types.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as DS from "../../editor/src/debugging/debug-state.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { MEDIDAS_PALETA, celdasSubpaleta, paleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const AQUI = { x: 10, y: 20 };
const ROOT = "palette.functions.instrument-io";
const withPalette = () => ({ ...inicial(), paleta: paletaNueva("palette.functions", 40, 30) });

const labels = (root) => INV.hijos(root).map((e) => e.etiqueta);

// ——— The palettes ———

test("the Instrument I/O category unfolds with its four subpalettes in their measured cells", () => {
  const opened = clic(withPalette(), INV, ROOT, AQUI);
  assert.ok(opened.paleta.desplegadas.includes(ROOT), "the category is done, so it unfolds");
  const html = paleta(INV, opened.paleta);
  const cell = (slug) => {
    const [, left, top] = html.match(new RegExp(`data-id="${ROOT}\\.${slug}" style="left:([\\d.]+)px;top:([\\d.]+)px`)) ?? assert.fail(`${slug} is not drawn`);
    const P = MEDIDAS_PALETA;
    return [Math.round((Number(top) - P.sobreRejilla) / P.pasoIcono) + 1, Math.round((Number(left) - P.margenRejilla) / P.pasoIcono) + 1];
  };
  // (row, column) of functions-instrument-io.png: Instr Drivers alone on the first row, then VISA, GPIB and Serial.
  assert.deepEqual([cell("instrument-drivers"), cell("visa"), cell("gpib"), cell("serial")], [[1, 1], [2, 1], [2, 2], [2, 3]]);
  assert.match(html, /class="carpeta hueco" data-id="palette\.functions\.instrument-io\.instrument-drivers"/, "Instrument Drivers is a greyed folder");
  assert.match(html, /class="carpeta hueco" data-id="palette\.functions\.instrument-io\.gpib"/, "GPIB is a greyed folder");
  assert.match(html, /class="carpeta" data-id="palette\.functions\.instrument-io\.visa"/, "VISA opens");
  for (const folder of ["instrument-drivers", "gpib"]) {
    assert.equal(INV.hijos(`${ROOT}.${folder}`).length, 0, `${folder}: its contents were not captured`);
    assert.match(INV.explicacion(INV.entrada(`${ROOT}.${folder}`)).solder, /has not been opened in LabVIEW yet/);
  }
  assert.equal(INV.entrada(ROOT).estado, "built");
});

/** [row, column, label] of every cell of a subpalette, the thumbtack aside. */
const cells = (id) => celdasSubpaleta(INV, id).sitios.filter((s) => ultimo(s.e.id) !== "thumbtack").map((s) => [s.fila + 1, s.columna + 1, s.e.etiqueta]);

const SUBPALETTES = [
  [`${ROOT}.visa`, 3, [
    [1, 1, "VISA Write"], [1, 2, "VISA Read"], [1, 3, "VISA Advanced"], [2, 1, "VISA Clear"], [2, 2, "VISA Read STB"], [2, 3, "VISA Assert Trigger"]]],
  [`${ROOT}.visa.visa-advanced`, 3, [
    [1, 1, "VISA Open"], [1, 2, "VISA Close"], [1, 3, "VISA Find Resource"], [2, 1, "VISA Set Timeout"], [2, 2, "VISA Property Node"], [2, 3, "Bus/Interface Specific"],
    [3, 1, "VISA Write From File"], [3, 2, "VISA Read To File"], [3, 3, "Event Handling"], [4, 1, "VISA Lock Async.vi"], [4, 2, "VISA Unlock"], [4, 3, "Register Access"]]],
  [`${ROOT}.visa.visa-advanced.bus-interface-specific`, 5, [
    [1, 1, "Serial"], [1, 2, "VISA USB"], [1, 4, "VISA Set I/O Buffer Size"], [1, 5, "VISA Flush I/O Buffer"],
    [2, 1, "VISA GPIB Command"], [2, 2, "VISA GPIB Control ATN"], [2, 3, "VISA GPIB Pass Control"], [2, 4, "VISA GPIB Send IFC"], [2, 5, "VISA GPIB Control REN"],
    [3, 1, "VISA VXI Cmd or Query"], [3, 2, "VISA Assert Interrupt Signal"], [3, 3, "VISA Assert Utility Signal"], [3, 4, "VISA Map Trigger"], [3, 5, "VISA Unmap Trigger"]]],
  [`${ROOT}.visa.visa-advanced.bus-interface-specific.visa-usb`, 4, [
    [1, 1, "VISA USB Control In"], [1, 2, "VISA USB Control Out"], [1, 4, "VISA Get USB Interrupt Data.vi"]]],
  [`${ROOT}.visa.visa-advanced.event-handling`, 4, [
    [1, 1, "VISA Enable Event"], [1, 2, "VISA Wait on Event"], [1, 3, "VISA Disable Event"], [1, 4, "VISA Discard Events"], [2, 1, "Wait for RQS.vi"], [2, 4, "Select Event Type.ctl"]]],
  [`${ROOT}.visa.visa-advanced.register-access`, 8, [
    [1, 1, "VISA In 8"], [1, 2, "VISA In 16"], [1, 3, "VISA In 32"], [1, 4, "VISA In 64"], [1, 5, "VISA Out 8"], [1, 6, "VISA Out 16"], [1, 7, "VISA Out 32"], [1, 8, "VISA Out 64"],
    [2, 1, "VISA Move In 8"], [2, 2, "VISA Move In 16"], [2, 3, "VISA Move In 32"], [2, 4, "VISA Move In 64"], [2, 5, "VISA Move Out 8"], [2, 6, "VISA Move Out 16"], [2, 7, "VISA Move Out 32"], [2, 8, "VISA Move Out 64"],
    [3, 1, "VISA Memory Allocation"], [3, 2, "VISA Memory Allocation Ex"], [3, 3, "VISA Memory Free"], [3, 7, "VISA Move"], [3, 8, "Low Level Register Access"]]],
  [`${ROOT}.visa.visa-advanced.register-access.low-level-register-access`, 4, [
    [1, 1, "VISA Map Address"], [1, 2, "VISA Unmap Address"],
    [2, 1, "VISA Peek 8"], [2, 2, "VISA Peek 16"], [2, 3, "VISA Peek 32"], [2, 4, "VISA Peek 64"],
    [3, 1, "VISA Poke 8"], [3, 2, "VISA Poke 16"], [3, 3, "VISA Poke 32"], [3, 4, "VISA Poke 64"]]],
  [`${ROOT}.serial`, 4, [
    [1, 1, "VISA Configure Serial Port"], [1, 2, "VISA Write"], [1, 3, "VISA Read"], [1, 4, "VISA Close"],
    [2, 1, "VISA Bytes at Serial Port"], [2, 2, "VISA Serial Break.vi"], [2, 3, "VISA Set I/O Buffer Size"], [2, 4, "VISA Flush I/O Buffer"]]],
];

test("the VISA subpalettes open with the grids and names that were measured", () => {
  for (const [id, columns, expected] of SUBPALETTES) {
    assert.equal(celdasSubpaleta(INV, id).columnas, columns, `${id}: columns`);
    assert.deepEqual(cells(id), expected, id);
  }
  // Bus/Interface Specific ▸ Serial is the same palette as Instrument I/O ▸ Serial.
  assert.deepEqual(cells(`${ROOT}.visa.visa-advanced.bus-interface-specific.serial`), cells(`${ROOT}.serial`));
  // Every folder of them opens, one inside the other, as the click on it does.
  let state = clic(withPalette(), INV, ROOT, AQUI);
  const chain = [`${ROOT}.visa`, `${ROOT}.visa.visa-advanced`, `${ROOT}.visa.visa-advanced.register-access`, `${ROOT}.visa.visa-advanced.register-access.low-level-register-access`];
  chain.forEach((id, level) => { state = clic(state, INV, id, AQUI, level); });
  assert.deepEqual(state.paleta.cascada.map((c) => c.id), chain);
  assert.match(subpaletas(INV, state.paleta), /data-id="palette\.functions\.instrument-io\.visa\.visa-advanced\.register-access\.low-level-register-access\.visa-poke-64"/);
  for (const [id] of SUBPALETTES) {
    for (const entry of INV.hijos(id)) {
      const slug = ultimo(entry.id);
      assert.ok(G.FUNCIONES[slug] || G.SUBPALETAS[slug] || slug === "thumbtack", `${entry.id} has an icon`);
    }
  }
});

const PLACEABLE = [
  ["visa-open", `${ROOT}.visa.visa-advanced.visa-open`],
  ["visa-close", `${ROOT}.visa.visa-advanced.visa-close`],
  ["visa-write", `${ROOT}.visa.visa-write`],
  ["visa-read", `${ROOT}.visa.visa-read`],
  ["visa-write", `${ROOT}.serial.visa-write`],
  ["visa-read", `${ROOT}.serial.visa-read`],
  ["visa-close", `${ROOT}.serial.visa-close`],
  ["visa-write", `${ROOT}.visa.visa-advanced.bus-interface-specific.serial.visa-write`],
  ["visa-read", `${ROOT}.visa.visa-advanced.bus-interface-specific.serial.visa-read`],
  ["visa-close", `${ROOT}.visa.visa-advanced.bus-interface-specific.serial.visa-close`],
];

test("VISA Open, Write, Read and Close are placed from the palettes, also from Serial", () => {
  for (const [block, id] of PLACEABLE) {
    const entry = INV.entrada(id);
    assert.equal(entry.estado, "built", id);
    assert.equal(entry.bloque, block, id);
    assert.ok(CAT.bloque(block), `${block} is in the catalog`);
    let d = ED.coger(ED.inicial(), entry.bloque);
    d = ED.pulsar(ED.moverA(d, CTX, { x: 100, y: 100 }), CTX, { tipo: "fondo" }, { x: 100, y: 100 });
    assert.equal(d.g.nodos[0].tipo, block, id);
  }
  // Everything else of the palettes is greyed and says what is missing.
  const done = new Set(PLACEABLE.map(([, id]) => id));
  const holes = INV.entradas.filter((e) => e.id.startsWith(`${ROOT}.`) && !done.has(e.id) && ultimo(e.id) !== "thumbtack" && INV.hijos(e.id).length === 0);
  assert.ok(holes.length > 60);
  for (const hole of holes) {
    assert.ok(esHueco(hole), hole.id);
    const { labview, solder } = INV.explicacion(hole);
    assert.ok(labview && /^Missing: /.test(solder), hole.id);
  }
  const html = subpaletas(INV, clic(clic(withPalette(), INV, ROOT, AQUI), INV, `${ROOT}.visa`, AQUI, 0).paleta);
  assert.match(html, /class="icono-funcion" data-id="palette\.functions\.instrument-io\.visa\.visa-write"/, "VISA Write is done");
  assert.match(html, /class="icono-funcion hueco" data-id="palette\.functions\.instrument-io\.visa\.visa-clear"/, "VISA Clear is greyed");
});

// ——— The nodes ———

const node = (block) => {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, block, 100, 60);
  return created.g.nodos.find((n) => n.id === created.id);
};

// [port, x, y, side] of the rectangles of the report, Q2, relative to the node's top-left corner (the dots are 6 x 6).
const DOTS = {
  "visa-open": [["resource", -3, 1, "left"], ["duplicate-session", -3, 9, "left"], ["access-mode", -3, 17, "left"], ["error-in", -3, 25, "left"], ["open-timeout", 9, -3, "top"], ["resource-out", 29, 1, "right"], ["error-out", 29, 25, "right"]],
  "visa-write": [["resource", -3, 1, "left"], ["write-buffer", -3, 9, "left"], ["error-in", -3, 25, "left"], ["resource-out", 29, 1, "right"], ["return-count", 29, 9, "right"], ["error-out", 29, 25, "right"]],
  "visa-read": [["resource", -3, 1, "left"], ["byte-count", -3, 9, "left"], ["error-in", -3, 25, "left"], ["resource-out", 29, 1, "right"], ["read-buffer", 29, 9, "right"], ["return-count", 29, 17, "right"], ["error-out", 29, 25, "right"]],
  "visa-close": [["resource", -3, 1, "left"], ["error-in", -3, 25, "left"], ["error-out", 29, 25, "right"]],
};

test("the four VISA nodes are 32 x 32 with their terminals where LabVIEW has them", () => {
  for (const [block, dots] of Object.entries(DOTS)) {
    const n = node(block);
    const box = D.caja(n, CTX);
    assert.deepEqual([box.ancho, box.alto], [32, 32], `${block}: the node is 32 x 32`);
    const terminals = D.terminales(n, CTX);
    assert.equal(terminals.length, dots.length, `${block}: one terminal per dot`);
    for (const [port, dx, dy, side] of dots) {
      const t = terminals.find((candidate) => candidate.puerto === port) ?? assert.fail(`${block}.${port} has no terminal`);
      assert.deepEqual(t.zona, { x: n.x + dx, y: n.y + dy, ancho: 6, alto: 6 }, `${block}.${port}: its 6 x 6 dot`);
      if (side === "left") assert.deepEqual([t.x, t.y], [n.x, n.y + dy + 3.5], `${block}.${port}: the wire leaves at x 0`);
      if (side === "right") assert.deepEqual([t.x, t.y], [n.x + 31, n.y + dy + 3.5], `${block}.${port}: the wire leaves at x 31`);
      if (side === "top") assert.deepEqual([t.x, t.y, t.lado], [n.x + 12.5, n.y, "top"], `${block}.${port}: the timeout is on the top edge`);
      assert.equal(t.dir, side === "right" ? "out" : "in", `${block}.${port}: direction`);
    }
  }
  // The rows are on an 8 px pitch, so a terminal on the second row is 8 px under the first.
  const read = D.terminales(node("visa-read"), CTX);
  const rightRows = ["resource-out", "read-buffer", "return-count", "error-out"].map((port) => read.find((t) => t.puerto === port).y);
  assert.deepEqual(rightRows.slice(1).map((y, i) => y - rightRows[i]), [8, 8, 8]);
});

test("a wire reaches the dots of a VISA node, and the resource name keeps its colour", () => {
  let g = Gr.nuevo();
  const open = Gr.crearNodo(g, CAT, "visa-open", 0, 0);
  const write = Gr.crearNodo(open.g, CAT, "visa-write", 120, 0);
  const wired = Gr.conectar(write.g, CAT, { nodo: open.id, puerto: "resource-out", dir: "out" }, { nodo: write.id, puerto: "resource", dir: "in" });
  assert.equal(wired.motivo, undefined);
  g = wired.g;
  const ends = D.extremos(g, CTX);
  assert.deepEqual([ends.get(`${open.id}.resource-out`).x, ends.get(`${open.id}.resource-out`).y], [31, 4.5]);
  assert.deepEqual([ends.get(`${write.id}.resource`).x, ends.get(`${write.id}.resource`).y], [120, 4.5]);
  assert.equal(Gr.tipos(g, CAT).entradas.get(`${write.id}.resource`), VISA_RESOURCE);
});

test("the VISA nodes are drawn with their own icons", () => {
  for (const [block, letter] of [["visa-open", "O"], ["visa-write", "W"], ["visa-read", "R"], ["visa-close", "C"]]) {
    const glyph = G.FUNCIONES[block];
    assert.match(glyph, /font-style="italic"[^>]*>VISA<\/text>/, `${block}: VISA in italic capitals`);
    assert.match(glyph, new RegExp(`font-weight="700"[^>]*>${letter}</text>`), `${block}: the bold ${letter}`);
    assert.deepEqual(G.CAJAS[block], [0, 0, 48, 48], `${block}: the tile fills its 32 x 32`);
    assert.equal(D.glifosPorBloque(INV).get(block), block, `${block}: the node takes the glyph of its palette element`);
  }
  assert.notEqual(G.FUNCIONES["visa-write"], G.FUNCIONES["visa-read"], "the arrow of Read points the other way");
  const html = D.contenido({ ...ED.inicial(), g: Gr.crearNodo(Gr.nuevo(), CAT, "visa-open", 0, 0).g }, CTX, Gr.tipos(Gr.crearNodo(Gr.nuevo(), CAT, "visa-open", 0, 0).g, CAT));
  assert.match(html, /VISA<\/text>/, "the diagram draws the icon");
});

// ——— The menus ———

const BODY = "context.visa-function";
const TERMINAL = "context.visa-function-resource-terminal";

test("the right-click menu of a VISA node is the measured one", () => {
  // Q4 of the report on the nodes, in its order (Disable Breakpoint only appears once there is a breakpoint).
  assert.deepEqual(labels(BODY), ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint", "Disable Breakpoint", "VISA Palette", "Replace", "Synchronous I/O Mode", "Remove and Rewire", "Create", "Properties"]);
  assert.deepEqual(INV.hijos(BODY).filter((e) => e.separado).map((e) => e.etiqueta), ["Add Breakpoint", "VISA Palette", "Synchronous I/O Mode", "Remove and Rewire", "Properties"]);
  for (const block of ["visa-open", "visa-write", "visa-read", "visa-close"]) {
    const n = node(block);
    assert.equal(D.menuDe(n, null, Gr.nuevo()), BODY, block);
    assert.equal(D.menuDe(n, "error-in", Gr.nuevo()), BODY, `${block}: the other terminals have the body's menu (their own was not measured)`);
    assert.equal(D.menuDe(n, "resource", Gr.nuevo()), TERMINAL, `${block}: the resource name terminal has its own`);
  }
  const html = D.menuContextual(INV, { raiz: BODY, x: 0, y: 0 });
  assert.equal((html.match(/class="separador-menu"/g) ?? []).length, 5, "the five separators of the measured menu");
  assert.ok(!/Disable Breakpoint/.test(html), "Disable Breakpoint is not shown while there is no breakpoint");
  // Visible Items ▸ Terminals and Add Breakpoint are done; the rest is greyed, with its reason.
  assert.deepEqual(INV.hijos(BODY).filter((e) => !esHueco(e)).map((e) => e.etiqueta), ["Visible Items", "Add Breakpoint", "Disable Breakpoint", "Create"]);
  for (const [row, unlock] of [["visa-palette", "paleta-visa-en-menu"], ["replace", "menus-contextuales"], ["synchronous-io-mode", "modo-de-e-s-sincrono"], ["remove-and-rewire", "menus-contextuales"], ["properties", "propiedades"]]) {
    assert.equal(INV.entrada(`${BODY}.${row}`).necesita, unlock, row);
  }
  for (const row of ["visa-palette", "replace", "synchronous-io-mode"]) {
    const { solder } = INV.explicacion(INV.entrada(`${BODY}.${row}`));
    assert.match(solder, /^Missing: /, row);
  }
  assert.match(D.menuContextual(INV, { raiz: BODY, x: 0, y: 0 }), /data-id="context\.visa-function\.synchronous-io-mode"[^>]*>[\s\S]*?flecha-menu/, "Synchronous I/O Mode opens a submenu");
  // Terminals shows the node's terminals, ticked.
  let d = ED.abrirMenu({ ...ED.inicial(), g: Gr.crearNodo(Gr.nuevo(), CAT, "visa-write", 0, 0).g }, BODY, "n1", 0, 0);
  d = ED.orden(d, `${BODY}.visible-items.terminals`, CTX);
  assert.equal(d.g.nodos[0].vista.terminales, true);
  assert.ok(ED.marcados(ED.abrirMenu(d, BODY, "n1", 0, 0)).has(`${BODY}.visible-items.terminals`));
  // Without a terminal under the mouse Create's Constant, Control and Indicator are greyed.
  const bare = ED.abrirMenu({ ...ED.inicial(), g: Gr.crearNodo(Gr.nuevo(), CAT, "visa-write", 0, 0).g }, BODY, "n1", 0, 0);
  const { desactivados } = ED.variantes(bare, CTX);
  for (const row of ["constant", "control", "indicator"]) assert.ok(desactivados.has(`${BODY}.create.${row}`), row);
});

test("the resource terminal of a VISA node has its own menu with Create making the VISA constant, control and indicator", () => {
  // The first list of Q5 of the report on the resource name.
  assert.deepEqual(labels(TERMINAL), ["Visible Items", "Help", "Examples", "Description and Tip...", "Add Breakpoint", "Disable Breakpoint", "VISA Palette", "Create", "Replace", "Synchronous I/O Mode", "Remove and Rewire", "Properties"]);
  assert.deepEqual(INV.hijos(TERMINAL).filter((e) => e.separado).map((e) => e.etiqueta), ["Add Breakpoint", "VISA Palette", "Replace", "Synchronous I/O Mode", "Remove and Rewire", "Properties"]);
  assert.deepEqual(labels(`${TERMINAL}.create`), ["Constant", "Control", "Indicator", "Property for Instr Class", "Method for Instr Class", "Channel Writer...", "All Controls and Indicators", "All Constants"]);
  assert.deepEqual(INV.hijos(`${TERMINAL}.create`).filter((e) => e.separado).map((e) => e.etiqueta), ["Property for Instr Class", "All Controls and Indicators"]);
  assert.deepEqual(INV.hijos(`${TERMINAL}.create`).filter((e) => esHueco(e)).map((e) => e.necesita), ["clases-visa", "clases-visa", "canales"]);
  for (const [kind, block] of [["constant", "visa-resource-constant"], ["control", "visa-control"], ["indicator", "visa-indicator"]]) {
    const read = Gr.crearNodo(Gr.nuevo(), CAT, "visa-read", 200, 100);
    const menu = ED.abrirMenu({ ...ED.inicial(), g: read.g }, TERMINAL, read.id, 0, 0, "resource", { x: 0, y: 0 });
    const made = ED.orden(menu, `${TERMINAL}.create.${kind}`, CTX);
    assert.equal(made.menu, null, `${kind}: the order closes the menu`);
    assert.ok(made.g.nodos.some((n) => n.tipo === block), `${kind}: a ${block} is made`);
    // An indicator cannot take the place of an input: LabVIEW's row is there, and it makes the object without a wire.
    assert.equal(made.g.cables.length, kind === "indicator" ? 0 : 1, `${kind}: wired to the resource name when it can be`);
    for (const cable of made.g.cables) assert.equal(Gr.tipos(made.g, CAT).cables.get(cable.id).roto, null, `${kind}: the wire is healthy`);
  }
  // Add Breakpoint turns into Remove Breakpoint, and Disable Breakpoint appears, on both menus.
  for (const root of [BODY, TERMINAL]) {
    const g = Gr.crearNodo(Gr.nuevo(), CAT, "visa-open", 0, 0);
    const state = DS.addBreakpoint(DS.initial(), { node: g.id });
    const variants = DV.menuVariants(state, g.g, Gr.tipos(g.g, CAT), { raiz: root, nodo: g.id });
    assert.equal(variants.rotulos.get(`${root}.add-breakpoint`), "Remove Breakpoint", root);
    assert.ok(variants.mostrados.has(`${root}.disable-breakpoint`), root);
  }
});

// ——— A VI built with them ———

test("a VI built in the editor with VISA Open, Write, Read and Close compiles with its I/O process", () => {
  const FONDO = { tipo: "fondo" };
  const put = (d, block, point) => ED.pulsar(ED.moverA(ED.coger(d, block), CTX, point), CTX, FONDO, point);
  const wire = (d, [from, fromPort], [to, toPort]) => {
    const point = (id, port) => {
      const n = d.g.nodos.find((k) => k.id === id);
      return D.terminales(n, CTX).find((t) => t.puerto === port);
    };
    const [a, b] = [point(from, fromPort), point(to, toPort)];
    let next = ED.pulsar(d, CTX, { tipo: "terminal", nodo: from, puerto: fromPort, dir: a.dir }, { x: a.x, y: a.y });
    next = ED.moverA(next, CTX, { x: b.x, y: b.y });
    const done = ED.soltar(next, CTX, { tipo: "terminal", nodo: to, puerto: toPort, dir: b.dir }, { x: b.x, y: b.y });
    assert.equal(done.g.cables.length, d.g.cables.length + 1, `${from}.${fromPort} → ${to}.${toPort} is drawn`);
    return done;
  };
  // The blocks come from the elements of the palettes, as a click on them gives them.
  const blockOf = (id) => INV.entrada(`${ROOT}.${id}`).bloque;
  let d = ED.inicial();
  const names = [["open", "visa.visa-advanced.visa-open"], ["write", "visa.visa-write"], ["read", "visa.visa-read"], ["close", "serial.visa-close"]];
  const id = {};
  names.forEach(([name, path], i) => {
    d = put(d, blockOf(path), { x: 80 + i * 120, y: 100 });
    id[name] = d.g.nodos.at(-1).id;
  });
  d = put(d, "visa-resource-constant", { x: 0, y: 100 });
  const constant = d.g.nodos.at(-1).id;
  // A constant is born with its value being typed: the click that places the next one first ends the typing.
  d = ED.confirmar(put(d, "str-const", { x: 100, y: 200 }), CTX);
  const query = d.g.nodos.at(-1).id;
  d = ED.confirmar(put(d, "const", { x: 220, y: 200 }), CTX);
  const count = d.g.nodos.at(-1).id;
  d = { ...d, g: Gr.fijarConfig(Gr.fijarConfig(d.g, count, { value: 16, type: "u32" }), query, { value: "*IDN?\n" }) };
  d = wire(d, [constant, "result"], [id.open, "resource"]);
  d = wire(d, [query, "result"], [id.write, "write-buffer"]);
  d = wire(d, [count, "result"], [id.read, "byte-count"]);
  d = wire(d, [id.open, "resource-out"], [id.write, "resource"]);
  d = wire(d, [id.write, "resource-out"], [id.read, "resource"]);
  d = wire(d, [id.read, "resource-out"], [id.close, "resource"]);
  d = wire(d, [id.open, "error-out"], [id.write, "error-in"]);
  d = wire(d, [id.write, "error-out"], [id.read, "error-in"]);
  d = wire(d, [id.read, "error-out"], [id.close, "error-in"]);
  assert.equal(d.g.cables.length, 9, "every wire was drawn");
  for (const cable of d.g.cables) assert.equal(Gr.tipos(d.g, CAT).cables.get(cable.id).roto, null, "no broken wire");
  const compiled = compilar(d.g, CAT);
  assert.ok(!compiled.errores?.length, "it compiles without errors");
  assert.equal(compiled.usesInstrumentIo, true, "a Run of it gets a port to the I/O process");
  assert.equal(compilar(Gr.nuevo(), CAT).usesInstrumentIo, false, "a VI without VISA does not");
});

test("the menu of a VISA resource name wire names its palette row VISA Palette, and a numeric wire keeps Numeric Palette", () => {
  const wiredFrom = (constantBlock, constantConfig, sink, sinkPort) => {
    let g = Gr.nuevo();
    const constant = Gr.crearNodo(g, CAT, constantBlock, 0, 0);
    g = Gr.fijarConfig(constant.g, constant.id, constantConfig);
    const target = Gr.crearNodo(g, CAT, sink, 100, 0);
    g = Gr.conectar(target.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: target.id, puerto: sinkPort, dir: "in" }).g;
    return ED.abrirMenu({ ...ED.inicial(), g }, ED.WIRE_MENU_ROOT, g.cables[0].id, 0, 0);
  };
  const paletteRow = `${ED.WIRE_MENU_ROOT}.numeric-palette`;
  assert.equal(ED.variantes(wiredFrom("visa-resource-constant", { value: "" }, "visa-close", "resource"), CTX).rotulos.get(paletteRow), "VISA Palette");
  assert.equal(ED.variantes(wiredFrom("const", { value: 1 }, "visa-read", "byte-count"), CTX).rotulos.get(paletteRow), undefined);
});
