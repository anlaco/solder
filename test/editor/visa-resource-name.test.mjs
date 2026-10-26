// The VISA resource name in the editor (DT-065, DT-066): its wire, its diagram constant, its panel control and
// indicator, their terminals, their menus and its place in Controls ▸ Modern ▸ I/O. Every measure comes from
// labview-captures/reports/2026-10-26-visa-resource-name-look.md (the look and the menus) and from
// 2026-10-25-visa-palettes.md §4 (the palette); the captures are local evidence and are not committed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { COLORES, VISA_RESOURCE, aspecto } from "../../core/model/types.mjs";
import { blockForTerminal } from "../../core/model/create-on-terminal.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as RV from "../../editor/src/window/run-values.mjs";
import * as TC from "../../editor/src/block-diagram/terminal-creation.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as HC from "../../editor/src/front-panel/html-controls.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { celdasSubpaleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { CAT, INV, RAIZ } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const PURPLE = "#7f007f";
const SOCKET = "TCPIP0::10.0.2.2::5125::SOCKET";

/** A diagram with a VISA resource name constant wired to the resource terminal of a VISA Read. */
function constantToRead() {
  let g = Gr.nuevo();
  const constant = Gr.crearNodo(g, CAT, "visa-resource-constant", 0, 0);
  const read = Gr.crearNodo(constant.g, CAT, "visa-read", 120, 0);
  const wired = Gr.conectar(read.g, CAT, { nodo: constant.id, puerto: "result", dir: "out" }, { nodo: read.id, puerto: "resource", dir: "in" });
  assert.equal(wired.motivo, undefined, "the types match, so the wire is healthy");
  return { g: Gr.fijarValor(wired.g, constant.id, SOCKET), constant: constant.id, read: read.id };
}

const withBox = (g, id) => D.caja(g.nodos.find((n) => n.id === id), CTX);

// ——— Q2: the wire ———

test("the wire of a VISA resource name is purple, 2 px, a squiggle of period 4", () => {
  assert.deepEqual(aspecto(VISA_RESOURCE), { color: PURPLE, dimension: 0, squiggle: true });
  assert.equal(COLORES.visa, PURPLE);
  const { g } = constantToRead();
  const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
  const wire = html.match(/<g class="cable"[^>]*>([\s\S]*?)<\/g>/)[1];
  const rows = [...wire.matchAll(/<polyline [^>]*>/g)].map(([row]) => row);
  assert.equal(rows.length, 2, "two pixel rows make the 2 px");
  for (const row of rows) {
    assert.match(row, /stroke="#7f007f" stroke-width="1" stroke-dasharray="3 1"/, "each row is 3 on and 1 off");
  }
  assert.deepEqual(rows.map((row) => row.match(/stroke-dashoffset="(\d+)"/)[1]), ["0", "2"], "the lower row two pixels ahead");
});

test("a wire of another type keeps its own style", () => {
  assert.equal(aspecto("string").squiggle, undefined);
  assert.equal(aspecto({ array: VISA_RESOURCE }).squiggle, undefined, "an array of resources has the array's wire, not yet measured");
});

// ——— Q1: the constant ———

test("the constant of a VISA resource name measures 35 x 20 empty and grows to the right with its text", () => {
  let { g, constant } = constantToRead();
  const typed = withBox(g, constant);
  assert.equal(typed.alto, 20);
  const text = D.MEDIDAS_VISA_CONSTANT;
  assert.equal(typed.ancho, text.textoDesde + D.anchoTexto(SOCKET) + text.relleno + text.derecha, "14 px, the text, 5 px of padding and 12 px");
  g = Gr.fijarValor(g, constant, "");
  const empty = withBox(g, constant);
  assert.deepEqual([empty.ancho, empty.alto], [35, 20], "measured on resource-name-c0.png");
  assert.equal(empty.x, typed.x, "the left edge is where the constant was put");
  assert.equal(D.MEDIDAS_VISA_CONSTANT.textoDesde + text.areaVacia + text.derecha, 35);
});

test("the constant draws its glyph, text, divider and arrow in the type's colour", () => {
  const { g, constant } = constantToRead();
  const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
  const box = html.match(/<div class="constante visa" style="border-color:#7f007f;--tipo:#7f007f">([\s\S]*?<\/span>)<\/div>/)[1];
  assert.match(box, /<span class="visa-glifo"><svg/);
  assert.match(box, new RegExp(`<span class="visa-texto"><span>${SOCKET}</span></span>`));
  assert.match(box, /<span class="visa-division"><\/span>/);
  assert.match(box, /<span class="visa-flecha" data-visa-dropdown><svg/);
  assert.match(html, new RegExp(`class="nodo[^"]*editable[^"]*" data-nodo="${constant}"`), "a constant is typed into");
  const arrow = G.visaDropdownArrow(PURPLE);
  assert.deepEqual([...arrow.matchAll(/width="(\d)" height="1"/g)].map((m) => Number(m[1])), [7, 5, 3, 1], "the arrow is 7, 5, 3 and 1 px wide");
});

test("typing the resource name edits the value of the constant as a string constant's", () => {
  let { g, constant } = constantToRead();
  g = Gr.fijarValor(g, constant, "");
  let d = ED.editar({ ...ED.inicial(), g }, CTX, constant);
  assert.equal(d.edicion.cadena, undefined, "one line: Enter confirms");
  for (const key of "ASRL1::INSTR") d = ED.teclear(d, key);
  assert.equal(D.caja(d.g.nodos.find((n) => n.id === constant), CTX, d.edicion).ancho, 14 + D.anchoTexto("ASRL1::INSTR") + 5 + 12, "it grows to the right while typed");
  assert.match(D.contenido(d, CTX, Gr.tipos(d.g, CAT)), /<span class="visa-texto"><span>ASRL1::INSTR<\/span><span class="caret"><\/span><\/span>/);
  const confirmed = ED.confirmar(d, CTX);
  assert.equal(confirmed.g.nodos.find((n) => n.id === constant).config.value, "ASRL1::INSTR");
  assert.equal(confirmed.edicion, null);
  assert.equal(confirmed.g.nodos.find((n) => n.id === constant).x, 0, "the left edge stays");
});

// ——— Q3: the panel control and indicator ———

const place = (p, block, point) => P.confirmar(P.pulsar(P.moverA(P.coger(p, block), CTX, point), CTX, { tipo: "fondo" }, point));

test("a VISA resource name control and indicator are 104 x 26 px, labelled VISA resource name", () => {
  let p = place(P.inicial(), "visa-control", { x: 100, y: 100 });
  p = place(p, "visa-indicator", { x: 400, y: 100 });
  const [control, indicator] = p.g.nodos;
  assert.deepEqual([control.label.text, indicator.label.text], ["VISA resource name", "VISA resource name 2"]);
  for (const node of p.g.nodos) {
    const box = P.caja(node);
    assert.deepEqual([box.ancho, box.alto], [104, 26], node.tipo);
  }
  assert.deepEqual(CV.currentValue(control), "", "a new control holds an empty resource name");
});

test("the HTML of the control has an icon cell, a field and the dropdown button; the indicator has no button", () => {
  let p = place(P.inicial(), "visa-control", { x: 100, y: 100 });
  p = place(p, "visa-indicator", { x: 400, y: 100 });
  const [control, indicator] = p.g.nodos;
  const withValue = { ...p, g: CV.setCurrentValue(p.g, control.id, SOCKET) };
  const html = P.contenido(P.editarValor(withValue, CTX, control.id, false), CTX);
  assert.match(html, new RegExp(`class="objeto-panel sd-control sd-visa editando-valor sd-editing" data-nodo="${control.id}"`));
  assert.match(html, /<span class="sd-visa-icon"><span class="sd-visa-glyph" aria-hidden="true"><svg/);
  assert.match(html, new RegExp(`data-casilla="${control.id}"><span class="sd-value"><span>${SOCKET}</span><span class="caret">`), "the field takes what is typed");
  assert.match(html, /<span class="sd-dropdown" role="button" aria-haspopup="menu" aria-label="VISA resources" data-visa-dropdown><\/span>/);
  const idle = P.contenido(p, CTX);
  assert.equal((idle.match(/data-visa-dropdown/g) ?? []).length, 1, "only the control has the button");
  assert.match(idle, new RegExp(`class="objeto-panel sd-indicator sd-visa" data-nodo="${indicator.id}"`));
});

test("the value typed in the field of the control is its current value, kept as typed on one line", () => {
  let p = place(P.inicial(), "visa-control", { x: 100, y: 100 });
  const id = p.g.nodos[0].id;
  p = P.editarValor(p, CTX, id, true);
  assert.equal(p.edicion.cadena, undefined, "Enter does not add a line");
  for (const key of "TCPIP::10.0.2.2::5125::SOCKET") p = P.teclear(p, key);
  p = P.teclear(p, "Enter");
  assert.equal(p.edicion, null, "Enter confirms");
  assert.equal(CV.currentValue(p.g.nodos[0]), "TCPIP::10.0.2.2::5125::SOCKET");
  assert.equal(p.g.nodos[0].config.value, "", "the default the file saves is not changed");
});

test("a press inside the field of a VISA resource name control types in it, and its indicator is not typed into", () => {
  const p = place(place(P.inicial(), "visa-control", { x: 100, y: 100 }), "visa-indicator", { x: 400, y: 100 });
  const [control, indicator] = p.g.nodos;
  const middle = (n) => ({ x: P.caja(n).x + 50, y: P.caja(n).y + 13 });
  const typed = P.pulsar(p, CTX, { tipo: "casilla", id: control.id }, middle(control));
  assert.equal(typed.edicion?.nodo, control.id);
  const notTyped = P.pulsar(p, CTX, { tipo: "casilla", id: indicator.id }, middle(indicator));
  assert.equal(notTyped.edicion, null);
});

test("after a Run the indicator keeps the resource string it showed", () => {
  const p = place(P.inicial(), "visa-indicator", { x: 100, y: 100 });
  const [indicator] = p.g.nodos;
  assert.equal(RV.isIndicator(indicator), true);
  const after = RV.afterRun(p.g, { [indicator.id]: SOCKET });
  assert.equal(CV.currentValue(after.graph.nodos[0]), SOCKET);
  assert.deepEqual(after.shownValues, {});
});

// ——— Q3: the terminals ———

function panelTerminals(block, compact) {
  let g = Gr.nuevo();
  g = Gr.crearEnPanel(g, CAT, block, 60, 60, "VISA resource name").g;
  const id = g.nodos[0].id;
  if (compact) g = Gr.alternarIcono(g, id);
  return { g, id };
}

test("the terminals are 38 x 38 with View As Icon and 32 x 16 without, control and indicator", () => {
  for (const [block, compact, size] of [["visa-control", false, [38, 38]], ["visa-indicator", false, [38, 38]], ["visa-control", true, [32, 16]], ["visa-indicator", true, [32, 16]]]) {
    const { g, id } = panelTerminals(block, compact);
    const box = D.caja(g.nodos.find((n) => n.id === id), CTX);
    assert.deepEqual([box.ancho, box.alto], size, `${block}${compact ? " compact" : ""}`);
  }
});

test("the icon terminal shows the control's picture in the type's colour with its I/O tab", () => {
  const control = G.terminalVisa(true, false);
  assert.match(control, /<rect x="1" y="1" width="36" height="36" fill="var\(--paper\)" stroke="#7f007f" stroke-width="2"\/>/, "a control: 2 px frame");
  assert.match(control, />I\/O<\/text>/);
  assert.match(control, />VISA<\/text>/);
  const indicator = G.terminalVisa(false, false);
  assert.match(indicator, /<rect x="0.5" y="0.5" width="37" height="37" fill="var\(--paper\)" stroke="#7f007f" stroke-width="1"\/>/, "an indicator: 1 px frame");
  const html = D.contenido({ ...ED.inicial(), g: panelTerminals("visa-control", false).g }, CTX, undefined);
  assert.match(html, /class="glifo-terminal-panel"><svg viewBox="0 0 38 38"/);
  assert.match(html, />I\/O<\/text>/);
});

test("the compact terminal has the arrow cell in the light purple, #d8b2d8 edged #a54ca5, and I/0 in the box", () => {
  for (const control of [true, false]) {
    const compact = G.terminalVisa(control, true);
    assert.match(compact, /fill="#d8b2d8" stroke="#a54ca5"/);
    assert.match(compact, />I\/0<\/text>/);
    assert.match(compact, /viewBox="0 0 32 16"/);
  }
});

test("View As Icon of the terminal of a VISA resource name switches between 38 x 38 and 32 x 16", () => {
  const { g, id } = panelTerminals("visa-control", false);
  const menu = ED.abrirMenu({ ...ED.inicial(), g }, "context.visa-control-terminal", id, 0, 0);
  assert.ok(ED.marcados(menu, CTX).has("context.visa-control-terminal.view-as-icon"), "ticked while the icon shows");
  const flipped = ED.orden(menu, "context.visa-control-terminal.view-as-icon", CTX);
  assert.equal(flipped.g.nodos[0].vista.compacto, true);
  assert.equal(INV.resolver("context.visa-control-terminal.view-as-icon").estado, "built");
});

test("Create on a VISA resource name makes its constant, control and indicator, wired", () => {
  assert.deepEqual(blockForTerminal(VISA_RESOURCE, "constant"), { tipo: "visa-resource-constant", config: { value: "" } });
  assert.deepEqual(blockForTerminal(VISA_RESOURCE, "control"), { tipo: "visa-control" });
  assert.deepEqual(blockForTerminal(VISA_RESOURCE, "indicator"), { tipo: "visa-indicator" });
  let g = Gr.nuevo();
  const read = Gr.crearNodo(g, CAT, "visa-read", 200, 100);
  for (const [kind, expected] of [["constant", "visa-resource-constant"], ["control", "visa-control"]]) {
    const made = TC.createForTerminal(read.g, CTX, { nodo: read.id, puerto: "resource", kind });
    assert.equal(made.wired, true, kind);
    assert.equal(made.g.nodos.find((n) => n.id === made.id).tipo, expected);
    assert.equal(made.g.cables.length, 1);
    assert.equal(Gr.tipos(made.g, CAT).cables.get(made.g.cables[0].id).roto, null, "the wire is healthy");
  }
});

// ——— Q4: the dropdown ———

test("the arrow of a VISA resource name opens the menu with only Refresh, greyed, saying why", () => {
  assert.equal(ED.VISA_DROPDOWN_MENU, "context.visa-dropdown");
  assert.deepEqual(INV.hijos(ED.VISA_DROPDOWN_MENU).map((e) => [e.etiqueta, e.estado, e.necesita]), [["Refresh", "todo", "listar-recursos-visa"]]);
  const menu = { raiz: ED.VISA_DROPDOWN_MENU, nodo: "x", puerto: null, x: 200, y: 300, en: null, abierto: null };
  const html = D.menuContextual(INV, menu);
  assert.match(html, /<div class="menu-contextual" data-menu="context.visa-dropdown" style="left:200px;top:300px/, "flush left under the control");
  assert.equal((html.match(/class="item-menu hueco"/g) ?? []).length, 1, "one row, greyed");
  assert.match(INV.explicacion(INV.entrada("context.visa-dropdown.refresh")).solder, /listing the VISA resources of the machine/);
});

// ——— Q5: the menus ———

const rowsOf = (root) => INV.hijos(root).map((e) => [e.etiqueta, e.estado]);
const labels = (root) => INV.hijos(root).map((e) => e.etiqueta);

test("the VISA resource name constant has its own menu, measured", () => {
  const root = "context.visa-constant";
  assert.deepEqual(labels(root), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "VISA Palette", "Create",
    "Replace", "Data Operations", "Advanced", "Select VISA Class", "Size To Text", "Select Item...", "Properties"]);
  assert.deepEqual(labels(`${root}.visible-items`), ["Label", "Menu Button"]);
  assert.deepEqual(labels(`${root}.create`), ["Constant", "Control", "Indicator", "Property for Instr Class", "Method for Instr Class", "Channel Writer...", "Cluster from Selection"]);
  assert.deepEqual(labels(`${root}.data-operations`), ["Cut Data", "Copy Data", "Paste Data"]);
  assert.deepEqual(labels(`${root}.advanced`), ["Customize..."]);
  assert.deepEqual(INV.hijos(root).filter((e) => e.separado).map((e) => e.etiqueta), ["Make Type Def.", "Description and Tip...", "VISA Palette", "Select VISA Class", "Size To Text", "Select Item...", "Properties"]);
  assert.equal(D.menuDe(constantToRead().g.nodos[0], null, constantToRead().g), root);
  assert.ok(INV.hijos(root).every((e) => esHueco(e)), "nothing of it is done yet, and each row says why");
  const menu = ED.abrirMenu({ ...ED.inicial(), g: constantToRead().g }, root, constantToRead().constant, 0, 0);
  const marks = ED.marcados(menu, CTX);
  for (const mark of ["visible-items.menu-button", "size-to-text", "select-visa-class.i-o-session", "select-visa-class.i-o-session.instr"]) assert.ok(marks.has(`${root}.${mark}`), mark);
});

test("Select VISA Class lists its two classes, the I/O sessions and the events, as measured", () => {
  const root = "context.visa-constant.select-visa-class";
  assert.deepEqual(labels(root), ["I/O Session", "Event Class"]);
  const sessions = labels(`${root}.i-o-session`);
  assert.equal(sessions.length, 18);
  assert.deepEqual(sessions.slice(0, 3), ["Instr", "GPIB Instr", "VXI/GPIB-VXI MBD Instr"]);
  assert.equal(sessions.at(-1), "FireWire Instr");
  const events = labels(`${root}.event-class`);
  assert.equal(events.length, 13);
  assert.deepEqual([events[0], events.at(-1)], ["Generic Event", "VXI/VME Sysreset Event"]);
  for (const entry of INV.entradas.filter((e) => e.id.startsWith(`${root}.`))) assert.equal(entry.necesita, "clases-visa", entry.id);
});

test("the VISA resource name control has its own menu, measured", () => {
  const root = "context.visa-control";
  assert.deepEqual(labels(root), ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "Create", "Replace", "Data Operations",
    "Advanced", "Fit Control to Pane", "Scale Object with Pane", "Select VISA Class", "Select Item...", "Properties"]);
  assert.deepEqual(labels(`${root}.visible-items`), ["Label", "Caption", "Menu Button"]);
  assert.deepEqual(labels(`${root}.create`), ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  assert.deepEqual(labels(`${root}.advanced`), ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "Hide Control", "Enabled State"]);
  assert.equal(INV.hijos(root).some((e) => e.etiqueta === "VISA Palette" || e.etiqueta === "Size To Text"), false, "the panel has no VISA Palette and no Size To Text");
  const { g, id } = panelTerminals("visa-control", false);
  assert.equal(P.menuDe(g.nodos.find((n) => n.id === id)), root);
  const marks = ED.marcados(ED.abrirMenu({ ...P.inicial(), g }, root, id, 0, 0), CTX);
  assert.ok(marks.has(`${root}.visible-items.caption`) && !marks.has(`${root}.visible-items.label`), "Caption is ticked, Label is not (the report's surprise)");
});

