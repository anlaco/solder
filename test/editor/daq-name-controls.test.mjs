// The DAQ names on the panel (DT-076 §5, finding #16 of docs/design/daq-plugin-findings.md): the seven controls of
// Controls ▸ Modern ▸ I/O ▸ DAQ Name Controls, their indicators, terminals and menus, and what a task control gives a
// diagram. Every measure comes from labview-captures/reports/2026-11-06-daqmx-types.md ("Panel", "Dropdowns, menus",
// "Values"); the captures are local evidence and are not committed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as CV from "../../core/model/control-values.mjs";
import { DAQ_NAME_KINDS, DAQ_TASK, daqName } from "../../core/model/daq-name.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { blockForTerminal } from "../../core/model/create-on-terminal.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as TC from "../../editor/src/block-diagram/terminal-creation.mjs";
import * as RV from "../../editor/src/window/run-values.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { celdasSubpaleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { CAT, INV, buildOVI, callerCatalog } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FOLDER = "palette.controls.modern.io.daqmx-name-controls";
const PURPLE = "#7f007f";

/** The palette's entries with their kind and the label LabVIEW gives (DAQmx for DAQ, DT-076 §1), in the measured order. */
const KINDS_BY_ENTRY = [
  ["task-name", "task", "DAQ Task Name"], ["global-channel", "global-channel", "DAQ Global Channel"],
  ["physical-channel", "physical-channel", "DAQ Physical Channel"], ["terminal", "terminal", "DAQ Terminal"], ["scale-name", "scale", "DAQ Scale Name"],
  ["device-name", "device", "DAQ Device Name"], ["switch", "switch", "DAQ Switch"],
];

const place = (p, block, config, point) => P.confirmar(P.pulsar(P.moverA(P.coger(p, block, config), CTX, point), CTX, { tipo: "fondo" }, point));
const labels = (root) => INV.hijos(root).map((e) => e.etiqueta);

// ——— The palette ———

test("the DAQ name controls are placed from Controls Modern I/O DAQ Name Controls with their terminals", () => {
  const io = "palette.controls.modern.io";
  const opened = clic({ ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) }, INV, io, { x: 50, y: 60 });
  const inside = clic(opened, INV, FOLDER, { x: 100, y: 100 });
  assert.equal(inside.paleta.cascada.at(-1).id, FOLDER, "the folder is done, so it opens");
  const { columnas, sitios } = celdasSubpaleta(INV, FOLDER);
  assert.equal(columnas, 3);
  assert.deepEqual(sitios.map((s) => [s.fila + 1, s.columna + 1, s.e.etiqueta]), [
    [1, 1, "Task Name"], [1, 2, "Global Channel"],
    [2, 1, "Physical Channel"], [2, 2, "Terminal"], [2, 3, "Scale Name"],
    [3, 1, "Device Name"], [3, 2, "Switch"],
  ], "as measured on ctlpal.png: rows of 2, 3 and 2");
  assert.equal(INV.entrada(FOLDER).etiqueta, "DAQ Name Controls", "DAQ for DAQmx (DT-076 §1)");
  const html = subpaletas(INV, inside.paleta);
  for (const [id, kind, label] of KINDS_BY_ENTRY) {
    const entry = INV.entrada(`${FOLDER}.${id}`);
    assert.equal(esHueco(entry), false, id);
    assert.match(html, new RegExp(`class="icono-funcion" data-id="${FOLDER.replaceAll(".", "\\.")}\\.${id}"`), `${id} is done`);
    assert.ok(G.CONTROLES[id], `${id} has its icon`);
    assert.equal(entry.bloque, "daq-name-control");
    assert.deepEqual(entry.config, { type: daqName(kind) });
    const put = place(P.inicial(), entry.bloque, entry.config, { x: 80, y: 80 });
    const [control] = put.g.nodos;
    assert.equal(control.tipo, "daq-name-control");
    assert.deepEqual(control.config.type, daqName(kind));
    assert.equal(control.label.text, label);
    assert.equal(Gr.tipos(put.g, CAT).salidas.get(`${control.id}.result`)?.["daq-name"], kind, "its terminal gives the name's kind");
  }
});

