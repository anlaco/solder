// The debugging tools of the editor (DT-047, labview-captures/debugging/REPORT.md): the toolbar
// buttons, Highlight Execution, probes, breakpoints, the Debug Window, the Error list and Allow
// debugging. Pure state and HTML: no browser needed. What the worker does while the VI runs is in
// debug-controller.test.mjs and test/end-to-end/debugging-worker.test.mjs.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as DS from "../../editor/src/debugging/debug-state.mjs";
import * as DV from "../../editor/src/debugging/debug-view.mjs";
import * as E from "../../editor/src/window/window-state.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as EL from "../../editor/src/debugging/error-list.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as VP from "../../editor/src/window/vi-properties.mjs";
import { EDIT_COMMANDS } from "../../editor/src/window/edit-menu.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { ventana } from "../../editor/src/window/window-view.mjs";
import { CAT, INV, buildAdder } from "../helpers.mjs";

const CONTEXT = D.contexto(CAT, D.glifosPorBloque(INV));

/** 2 + 3 -> Negate -> indicator, as in debug-controller.test.mjs. */
function chain() {
  let g = Gr.nuevo();
  const id = {};
  const put = (name, block, config, x, y) => {
    const created = Gr.crearNodo(g, CAT, block, x, y);
    g = config ? Gr.fijarConfig(created.g, created.id, config) : created.g;
    id[name] = created.id;
  };
  put("two", "const", { value: 2 }, 0, 0);
  put("three", "const", { value: 3 }, 0, 60);
  put("add", "add", null, 100, 30);
  put("negate", "negate", null, 200, 30);
  put("sum", "indicator", null, 300, 30);
  const wires = {};
  for (const [name, from, fromPort, to, toPort] of [["a", "two", "result", "add", "a"], ["b", "three", "result", "add", "b"], ["c", "add", "result", "negate", "x"], ["d", "negate", "result", "sum", "value"]]) {
    const wired = Gr.conectar(g, CAT, { nodo: id[from], puerto: fromPort, dir: "out" }, { nodo: id[to], puerto: toPort, dir: "in" });
    g = wired.g;
    wires[name] = g.cables.at(-1).id;
  }
  return { g, id, wires, resolved: Gr.tipos(g, CAT) };
}

const phaseInfo = (phase, extra = {}) => ({ phase, broken: false, allowDebugging: true, highlight: { on: false, speed: "medium" }, retain: false, viName: "Untitled 1", nodeName: "Wait (ms)", nodeIsSubVI: false, container: "loop", ...extra });

test("the debugging buttons are enabled and named as LabVIEW does in edit mode while running and paused", () => {
  const edit = DS.toolbarState(phaseInfo("edit"));
  assert.equal(edit.run.tooltip, "Run");
  assert.deepEqual([edit["step-into"].enabled, edit["step-over"].enabled, edit["step-out"].enabled], [true, true, false], "Step Out is greyed in edit mode (10b)");
  assert.equal(edit["step-into"].tooltip, "Start Single Stepping");
  assert.equal(edit["step-out"].tooltip, "Step Out");
  assert.equal(edit.pause.tooltip, "Pause");
  assert.equal(edit["retain-wire-values"].tooltip, "Retain Wire Values");
  assert.equal(edit["highlight-execution"].tooltip, "Highlight Execution: Medium");
  assert.equal(edit["abort-execution"].enabled, false);

  const running = DS.toolbarState(phaseInfo("running"));
  assert.equal(running.run.glyph, "run-en-marcha");
  assert.equal(running.run.tooltip, "Running");
  assert.equal(running["abort-execution"].tooltip, 'Abort execution of "Untitled 1"');
  assert.deepEqual([running["step-into"].enabled, running["step-over"].enabled, running["step-out"].enabled], [false, false, false]);

  const broken = DS.toolbarState(phaseInfo("edit", { broken: true }));
  assert.equal(broken.run.tooltip, "List Errors");
  assert.equal(broken.run.glyph, "run-roto");
  assert.equal(broken["step-into"].enabled, false);
  assert.equal(broken.pause.enabled, true, "Pause stays black on a broken VI (91c)");

  // The window draws them: greyed, with their tooltip and glyph.
  const html = ventana(INV, "block-diagram", E.inicial(), { toolbar: edit });
  assert.match(html, /class="boton desactivado" data-id="window\.block-diagram\.toolbar\.step-out" data-tip="Step Out"/);
  assert.match(html, /data-id="window\.block-diagram\.toolbar\.highlight-execution" data-tip="Highlight Execution: Medium"/);
  assert.ok(!esHueco(INV.resolver("window.block-diagram.toolbar.step-out")));
});

