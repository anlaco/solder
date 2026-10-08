// The editor's subVI workflow from end to end (DT-045): a VI is given a
// connector and saved, a caller places it with Select a VI..., both are written
// to disk with relative paths, read back through the hierarchy, compiled and
// run in the run worker; the state of a non-reentrant subVI survives between
// Runs, and a caller sees the new connector when its subVI is saved.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as CP from "../../editor/src/front-panel/connector-pane.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as Paths from "../../editor/src/common/vi-paths.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SN from "../../editor/src/block-diagram/subvi-nodes.mjs";
import * as VP from "../../editor/src/window/vi-properties.mjs";
import { assignPanelElement } from "../../core/model/connector.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { CAT, INV, buildAdder } from "../helpers.mjs";

// The run worker listens to the global `onmessage` and answers with `postMessage`, as in a browser.
const answers = [];
globalThis.onmessage = null;
globalThis.postMessage = (message) => answers.push(message);
await import("../../editor/src/window/run-worker.mjs");

/** Runs a compiled VI in the worker, as the window does, and returns what the indicators received. */
async function runInWorker(key, compiled, values = {}) {
  answers.length = 0;
  await globalThis.onmessage({ data: { orden: "run", clave: key, compilado: { bytes: compiled.bytes, controles: compiled.controles, indicadores: compiled.indicadores, clumps: compiled.clumps, planes: compiled.planes, automaticos: compiled.automaticos, disposicionError: compiled.disposicionError }, valores: values, separador: "." } });
  const last = answers.at(-1);
  assert.ok(last.fin && !last.error, JSON.stringify(last));
  return Object.assign({}, ...answers.map((a) => a.escritos ?? {}));
}

/** The adder given a connector in the editor: x in cell 0, y in cell 2 (Required) and sum in cell 9. */
function adderVI() {
  const { g, ids } = buildAdder();
  let panel = P.inicial(g);
  for (const [id, cell] of [[ids.x, 0], [ids.y, 2], [ids.sum, 9]]) panel = CP.assignClicked(CP.selectCell(panel, cell), CAT, id);
  const withY = { ...panel.g, nodos: panel.g.nodos.map((n) => (n.id === ids.x ? { ...n, config: { ...n.config, value: 5 } } : n)) };
  return { g: withY, ids };
}