test("the seven kinds of the palette are the seven kinds of the DAQ name", () => {
  assert.deepEqual(KINDS_BY_ENTRY.map(([, kind]) => kind).sort(), [...DAQ_NAME_KINDS].sort());
});

// ——— The panel ———

test("a DAQ name control is 168 x 26 px and its indicator 104 x 26, as measured", () => {
  let p = place(P.inicial(), "daq-name-control", { type: DAQ_TASK }, { x: 100, y: 100 });
  p = place(p, "daq-name-indicator", { type: DAQ_TASK }, { x: 400, y: 100 });
  const [control, indicator] = p.g.nodos;
  assert.deepEqual([control.label.text, indicator.label.text], ["DAQ Task Name", "DAQ Task Name 2"]);
  assert.deepEqual([P.caja(control).ancho, P.caja(control).alto], [168, 26], "task in, reports/2026-11-06-daqmx-types.md, Panel");
  assert.deepEqual([P.caja(indicator).ancho, P.caja(indicator).alto], [104, 26], "task out");
  assert.deepEqual(CV.currentValue(control), "", "a task shows [\"\", 0] at rest: no name");
});

test("the HTML of a DAQ name is a VISA resource name's with its own class, and its button opens nothing yet", () => {
  let p = place(P.inicial(), "daq-name-control", { type: DAQ_TASK }, { x: 100, y: 100 });
  p = place(p, "daq-name-indicator", { type: DAQ_TASK }, { x: 400, y: 100 });
  const [control, indicator] = p.g.nodos;
  const html = P.contenido(p, CTX);
  assert.match(html, new RegExp(`class="objeto-panel sd-control sd-visa sd-daq-name" data-nodo="${control.id}"`));
  assert.match(html, new RegExp(`class="objeto-panel sd-indicator sd-visa sd-daq-name" data-nodo="${indicator.id}"`));
  assert.match(html, /<span class="sd-visa-icon"><span class="sd-visa-glyph" aria-hidden="true"><svg/, "the I/O glyph");
  assert.equal((html.match(/class="sd-dropdown"/g) ?? []).length, 1, "only the control has the button");
  assert.equal((html.match(/data-visa-dropdown/g) ?? []).length, 0, "and it is not the VISA resources' menu");
});

test("old school draws the control's arrow button 64 px to the right of a VISA resource name's, the indicator is the same", () => {
  const css = readFileSync(new URL("../../editor/src/panel-styles/old-school.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector) => css.match(new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]*)\\}`))[1];
  assert.match(rule(".sd-panel .sd-daq-name.sd-control .sd-field"), /width: 133px/, "69 + the 64 px the box is wider");
  assert.match(rule(".sd-panel .sd-daq-name .sd-dropdown"), /left: 147px/, "83 + 64: the button stays at the right bevel");
  assert.doesNotMatch(css, /\.sd-daq-name\.sd-indicator/, "104 wide, as a VISA resource name's");
});

test("the value typed in a DAQ name control is its current value, and a press in its field types in it", () => {
  let p = place(P.inicial(), "daq-name-control", { type: DAQ_TASK }, { x: 100, y: 100 });
  const [control] = p.g.nodos;
  const typed = P.pulsar(p, CTX, { tipo: "casilla", id: control.id }, { x: P.caja(control).x + 50, y: P.caja(control).y + 13 });
  assert.equal(typed.edicion?.nodo, control.id);
  p = P.editarValor(p, CTX, control.id, true);
  for (const key of "Dev1/ai0") p = P.teclear(p, key);
  p = P.teclear(p, "Enter");
  assert.equal(CV.currentValue(p.g.nodos[0]), "Dev1/ai0");
  assert.equal(p.g.nodos[0].config.value, "", "the default the file saves is not changed");
});

test("after a Run a DAQ name indicator keeps the name it showed", () => {
  const p = place(P.inicial(), "daq-name-indicator", { type: DAQ_TASK }, { x: 100, y: 100 });
  const [indicator] = p.g.nodos;
  assert.equal(RV.isIndicator(indicator), true);
  assert.equal(CV.currentValue(RV.afterRun(p.g, { [indicator.id]: "myTask" }).graph.nodos[0]), "myTask");
});

// ——— The terminals ———

function panelTerminals(block, kind = "task", compact = false) {
  const type = daqName(kind);
  let g = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "DAQ Task Name", { type }).g;
  const id = g.nodos[0].id;
  if (compact) g = Gr.alternarIcono(g, id);
  return { g, id };
}

test("the terminals are purple, 38 x 38 with View As Icon and 32 x 16 without, as a VISA resource name's", () => {
  for (const [block, compact, size] of [["daq-name-control", false, [38, 38]], ["daq-name-indicator", false, [38, 38]], ["daq-name-control", true, [32, 16]], ["daq-name-indicator", true, [32, 16]]]) {
    const { g, id } = panelTerminals(block, "physical-channel", compact);
    const box = D.caja(g.nodos.find((n) => n.id === id), CTX);
    assert.deepEqual([box.ancho, box.alto], size, `${block}${compact ? " compact" : ""}`);
    const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
    assert.match(html, new RegExp(`stroke="${PURPLE}"`), "the colour of a name's wire, #7f007f");
    if (!compact) assert.match(html, />DAQ<\/text>/, "the picture says what it is");
  }
  assert.match(G.terminalVisa(true, false), />VISA<\/text>/, "a VISA resource name's picture keeps its caption");
});

test("View As Icon of the terminal of a DAQ name switches between 38 x 38 and 32 x 16", () => {
  const { g, id } = panelTerminals("daq-name-control");
  const root = "context.daq-name-control-terminal";
  const flipped = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, root, id, 0, 0), `${root}.view-as-icon`, CTX);
  assert.equal(flipped.g.nodos[0].vista.compacto, true);
  assert.equal(INV.resolver(`${root}.view-as-icon`).estado, "built");
});