test("the terminals of a VISA resource name have their menus, measured", () => {
  for (const [root, tipo, expected] of [
    ["context.visa-control-terminal", "visa-control", ["Visible Items", "Find Control", "Make Type Def.", "Hide Control", "Change to Indicator", "Change to Array", "Change to Constant", "Description and Tip...", "VISA Palette", "Create", "Data Operations", "Advanced", "Select VISA Class", "View As Icon", "Select Item...", "Properties"]],
    ["context.visa-indicator-terminal", "visa-indicator", ["Visible Items", "Find Indicator", "Make Type Def.", "Hide Indicator", "Change to Control", "Change to Array", "Change to Constant", "Description and Tip...", "VISA Palette", "Create", "Data Operations", "Advanced", "Select VISA Class", "View As Icon", "Select Item...", "Properties"]],
  ]) {
    assert.deepEqual(labels(root), expected, root);
    const { g, id } = panelTerminals(tipo, false);
    assert.equal(D.menuDe(g.nodos.find((n) => n.id === id), null, g), root);
    const menu = ED.abrirMenu({ ...ED.inicial(), g }, root, id, 0, 0);
    assert.ok(ED.variantes(menu, CTX).desactivados.has(`${root}.advanced`), "Advanced is greyed in LabVIEW on the terminal");
    assert.deepEqual(labels(`${root}.create`), ["Constant", "Control", "Indicator", "Local Variable", "Reference", "Property Node", "Invoke Node", "Property for Instr Class", "Method for Instr Class", "Channel Writer...", "Cluster from Selection"]);
    assert.ok(INV.hijos(root).filter((e) => !esHueco(e)).map((e) => ultimo(e.id)).join() === "data-operations,view-as-icon", "what is done: Data Operations and View As Icon");
  }
});