test("Highlight Execution is a toggle with four speeds and Medium by default", () => {
  let state = DS.initial();
  assert.deepEqual(state.highlight, { on: false, speed: "medium" });
  assert.equal(DS.toggleHighlight(state).highlight.on, true);
  assert.equal(DS.toggleHighlight(DS.toggleHighlight(state)).highlight.on, false);
  assert.equal(DS.SPEED_MENU_HOLD_MS, 1500);
  assert.deepEqual(INV.hijos("window.block-diagram.toolbar.highlight-execution").map((e) => e.etiqueta), ["Slow", "Medium", "Fast", "Very Fast"]);
  state = DS.setHighlightSpeed(state, "fast");
  assert.deepEqual(state.highlight, { on: true, speed: "fast" }, "choosing a speed leaves the bulb on");
  assert.equal(DS.toolbarState(phaseInfo("edit", { highlight: state.highlight }))["highlight-execution"].tooltip, "Highlight Execution: Fast");
  assert.equal(DS.toolbarState(phaseInfo("edit", { highlight: state.highlight }))["highlight-execution"].glyph, "highlight-execution-on");
  assert.equal(DS.setHighlightSpeed(state, "warp"), state);
  // The menu hangs from the button and checks the current speed.
  const open = E.abrirMenuBarra(E.inicial(), INV, "window.block-diagram.toolbar.highlight-execution", { x: 148, y: 70 });
  const html = D.menuContextual(INV, { raiz: open.menuBarra.id, x: 148, y: 70 }, new Set(["window.block-diagram.toolbar.highlight-execution.fast"]));
  assert.match(html, /item-menu marcado" data-id="window\.block-diagram\.toolbar\.highlight-execution\.fast"/);
  assert.match(ventana(INV, "block-diagram", E.inicial(), { toolbar: DS.toolbarState(phaseInfo("edit", { highlight: state.highlight })) }), /class="glifo"><svg[^>]*>(?:(?!<\/span>).)*#f3d545/s, "the lit bulb is yellow");
});

test("Retain Wire Values keeps the last values of the wires for the probes of the next Run", () => {
  const { g, id, wires } = chain();
  const reported = { node: id.add, port: "result", value: 5, at: 1000 };
  const run = (retain) => {
    let state = { ...DS.initial(), retain };
    state = DS.startRun(state, g, 0);
    state = DS.applyDebugEvent(state, { values: [reported] }, g, 0);
    return DS.endRun(state, g);
  };
  assert.equal(DS.wireValue(run(true), g, wires.c)?.value, 5, "retained: a probe added now shows the last value (the 12 of 59)");
  assert.equal(DS.wireValue(run(false), g, wires.c), undefined);
  const withProbe = DS.addProbe({ ...DS.initial(), retain: false }, wires.c);
  let state = DS.startRun(withProbe, g, 0);
  state = DS.applyDebugEvent(state, { values: [reported] }, g, 0);
  assert.equal(DS.wireValue(DS.endRun(state, g), g, wires.c)?.value, 5, "the value a probe shows outlives the Run");
  const html = DV.overlay(DS.endRun(state, g), g, CONTEXT, Gr.tipos(g, CAT), { now: 0 });
  assert.match(html, />5<\/div>/, "the tag next to the probe label shows it");
  assert.equal(DS.toolbarState(phaseInfo("edit", { retain: true }))["retain-wire-values"].glyph, "retain-wire-values-on");
  assert.equal(DS.toggleRetain(DS.initial()).retain, true);
});

test("Pause becomes Continue when the VI stops and the step buttons follow", () => {
  const paused = DS.toolbarState(phaseInfo("paused"));
  assert.equal(paused.pause.tooltip, "Continue");
  assert.equal(paused.pause.glyph, "pause-continue");
  assert.equal(paused["step-into"].tooltip, "Step over Wait (ms)");
  assert.equal(paused["step-over"].tooltip, "Step over Wait (ms)");
  assert.equal(paused["step-out"].tooltip, "Finish Iteration");
  assert.deepEqual([paused["step-into"].enabled, paused["step-over"].enabled, paused["step-out"].enabled, paused["abort-execution"].enabled], [true, true, true, true]);
  assert.equal(DS.toolbarState(phaseInfo("paused", { container: null }))["step-out"].tooltip, "Step out of Untitled 1");
  const inSubVI = DS.toolbarState(phaseInfo("paused", { nodeIsSubVI: true, nodeName: "adder" }));
  assert.equal(inSubVI["step-into"].enabled, false, "stepping into a subVI is not done yet");
  assert.match(inSubVI["step-into"].tooltip, /not stepped into yet/);
  assert.ok(!esHueco(INV.resolver("window.front-panel.toolbar.pause")), "the panel has Pause too");
  // The events of the worker move the state in and out of the stop.
  const { g, id } = chain();
  let state = DS.applyDebugEvent(DS.initial(), { paused: { node: id.add, kind: "before", container: null, name: "Add" } }, g, 0);
  assert.equal(DS.phaseOf({ running: true, run: state.run }), "paused");
  state = DS.applyDebugEvent(state, { resumed: true }, g, 0);
  assert.equal(DS.phaseOf({ running: true, run: state.run }), "running");
});

test("with Allow debugging off the debugging buttons are greyed with the reason", () => {
  const off = DS.toolbarState(phaseInfo("edit", { allowDebugging: false }));
  for (const key of ["highlight-execution", "retain-wire-values", "step-into", "step-over", "step-out", "pause"]) {
    assert.equal(off[key].enabled, false, key);
    assert.match(off[key].tooltip, /Allow debugging is off/, key);
  }
  assert.equal(off.run.enabled, true);
});

test("a probe is added to a wire, numbered together with the breakpoints, and opens the Debug Window", () => {
  const { wires, id } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addProbe(state, wires.c);
  state = DS.addProbe(state, wires.d);
  assert.deepEqual(state.items.map((item) => [item.number, item.kind]), [[1, "breakpoint"], [2, "probe"], [3, "probe"]], "the numbering is shared (71d: the third item is 3)");
  assert.equal(state.debugWindow.open, true);
  assert.deepEqual(state.debugWindow.selected, [3], "the new probe is the selected row");
  const { g, resolved } = chain();
  const html = DV.overlay(state, g, CONTEXT, resolved, { now: 0 });
  assert.match(html, /class="dep-sonda" data-sonda="2" style="left:[\d.]+px;top:[\d.]+px;width:21px;height:17px">2</, "the label is 21 by 17");
  assert.ok(!INV.entrada("context.wire.add-probe").prueba?.includes("todo"));
  assert.equal(INV.entrada("context.wire.add-probe").estado, "built");
});

test("the Custom Probe submenu names the type of the wire and only Generic Probe is done", () => {
  const { g, wires, resolved } = chain();
  const variants = DV.menuVariants(DS.initial(), g, resolved, { raiz: ED.WIRE_MENU_ROOT, nodo: wires.c });
  assert.equal(variants.rotulos.get("context.wire.custom-probe.conditional"), "Conditional - DBL");
  assert.equal(variants.rotulos.get("context.wire.custom-probe.history"), "History - DBL");
  assert.deepEqual(INV.hijos("context.wire.custom-probe").map((e) => `${e.separado ? "| " : ""}${e.etiqueta}:${e.estado}`), [
    "Probe that Toggles Execution Highlighting:todo", "Conditional:todo", "History:todo", "Generic Probe:built", "Controls:todo", "| New Custom Probe...:todo",
  ]);
  const html = D.menuContextual(INV, { raiz: "context.wire", x: 0, y: 0, abierto: "context.wire.custom-probe" }, new Set(), (text) => text.length * 7, variants);
  assert.match(html, /Conditional - DBL/);
});

test("a breakpoint is added to a node or a wire and its menu offers Remove and Disable", () => {
  const { g, id, wires, resolved } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addBreakpoint(state, { wire: wires.d });
  assert.equal(DS.addBreakpoint(state, { node: id.add }), state, "one breakpoint per object");
  const menu = { raiz: "context.function", nodo: id.add };
  const variants = DV.menuVariants(state, g, resolved, menu);
  assert.equal(variants.rotulos.get("context.function.add-breakpoint"), "Remove Breakpoint");
  assert.equal(variants.rotulos.get("context.function.disable-breakpoint"), "Disable Breakpoint");
  const shown = (variantsOf, root) => D.menuContextual(INV, { raiz: root, x: 0, y: 0 }, new Set(), (text) => text.length * 7, variantsOf);
  assert.match(shown(variants, "context.function"), /Remove Breakpoint[\s\S]*Disable Breakpoint/);
  assert.ok(!/Disable Breakpoint/.test(shown(DV.menuVariants(DS.initial(), g, resolved, menu), "context.function")), "no breakpoint, no Disable row");
  state = DS.toggleBreakpointEnabled(state, { node: id.add });
  assert.equal(DV.menuVariants(state, g, resolved, menu).rotulos.get("context.function.disable-breakpoint"), "Enable Breakpoint");
  const config = DS.controllerConfig(state, g);
  assert.deepEqual(config.nodeBreakpoints, { [id.add]: false });
  assert.deepEqual(config.wireBreakpoints, [{ wire: wires.d, from: id.negate, enabled: true }]);
  assert.equal(config.active, true);
  state = DS.removeBreakpoint(state, { node: id.add });
  assert.equal(DS.breakpointOn(state, { node: id.add }), undefined);
  // Probes and breakpoints leave with the object they were on.
  const without = DS.pruneToGraph(state, { ...g, cables: g.cables.filter((wire) => wire.id !== wires.d) });
  assert.equal(without.items.length, 0);
  // The structures' breakpoints are holes with their reason; the nodes' are done.
  assert.equal(INV.entrada("context.while-loop.add-breakpoint").estado, "todo");
  assert.equal(INV.entrada("context.function.add-breakpoint").estado, "built");
});

test("the breakpoints are drawn on nodes and wires as LabVIEW does", () => {
  const { g, id, wires, resolved } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addBreakpoint(state, { wire: wires.d });
  const html = DV.overlay(state, g, CONTEXT, resolved, { now: 0 });
  const box = D.caja(g.nodos.find((node) => node.id === id.add), CONTEXT);
  assert.match(html, new RegExp(`class="dep-bp-nodo" data-breakpoint="1" style="left:${box.x - 3}px;top:${box.y - 3}px;width:${box.ancho + 6}px;height:${box.alto + 6}px"`), "a 3 px frame outside the node (73b)");
  assert.match(html, /class="dep-bp-cable" data-breakpoint="2" style="[^"]*width:19px;height:19px">2</, "a 19 px disc with its number (71d)");
  const disabled = DS.toggleBreakpointEnabled(state, { node: id.add });
  assert.match(DV.overlay(disabled, g, CONTEXT, resolved, { now: 0 }), /class="dep-bp-nodo apagado"/);
  const stopped = DV.overlay(state, g, CONTEXT, resolved, { now: 0, pausedAt: { node: id.add, kind: "before" } });
  assert.match(stopped, new RegExp(`class="dep-detenido" data-detenido="${id.add}"`), "the stopped node is drawn inverted");
});

test("the Debug Window lists the probes and breakpoints of the VI with their values", () => {
  const { g, id, wires } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addProbe(state, wires.c);
  state = DS.applyDebugEvent(state, { values: [{ node: id.add, port: "result", value: 5, at: new Date(2026, 9, 9, 8, 54, 32, 907).getTime() }] }, g, 0);
  const html = DV.debugWindow(INV, state, g, { viName: "Untitled 1", separator: ",", position: { x: 10, y: 20 } });
  assert.match(html, /width:682px;height:338px/, "the window measures 682 by 338 (55)");
  for (const text of ["Probes and Breakpoints", "Value", "Last Update", "Untitled 1", "[1] Breakpoint", "[2] Probe", "Probe Display"]) assert.ok(html.includes(text), text);
  assert.match(html, /dw-valor"[^>]*>5</);
  assert.match(html, />8:54:32,907</, "h:mm:ss,mmm with the decimal separator of the system");
  assert.match(html, /dw-fila par/);
  assert.match(html, /dw-fila impar/, "zebra stripes");
  assert.match(html, /dw-fila (par|impar) elegida" data-fila="2"/, "the selected row");
  assert.match(html, /desactivado" data-id="window\.debug-window\.toolbar\.enable-disable"/, "Enable/Disable is greyed with a probe selected");
  assert.equal(DS.formatValue(true), "T");
  assert.equal(DS.formatValue(1.5, ","), "1,5");
  state = DS.removeItems(state, [2]);
  assert.deepEqual(state.items.map((item) => item.number), [1]);
  state = DS.selectItem(state, 1);
  assert.equal(DS.toggleSelectedEnabled(state).items[0].enabled, false);
});

test("closing the Debug Window removes the probes and asks first", () => {
  const { id, wires } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addProbe(state, wires.c);
  const dialog = DV.closeProbesDialog(INV);
  assert.match(dialog, /This operation will close all probes in VIs that are open outside of projects\. Do you wish to continue\?/);
  assert.match(dialog, /Yes/);
  const closed = DS.closeDebugWindow(state);
  assert.equal(closed.debugWindow.open, false);
  assert.deepEqual(closed.items.map((item) => item.kind), ["breakpoint"]);
  assert.ok(!esHueco(INV.resolver("window.debug-window.close-dialog.yes")));
});

test("the Debug Options menu checks Keep Window on Top and Show Values on Wires", () => {
  let state = DS.initial();
  const root = "window.debug-window.toolbar.debug-options";
  assert.deepEqual(INV.hijos(root).map((e) => e.etiqueta), ["Hide Probe Display", "Keep Window on Top", "Show Values on Wires", "Wrap Text"]);
  assert.deepEqual([...DV.debugWindowMenuMarks(state)].sort(), [`${root}.keep-window-on-top`, `${root}.show-values-on-wires`]);
  state = DS.toggleOption(state, "show-values-on-wires");
  assert.equal(state.debugWindow.showValues, false);
  const { g, wires, resolved } = chain();
  const probed = DS.toggleOption(DS.applyDebugEvent(DS.addProbe(DS.initial(), wires.c), { values: [{ node: chain().id.add, port: "result", value: 5, at: 0 }] }, g, 0), "show-values-on-wires");
  assert.ok(!/dep-etiqueta/.test(DV.overlay(probed, g, CONTEXT, resolved, { now: 0 })), "without Show Values on Wires there are no tags");
  state = DS.toggleOption(state, "hide-probe-display");
  assert.match(D.menuContextual(INV, { raiz: root, x: 0, y: 0 }, DV.debugWindowMenuMarks(state), (text) => text.length * 7, DV.debugWindowMenuVariants(state)), /Show Probe Display/);
  assert.ok(!/Probe Display<\/div>|dw-visor-panel/.test(DV.debugWindow(INV, state, g, { viName: "x", position: { x: 0, y: 0 } })), "hidden");
});

test("the Error list lists the errors of a VI and Show Error frames the object", () => {
  // An Add with nothing wired and a wire that carries a string into a number.
  let g = Gr.nuevo();
  const created = Gr.crearNodo(g, CAT, "wait-ms", 100, 50);
  g = created.g;
  const rows = EL.collect({ graph: g, catalog: CAT, resolved: Gr.tipos(g, CAT), compileErrors: [], inventory: INV });
  assert.equal(rows[0].text, "Wait (ms): Contains unwired or bad terminal", "the row of 72 and 92");
  const built = buildAdder();
  const adder = built.g;
  const broken = Gr.crearNodo(adder, CAT, "array-size", 400, 200);
  const rowsOfBroken = EL.collect({ graph: broken.g, catalog: CAT, resolved: Gr.tipos(broken.g, CAT), compileErrors: [], inventory: INV });
  assert.equal(rowsOfBroken.length, 1);
  assert.equal(rowsOfBroken[0].text, "Array Size: Contains unwired or bad terminal");
  assert.deepEqual(rowsOfBroken[0].target, { node: broken.id });
  const html = DV.errorListWindow(INV, { rows: rowsOfBroken, state: { ...EL.initial(), selected: rowsOfBroken[0].id }, viName: "Untitled 2", position: { x: 0, y: 0 } });
  assert.match(html, /width:661px;height:412px/, "the window measures 661 by 412 (92)");
  for (const text of ["Error list", "Items with errors", "Untitled 2", "1 errors and warnings", "Show Warnings", "Block Diagram Errors", "Array Size: Contains unwired or bad terminal", "Details", "Close", "Show Error", "Help"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes(EL.UNWIRED_DETAILS), "the details of the selected row");
  assert.match(html, /el-casilla hueco/, "Show Warnings is greyed: warnings are not computed");
  // A broken wire is listed with its reason, and Show Error frames the object 1 px outside.
  const brokenWire = Gr.conectar(broken.g, CAT, { nodo: built.ids.x, puerto: "result", dir: "out" }, { nodo: broken.id, puerto: "array", dir: "in" }).g;
  const wireRows = EL.collect({ graph: brokenWire, catalog: CAT, resolved: Gr.tipos(brokenWire, CAT), compileErrors: [], inventory: INV });
  assert.ok(wireRows.every((row) => row.target), "every row points at an object");
  const frame = DV.overlay(DS.initial(), broken.g, CONTEXT, Gr.tipos(broken.g, CAT), { now: 0, errorFocus: { node: broken.id } });
  assert.match(frame, new RegExp(`class="dep-marquesina" data-error-focus="${broken.id}"`));
  assert.ok(!esHueco(INV.resolver("window.error-list.show-error")));
  assert.equal(INV.entrada("window.error-list.show-warnings").estado, "todo");
});

test("View opens the Debug Window and the Error list", () => {
  const view = "window.block-diagram.menu.view";
  assert.ok(!esHueco(INV.resolver(view)));
  const debugRow = INV.entrada(`${view}.debug-window`);
  const errorRow = INV.entrada(`${view}.error-list`);
  assert.deepEqual([debugRow.atajo, errorRow.atajo], ["Ctrl+D", "Ctrl+L"]);
  assert.deepEqual([debugRow.estado, errorRow.estado], ["built", "built"]);
  assert.equal(E.abrirMenuBarra(E.inicial(), INV, view, { x: 0, y: 0 }).menuBarra.id, view);
  assert.equal(INV.hijos(view).length, 23, "the rows of 65-view-menu.png");
  const opened = DS.openDebugWindow(DS.initial());
  assert.equal(opened.debugWindow.open, true);
});

test("Highlight Execution dims the diagram and lights what ran with its wires and tags", () => {
  const { g, id, wires, resolved } = chain();
  let state = { ...DS.initial(), highlight: { on: true, speed: "medium" } };
  state = DS.startRun(state, g, 0);
  assert.equal(DV.canvasView(state, g, true).dim, true);
  assert.equal(DV.canvasView(state, g, false).dim, false, "after the run everything returns to normal");
  state = DS.applyDebugEvent(state, { ran: id.two, pace: 270, values: [{ node: id.two, port: "result", value: 2, at: 1 }] }, g, 1000);
  const view = DV.canvasView(state, g, true);
  assert.ok(view.litNodes.has(id.two) && !view.litNodes.has(id.add));
  assert.ok(view.litWires.has(wires.a));
  const html = D.contenido({ ...ED.inicial(), g, debug: view }, CONTEXT, resolved);
  assert.match(html, new RegExp(`class="nodo[a-z ]* dep-encendido" data-nodo="${id.two}"`));
  assert.match(html, new RegExp(`class="cable dep-encendido" data-cable="${wires.a}"`));
  assert.match(html, new RegExp(`class="nodo" data-nodo="${id.add}"`), "what has not run stays dim");
  const overlay = DV.overlay(state, g, CONTEXT, resolved, { now: 1100 });
  assert.match(overlay, /class="dep-banda"[^>]*stroke:#a3a3d6;stroke-width:5/, "a 5 px band in the numeric color");
  assert.match(overlay, /animation-duration:270ms;animation-delay:-100ms/, "a repaint goes on from where the band was");
  assert.match(overlay, /class="dep-etiqueta dep-aparece"[^>]*height:17px[^>]*animation-delay:170ms[^>]*>2</, "the 17 px tag appears when the band arrives");
  assert.match(ventana(INV, "block-diagram", E.inicial(), { resaltando: true }), /class="lienzo lienzo-block-diagram resaltando"/);
  // A node that runs again starts a new iteration: everything dims and the tags go.
  const again = DS.applyDebugEvent(state, { ran: id.two, pace: 270, values: [] }, g, 2000);
  assert.deepEqual(again.run.lit, [id.two]);
  assert.deepEqual(Object.keys(again.run.litWires), [wires.a]);
  assert.equal(DS.initial().highlight.speed, "medium");
});

test("VI Properties writes Allow debugging into the VI", () => {
  const { g } = buildAdder();
  let dialog = VP.open(g);
  assert.equal(dialog.allowDebugging, true, "on by default, as in LabVIEW");
  assert.equal(VP.apply(g, dialog).vi, undefined, "the default is not stored");
  dialog = VP.toggleAllowDebugging(dialog);
  const written = VP.apply(g, dialog);
  assert.equal(written.vi.execution["allow-debugging"], false);
  assert.equal(VP.open(written).allowDebugging, false);
  assert.equal(VP.apply(written, VP.toggleAllowDebugging(VP.open(written))).vi, undefined);
  assert.ok(!esHueco(INV.resolver(VP.ALLOW_DEBUGGING_ID)));
});

test("Remove Breakpoints from Hierarchy takes away every breakpoint of the VI", () => {
  const { id, wires } = chain();
  let state = DS.addBreakpoint(DS.initial(), { node: id.add });
  state = DS.addBreakpoint(state, { wire: wires.d });
  state = DS.addProbe(state, wires.c);
  const numbers = DS.breakpointsOf(state).map((item) => item.number);
  const cleared = DS.removeItems(state, numbers);
  assert.deepEqual(cleared.items.map((item) => item.kind), ["probe"], "probes stay");
  assert.ok(EDIT_COMMANDS.includes("remove-breakpoints-from-hierarchy"));
  assert.ok(!esHueco(INV.resolver("window.block-diagram.menu.edit.remove-breakpoints-from-hierarchy")));
});