// ——— Create ▸ Constant, Control, Indicator ———

test("Create on a DAQ name makes its constant, control and indicator of the same kind, wired", () => {
  for (const kind of DAQ_NAME_KINDS) {
    const type = daqName(kind);
    assert.deepEqual(blockForTerminal(type, "constant"), { tipo: "daq-name-constant", config: { type, value: "" } });
    assert.deepEqual(blockForTerminal(type, "control"), { tipo: "daq-name-control", config: { type } });
    assert.deepEqual(blockForTerminal(type, "indicator"), { tipo: "daq-name-indicator", config: { type } });
  }
  // From a control's terminal: an indicator of its kind; from the indicator's, a constant and a control, which is how the constant is reached.
  const type = daqName("physical-channel");
  const { g, id } = panelTerminals("daq-name-control", "physical-channel");
  const indicator = TC.createForTerminal(g, CTX, { nodo: id, puerto: "result", kind: "indicator" });
  assert.equal(indicator.wired, true);
  const shown = indicator.g.nodos.find((n) => n.id === indicator.id);
  assert.deepEqual([shown.tipo, shown.config.type, shown.label.text], ["daq-name-indicator", type, "DAQ Physical Channel"], "labelled by its kind, not as a task");
  assert.equal(Gr.tipos(indicator.g, CAT).cables.get(indicator.g.cables[0].id).roto, null, "the wire is healthy: the same kind");
  for (const [kind, block] of [["constant", "daq-name-constant"], ["control", "daq-name-control"]]) {
    const made = TC.createForTerminal(indicator.g, CTX, { nodo: indicator.id, puerto: "value", kind });
    assert.equal(made.wired, true, kind);
    const node = made.g.nodos.find((n) => n.id === made.id);
    assert.deepEqual([node.tipo, node.config.type], [block, type]);
    assert.equal(Gr.tipos(made.g, CAT).cables.get(made.g.cables.at(-1).id).roto, null);
  }
});

test("the DAQ name constant has its own menu, measured", () => {
  const root = "context.daq-name-constant";
  assert.deepEqual(labels(root), ["Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Make Type Def.", "Description and Tip...", "DAQ Palette", "Create", "Replace",
    "Data Operations", "Advanced", "Size To Text", "I/O Name Filtering...", "Select Item...", "Properties"], "reports/2026-11-06-daqmx-types.md, right-click (Channel, Terminal)");
  assert.deepEqual(labels(`${root}.create`).slice(0, 3), ["Constant", "Control", "Indicator"]);
  assert.deepEqual(INV.hijos(root).filter((e) => !esHueco(e)).map((e) => ultimo(e.id)), ["create"], "only Create is done");
  const constant = Gr.crearNodo(Gr.nuevo(), CAT, "daq-name-constant", 0, 0);
  assert.equal(D.menuDe(constant.g.nodos[0], null, constant.g), root);
  const menu = ED.abrirMenu({ ...ED.inicial(), g: constant.g }, root, constant.id, 0, 0);
  const made = ED.orden(menu, `${root}.create.indicator`, CTX);
  const [, indicator] = made.g.nodos;
  assert.deepEqual([indicator.tipo, indicator.config.type], ["daq-name-indicator", DAQ_TASK], "Create ▸ Indicator on the constant makes the task indicator, wired");
  assert.equal(made.g.cables.length, 1);
});