test("Data Operations of a VISA resource name makes its current value its default", () => {
  for (const block of ["visa-control", "visa-indicator"]) {
    const root = block === "visa-control" ? "context.visa-control-terminal" : "context.visa-indicator-terminal";
    let { g, id } = panelTerminals(block, false);
    g = CV.setCurrentValue(g, id, SOCKET);
    const menu = ED.abrirMenu({ ...ED.inicial(), g }, root, id, 0, 0);
    const made = ED.orden(menu, `${root}.data-operations.make-current-value-default`, CTX);
    assert.equal(made.g.nodos[0].config.value, SOCKET, `${block}: the current value is the default`);
    const back = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: CV.setCurrentValue(made.g, id, "other") }, root, id, 0, 0), `${root}.data-operations.reinitialize-to-default-value`, CTX);
    assert.equal(CV.currentValue(back.g.nodos[0]), SOCKET, `${block}: reinitialized`);
  }
  for (const root of ["context.visa-control", "context.visa-control-terminal", "context.visa-indicator-terminal"]) {
    assert.equal(INV.resolver(`${root}.data-operations.make-current-value-default`).estado, "built", root);
  }
});

test("every greyed row of the VISA menus says what is missing", () => {
  const holes = INV.entradas.filter((e) => /^context\.visa-/.test(e.id) && esHueco(e));
  assert.ok(holes.length > 100);
  for (const hole of holes) {
    const { labview, solder } = INV.explicacion(hole);
    assert.ok(labview && /^Missing: /.test(solder), hole.id);
  }
});