/** A functional global: a While Loop that runs once with an uninitialized shift register that counts its calls. */
function counterVI() {
  let g = Gr.nuevo();
  const loop = Gr.crearEstructura(g, CAT, "while-loop", 0, 0, 200, 150);
  g = loop.g;
  const stop = g.nodos.find((n) => n.dentro === loop.id && n.tipo === "loop-condition");
  const register = Gr.crearRegistro(g, CAT, loop.id, 0);
  g = register.g;
  const inside = (block, config) => {
    const created = Gr.crearNodo(g, CAT, block, 0, 0);
    g = Gr.meter(Gr.fijarConfig(created.g, created.id, config ?? {}), CAT, [created.id], loop.id);
    return created.id;
  };
  const one = inside("const", { value: 1, type: "i32" });
  const plus = inside("add");
  const yes = inside("bool-const", { value: true });
  const count = Gr.crearEnPanel(g, CAT, "indicator", 300, 40, "count", { type: "i32" });
  g = count.g;
  const wire = (from, fromPort, to, toPort) => {
    const wired = Gr.conectarCruzando(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
    assert.ok(!wired.motivo, wired.motivo);
    g = wired.g;
  };
  wire(register.izquierdo, "value", plus, "a");
  wire(one, "result", plus, "b");
  wire(plus, "result", register.derecho, "value");
  wire(yes, "result", stop.id, "stop");
  wire(register.derecho, "result", count.id, "value");
  return { g: assignPanelElement(g, CAT, count.id, 8), count: count.id };
}

/** Writes a VI to `file` as the main process does: with its subVI paths rebased to where it lives. */
async function save(file, g, catalog, fromKey) {
  await mkdir(path.dirname(file), { recursive: true });
  const text = Paths.rebaseText(Q.aTexto(g, catalog), fromKey, Paths.pathKey(file));
  await writeFile(file, text);
  return text;
}

/** What the page does when it opens a VI: the main process reads the files and the page builds the hierarchy. */
async function open(file) {
  const key = Paths.pathKey(file);
  const rootText = await readFile(file, "utf8");
  const { texts, missing } = await Paths.readHierarchyTexts(key, rootText, (calleeKey) => readFile(calleeKey, "utf8").catch(() => null));
  return { key, rootText, texts, missing, ...buildHierarchy({ rootKey: key, rootText, texts, baseCatalog: CAT, readVI: Q.leer }) };
}

test("a subVI built in the editor is saved, placed in a caller, run, and its state survives between Runs", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "solder-subvi-"));
  try {
    const adderFile = path.join(folder, "lib", "add2.qvi");
    const counterFile = path.join(folder, "lib", "counter.qvi");
    const callerFile = path.join(folder, "main.qvi");
    const adder = adderVI();
    await save(adderFile, adder.g, CAT, Paths.untitledKey(1));
    await save(counterFile, counterVI().g, CAT, Paths.untitledKey(2));

    // The caller is untitled when the subVIs are placed: it stores absolute paths until it is saved.
    const untitled = Paths.untitledKey(3);
    let caller = Gr.nuevo();
    const placeSubVI = (file, x, y) => {
      const view = buildHierarchy({ rootKey: untitled, rootGraph: caller, texts: placed, baseCatalog: CAT, readVI: Q.leer });
      const ctx = D.contexto(view.catalog, D.glifosPorBloque(INV));
      let d = ED.coger({ ...ED.inicial(), g: caller }, "subvi", SN.subVIConfig(Paths.storedPathFor(untitled, Paths.pathKey(file))));
      d = ED.pulsar(ED.moverA(d, ctx, { x: x + 4, y: y + 4 }), ctx, { tipo: "fondo" }, { x: x + 4, y: y + 4 });
      caller = d.g;
      return d.seleccion[0];
    };
    const placed = { [Paths.pathKey(adderFile)]: await readFile(adderFile, "utf8"), [Paths.pathKey(counterFile)]: await readFile(counterFile, "utf8") };
    const addNode = placeSubVI(adderFile, 100, 60);
    const counterNode = placeSubVI(counterFile, 100, 200);
    assert.ok(caller.nodos.every((n) => Paths.isAbsolutePath(n.config.vi)), "an untitled caller stores absolute paths");

    // Wire y of the adder to a constant and its sum and the counter to indicators.
    const view = buildHierarchy({ rootKey: untitled, rootGraph: caller, texts: placed, baseCatalog: CAT, readVI: Q.leer });
    let g = caller;
    const three = Gr.crearNodo(g, view.catalog, "const", 20, 60);
    g = Gr.fijarConfig(three.g, three.id, { value: 3 });
    const sumIndicator = Gr.crearEnPanel(g, view.catalog, "indicator", 300, 60, "sum");
    const countIndicator = Gr.crearEnPanel(sumIndicator.g, view.catalog, "indicator", 300, 200, "count", { type: "i32" });
    g = countIndicator.g;
    const ports = (id) => view.catalog.puertos(g.nodos.find((n) => n.id === id));
    const wire = (from, fromPort, to, toPort) => {
      const wired = Gr.conectar(g, view.catalog, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" });
      assert.ok(!wired.motivo, wired.motivo);
      g = wired.g;
    };
    const [x, y] = ports(addNode).in;
    assert.deepEqual([x.cell, y.cell, y.optional], [0, 2, true], "ports on the cells of the connector, optional while Recommended");
    wire(three.id, "result", addNode, y.name);
    wire(addNode, ports(addNode).out[0].name, sumIndicator.id, "value");
    wire(counterNode, ports(counterNode).out[0].name, countIndicator.id, "value");

    // Saving it for the first time converts the paths to relative ones.
    const text = await save(callerFile, g, view.catalog, untitled);
    assert.deepEqual(JSON.parse(text)["block-diagram"].nodes.filter((n) => n.type === "subvi").map((n) => n.config.vi).sort(), ["lib/add2.qvi", "lib/counter.qvi"]);

    // Opened again: x is unwired and takes the default of the control (5), so 5 + 3.
    const opened = await open(callerFile);
    assert.deepEqual([opened.errors, opened.missing], [[], []]);
    assert.equal(opened.keys.length, 2);
    const compiled = compilar(opened.graph, opened.catalog);
    assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
    const idOf = (label) => opened.graph.nodos.find((n) => n.label?.text === label).id;
    const first = await runInWorker(opened.key, compiled);
    assert.equal(first[idOf("sum")], 8);
    assert.equal(first[idOf("count")], 1);
    // The next Run of the same VI sees the state the counter kept (DT-045, measured in LabVIEW: 1 then 2).
    const second = await runInWorker(opened.key, compiled);
    assert.equal(second[idOf("count")], 2);
    // Another top-level VI has its own state.
    assert.equal((await runInWorker("/other/main.qvi", compiled))[idOf("count")], 1);

    // Required: wiring is demanded of the caller, and the Run arrow breaks until it is wired.
    const required = assignPanelElement(adder.g, CAT, adder.ids.x, 0);
    const withRequired = { ...required, vi: { ...required.vi, connector: { ...required.vi.connector, inputs: required.vi.connector.inputs.map((t) => ({ ...t, connection: "required" })) } } };
    await save(adderFile, withRequired, CAT, Paths.pathKey(adderFile));
    const reopened = await open(callerFile);
    assert.equal(Gr.ejecutable(reopened.graph, reopened.catalog, Gr.tipos(reopened.graph, reopened.catalog)), false, "an unwired Required input breaks the arrow");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a caller sees the new connector when its subVI is saved", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "solder-subvi-"));
  try {
    const adderFile = path.join(folder, "add2.qvi");
    const callerFile = path.join(folder, "main.qvi");
    const adder = adderVI();
    await save(adderFile, adder.g, CAT, Paths.untitledKey(1));

    // The caller wires the sum of the subVI to an indicator.
    const callerKey = Paths.pathKey(callerFile);
    const texts = { [Paths.pathKey(adderFile)]: await readFile(adderFile, "utf8") };
    const empty = buildHierarchy({ rootKey: callerKey, rootGraph: Gr.nuevo(), texts, baseCatalog: CAT, readVI: Q.leer });
    const node = Gr.crearNodo(Gr.nuevo(), empty.catalog, "subvi", 100, 60);
    let g = Gr.fijarConfig(node.g, node.id, SN.subVIConfig("add2.qvi"));
    let view = buildHierarchy({ rootKey: callerKey, rootGraph: g, texts, baseCatalog: CAT, readVI: Q.leer });
    const indicator = Gr.crearEnPanel(g, view.catalog, "indicator", 300, 60, "sum");
    g = Gr.conectar(indicator.g, view.catalog, { nodo: node.id, puerto: view.catalog.puertos(g.nodos[0]).out[0].name, dir: "out" }, { nodo: indicator.id, puerto: "value", dir: "in" }).g;
    assert.equal(g.cables.length, 1);

    // The subVI is edited in the editor, its connector loses the sum, and it is saved: the main process tells the callers.
    const edited = CP.runMenuCommand(CP.openMenu(P.inicial(adder.g), CP.MENU_ROOT, 0, 0, 9), `${CP.MENU_ROOT}.disconnect-this-terminal`);
    const preallocated = VP.apply(edited.g, VP.choose(VP.open(edited.g), "preallocated"));
    await save(adderFile, preallocated, CAT, Paths.pathKey(adderFile));

    // The caller reads the files again, rebuilds its view over the graph it is editing and drops the wire that lost its port.
    const { texts: fresh } = await Paths.readHierarchyTexts(callerKey, Q.aTexto(g, view.catalog), (key) => readFile(key, "utf8").catch(() => null));
    view = buildHierarchy({ rootKey: callerKey, rootGraph: g, texts: fresh, baseCatalog: CAT, readVI: Q.leer });
    assert.deepEqual(view.catalog.puertos(g.nodos[0]).out, [], "no output any more");
    const pruned = SN.pruneOrphanWires(g, view.catalog);
    assert.equal(pruned.cables.length, 0);
    assert.ok(Gr.ejecutable(pruned, view.catalog, Gr.tipos(pruned, view.catalog)));
    // The new execution setting travelled with the file too.
    assert.equal(view.catalog.findSubVI("add2.qvi").g.vi.execution.reentrancy, "preallocated");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