test("the terminals of a DAQ name have their menus", () => {
  for (const [root, tipo, expected] of [
    ["context.daq-name-control-terminal", "daq-name-control", ["Visible Items", "Find Control", "Make Type Def.", "Hide Control", "Change to Indicator", "Change to Array", "Change to Constant", "Description and Tip...", "DAQ Palette", "Create",
      "Data Operations", "Advanced", "View As Icon", "Select Item...", "Properties"]],
    ["context.daq-name-indicator-terminal", "daq-name-indicator", ["Visible Items", "Find Indicator", "Make Type Def.", "Hide Indicator", "Change to Control", "Change to Array", "Change to Constant", "Description and Tip...", "DAQ Palette", "Create",
      "Data Operations", "Advanced", "View As Icon", "Select Item...", "Properties"]],
  ]) {
    assert.deepEqual(labels(root), expected, `${root}: the rows of the VISA resource name's terminal, without its VISA ones (unverified)`);
    const { g, id } = panelTerminals(tipo);
    assert.equal(D.menuDe(g.nodos.find((n) => n.id === id), null, g), root);
    assert.deepEqual(INV.hijos(root).filter((e) => !esHueco(e)).map((e) => ultimo(e.id)).join(), `change-to-${tipo === "daq-name-control" ? "indicator" : "control"},create,data-operations,view-as-icon`);
  }
});

// ——— Change to Control / Indicator ———

test("Change to Indicator and Change to Control flip the terminal of a DAQ name and keep its wire", () => {
  const { g: withControl, id } = panelTerminals("daq-name-control", "physical-channel");
  const made = TC.createForTerminal(withControl, CTX, { nodo: id, puerto: "result", kind: "indicator" });
  let g = made.g;
  const toIndicator = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, "context.daq-name-control-terminal", id, 0, 0), "context.daq-name-control-terminal.change-to-indicator", CTX);
  assert.equal(toIndicator.g.nodos.find((n) => n.id === id).tipo, "daq-name-indicator");
  assert.deepEqual(toIndicator.g.nodos.find((n) => n.id === id).config.type, daqName("physical-channel"), "the kind stays");
  assert.equal(D.menuDe(toIndicator.g.nodos.find((n) => n.id === id), null, toIndicator.g), "context.daq-name-indicator-terminal", "and the menu follows");
  assert.equal(Gr.tipos(toIndicator.g, CAT).cables.get(toIndicator.g.cables[0].id).roto !== null, true, "an indicator facing an indicator is a broken wire, as in LabVIEW");
  g = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: toIndicator.g }, "context.daq-name-indicator-terminal", id, 0, 0), "context.daq-name-indicator-terminal.change-to-control", CTX).g;
  assert.equal(g.nodos.find((n) => n.id === id).tipo, "daq-name-control");
  assert.equal(Gr.tipos(g, CAT).cables.get(g.cables[0].id).roto, null, "back to a healthy wire");
});

test("Data Operations of a DAQ name makes its current value its default", () => {
  for (const [block, root] of [["daq-name-control", "context.daq-name-control-terminal"], ["daq-name-indicator", "context.daq-name-indicator-terminal"]]) {
    let { g, id } = panelTerminals(block, "terminal");
    g = CV.setCurrentValue(g, id, "/Dev1/PFI0");
    const made = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, root, id, 0, 0), `${root}.data-operations.make-current-value-default`, CTX);
    assert.equal(made.g.nodos[0].config.value, "/Dev1/PFI0", `${block}: the current value is the default`);
    const back = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: CV.setCurrentValue(made.g, id, "other") }, root, id, 0, 0), `${root}.data-operations.reinitialize-to-default-value`, CTX);
    assert.equal(CV.currentValue(back.g.nodos[0]), "/Dev1/PFI0", `${block}: reinitialized`);
  }
});