// ——— The palette ———

test("the VISA resource name control is placed from Controls Modern I/O with its terminal", () => {
  const id = "palette.controls.modern.io";
  const withControls = { ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) };
  const opened = clic(withControls, INV, id, { x: 50, y: 60 });
  assert.equal(opened.paleta.cascada[0].id, id, "the folder is done, so it opens");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 3);
  assert.deepEqual(sitios.map((s) => [s.fila + 1, s.columna + 1, s.e.etiqueta]), [
    [1, 1, "Waveform"], [1, 2, "Digital Waveform"], [1, 3, "Digital Data"],
    [2, 1, "Traditional DAQ Channel"], [2, 2, "DAQmx Name Controls"], [2, 3, "DataFinder"],
    [3, 1, "VISA resource name"], [3, 2, "IVI Logical Name"], [3, 3, "FieldPoint IO Point"],
    [4, 1, "IMAQ Session"], [4, 2, "Motion Resource"], [4, 3, "System Configuration"],
    [5, 1, "Shared Variable Control"],
  ], "(row, column) as measured on controls-modern-io.png");
  const html = subpaletas(INV, opened.paleta);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.visa-resource-name"`), "VISA resource name is done");
  for (const hole of INV.hijos(id).filter((e) => !["visa-resource-name", "thumbtack", "daqmx-name-controls"].includes(ultimo(e.id)))) {
    assert.ok(esHueco(hole), hole.id);
    if (ultimo(hole.id) !== "thumbtack") assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${hole.id.replaceAll(".", "\\.")}"`), `${hole.etiqueta} is greyed`);
  }
  assert.match(html, /class="carpeta hueco" data-id="palette\.controls\.modern\.io\.daqmx-name-controls"/, "DAQmx Name Controls is a greyed subpalette");
  const entry = INV.entrada(`${id}.visa-resource-name`);
  assert.equal(entry.bloque, "visa-control");
  // Placing it puts the control on the panel with its terminal on the diagram.
  const put = place(P.inicial(), entry.bloque, { x: 80, y: 80 });
  assert.equal(put.g.nodos[0].tipo, "visa-control");
  assert.equal(put.g.nodos[0].label.text, "VISA resource name");
  assert.ok(G.CONTROLES["visa-resource-name"], "the palette icon is drawn");
  for (const e of INV.hijos(id)) assert.ok(G.CONTROLES[ultimo(e.id)] || G.CARPETAS_CONTROLES[ultimo(e.id)] || ultimo(e.id) === "thumbtack", `${e.id} has an icon`);
});