test("every greyed row of the DAQ name menus says what is missing", () => {
  const holes = INV.entradas.filter((e) => /^context\.daq-name-/.test(e.id) && esHueco(e));
  assert.ok(holes.length > 30);
  for (const hole of holes) {
    const { labview, solder } = INV.explicacion(hole);
    assert.ok(labview && /^Missing: /.test(solder), hole.id);
  }
});

// ——— Saving and opening ———

test("a VI with a DAQ name constant, control and indicator of every kind round-trips through the .sdg", () => {
  let g = Gr.nuevo();
  DAQ_NAME_KINDS.forEach((kind, row) => {
    const type = daqName(kind);
    g = Gr.crearEnPanel(g, CAT, "daq-name-control", 20, 20 + row * 60, "control", { type }).g;
    g = Gr.crearEnPanel(g, CAT, "daq-name-indicator", 300, 20 + row * 60, "indicator", { type }).g;
    const constant = Gr.crearNodo(g, CAT, "daq-name-constant", 10, 500 + row * 30);
    g = Gr.fijarConfig(constant.g, constant.id, { type, value: `v-${kind}` });
  });
  const text = aTexto(g, CAT);
  const reopened = leer(JSON.parse(text), CAT);
  assert.equal(aTexto(reopened, CAT), text, "saving what was opened gives the same file");
  assert.deepEqual(reopened.nodos.filter((n) => n.tipo === "daq-name-control").map((n) => n.config.type), DAQ_NAME_KINDS.map(daqName), "each keeps its kind");
  assert.deepEqual(reopened.nodos.filter((n) => n.tipo === "daq-name-indicator").map((n) => n.config.type), DAQ_NAME_KINDS.map(daqName));
  assert.equal(CV.currentValue(reopened.nodos[0]), "", "a control is empty by default");
  assert.ok(D.contenido({ ...ED.inicial(), g: reopened }, CTX, Gr.tipos(reopened, CAT)).includes("visa-texto"), "and the reopened constant draws");
});

// ——— Running ———

const run = async (vi, cat, values = {}) => {
  const compiled = compilar(vi.g, cat);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.ok(WebAssembly.validate(compiled.bytes), "the module is valid WebAssembly");
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, id]) => [id, name]));
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value])));
  return Object.fromEntries(Object.entries(written).map(([id, value]) => [byId[id], value]));
};

test("a task control gives the empty task at the top level and its indicator shows the task's name", async () => {
  const vi = buildOVI(CAT, (b) => {
    b.node("in", "daq-name-control", { type: DAQ_TASK });
    b.node("out", "daq-name-indicator", { type: DAQ_TASK });
    b.node("name", "daq-name-indicator", { type: daqName("physical-channel") });
    b.node("asText", "str-indicator", {});
    b.wire("in.result", "out.value");
    b.wire("in.result", "asText.value");
  });
  assert.deepEqual(await run(vi, CAT), { out: "", asText: "" }, "no name: the empty task, which shows no name (LabVIEW: [\"\", 0])");
  assert.deepEqual(await run(vi, CAT, { in: "myTask" }), { out: "myTask", asText: "myTask" }, "a name typed on the panel: the task of that name, no record yet");
});

test("the other kinds are strings: a physical channel control into an indicator and into a string", async () => {
  const type = daqName("physical-channel");
  const vi = buildOVI(CAT, (b) => {
    b.node("in", "daq-name-control", { type });
    b.node("out", "daq-name-indicator", { type });
    b.node("asText", "str-indicator", {});
    b.wire("in.result", "out.value");
    b.wire("in.result", "asText.value");
  });
  assert.deepEqual(await run(vi, CAT, { in: "Dev1/ai0:1" }), { out: "Dev1/ai0:1", asText: "Dev1/ai0:1" });
});

test("a subOVI with a task control and indicator passes the caller's task through unchanged", async () => {
  const passThrough = buildOVI(CAT, (b) => {
    b.node("task in", "daq-name-control", { type: DAQ_TASK });
    b.node("task out", "daq-name-indicator", { type: DAQ_TASK });
    b.wire("task in.result", "task out.value");
    b.connector(["task in"], ["task out"]);
  });
  const cat = callerCatalog({ "pass.sdg": passThrough });
  const caller = buildOVI(cat, (b) => {
    b.node("task", "daq-name-constant", { type: DAQ_TASK, value: "p1" });
    b.node("call", "subvi", { vi: "pass.sdg" });
    b.node("shown", "daq-name-indicator", { type: DAQ_TASK });
    b.wire("task.result", "call.daq-name-control_1");
    b.wire("call.daq-name-indicator_1", "shown.value");
  });
  assert.deepEqual(cat.puertos(caller.g.nodos.find((n) => n.id === caller.id.call)).in.map((port) => port.type), [DAQ_TASK], "the connector's terminal is a task");
  assert.deepEqual(await run(caller, cat), { shown: "p1" }, "the name travelled through the subOVI's control and indicator");
  const unwired = buildOVI(cat, (b) => {
    b.node("call", "subvi", { vi: "pass.sdg" });
    b.node("shown", "daq-name-indicator", { type: DAQ_TASK });
    b.wire("call.daq-name-indicator_1", "shown.value");
  });
  assert.deepEqual(await run(unwired, cat), { shown: "" }, "an unwired input takes the control's default: the empty task");
});

// Finding #5 of the plugin's second stage (docs/design/daq-plugin-findings.md): a Case's output tunnel refused a DAQ
// name, and a VISA resource name, because it took only Booleans, strings, paths, numbers and clusters.
test("a DAQ task and a VISA resource name pass through a Case's output tunnel", async () => {
  const vi = buildOVI(CAT, (b) => {
    b.node("pick", "bool-control", {});
    b.loop("case", "case-structure");
    b.node("task", "daq-name-constant", { type: DAQ_TASK, value: "p1" }, "case");
    b.node("resource", "visa-resource-constant", { value: "ASRL1::INSTR" }, "case");
    b.node("task out", "daq-name-indicator", { type: DAQ_TASK });
    b.node("resource out", "visa-indicator", {});
    b.wire("task.result", "task out.value");
    b.wire("resource.result", "resource out.value");
  });
  const selector = vi.g.nodos.find((node) => node.tipo === "case-selector");
  vi.g = Gr.conectarCruzando(vi.g, CAT, { nodo: vi.id.pick, puerto: "result", dir: "out" }, { nodo: selector.id, puerto: "selector", dir: "in" }).g;
  const tunnels = vi.g.nodos.filter((node) => node.tipo === "case-tunnel-out");
  const types = Gr.tipos(vi.g, CAT);
  assert.deepEqual(tunnels.map((tunnel) => types.salidas.get(`${tunnel.id}.y`)), [DAQ_TASK, "visa-resource"]);
  assert.ok([...types.cables.values()].every((wire) => !wire.roto), "no wire is broken");
  // The other frame leaves them unwired: Use Default If Unwired gives the empty task and the empty resource name.
  for (const tunnel of tunnels) vi.g = Gr.fijarConfig(vi.g, tunnel.id, { "use-default": true });
  const shown = [await run(vi, CAT, { pick: false }), await run(vi, CAT, { pick: true })];
  assert.deepEqual(shown.map((values) => [values["task out"], values["resource out"]]).sort(), [["", ""], ["p1", "ASRL1::INSTR"]]);
});

test("typing a name into a DAQ name constant keeps it as its text, as a VISA resource name's", () => {
  // Found building an acquisition by hand (daq-plugin-findings.md S10-#1): the text was lost on Enter.
  const placed = Gr.crearNodo(Gr.nuevo(), CAT, "daq-name-constant", 0, 0);
  const g = Gr.fijarConfig(placed.g, placed.id, { type: daqName("physical-channel"), value: "" });
  let d = ED.editar({ ...ED.inicial(), g }, CTX, placed.id);
  for (const key of "Dev1/ai0") d = ED.teclear(d, key);
  const confirmed = ED.confirmar(d, CTX);
  const constant = confirmed.g.nodos.find((n) => n.id === placed.id);
  assert.equal(constant.config.value, "Dev1/ai0");
  assert.deepEqual(constant.config.type, daqName("physical-channel"), "it keeps its kind");
  assert.equal(confirmed.edicion, null);
});