// ——— The panel styles ———

test("every panel style dresses the VISA resource name", () => {
  const dir = new URL("../../editor/src/panel-styles/", import.meta.url);
  const sheet = (name) => readFileSync(new URL(name, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(HC.PLAIN_KINDS.includes("visa"));
  assert.match(sheet("plain.css"), /\.sd-visa\b/);
  assert.match(sheet("plain.css"), /\.sd-panel \.sd-visa-glyph \{ display: none; \}/, "the glyph is ornament in Plain");
  assert.match(sheet("old-school.css"), /\.sd-panel \.sd-visa-glyph \{[^}]*display: block/, "Old School draws it");
  assert.match(sheet("solder.css"), /\.sd-panel \.sd-visa \.sd-dropdown/);
});

test("Old School's VISA resource name has the measured bevel, cells and button", () => {
  const css = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector) => css.match(new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]*)\\}`))[1];
  assert.match(rule(".sd-panel .sd-visa-icon"), /left: 4px; top: 4px; width: 9px; height: 18px; background: #b3b3b3/);
  assert.match(rule(".sd-panel .sd-visa .sd-field"), /left: 14px; top: 5px; width: 86px; height: 17px/);
  assert.match(rule(".sd-panel .sd-visa.sd-control .sd-field"), /width: 69px/);
  assert.match(rule(".sd-panel .sd-visa .sd-dropdown"), /left: 83px; top: 5px; width: 17px; height: 17px; padding: 0; border: 0; border-radius: 0; background: #b3b3b3/);
  assert.match(rule(".sd-panel .sd-visa .sd-dropdown"), /#e3e3e3[^;]*#696969[^;]*#fff[^;]*#a0a0a0/);
  assert.match(rule(".sd-panel .sd-visa"), /#c9c9c9[\s\S]*#d3d3d3[\s\S]*#eaeaea[\s\S]*#c2c2c2[\s\S]*#b7b7b7[\s\S]*#adadad[\s\S]*#f2f2f2[\s\S]*#b1b1b1[\s\S]*#eeeeee/, "the four rows of the bevel");
});
