// Make Type Def. and Open Type Def. on a panel cluster (DT-104 stage a2), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-typedef-editor-entry.md Q2 and Q5, 2026-11-17-typedef-update.md Q4): the
// object follows an untitled "Control N" kept in memory with no window, its menu becomes the linked instance's, and
// saving that control moves the link to its file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import { definitionObjectOf } from "../../core/model/control-editor.mjs";
import { linkFor, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { CLUSTER_MENU_ROOT, clusterMenuVariants } from "../../editor/src/front-panel/cluster-menus.mjs";
import { typeDefinitionMarks, typeDefinitionVariants } from "../../editor/src/front-panel/type-definition-menus.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { controlOfConstant } from "../../editor/src/block-diagram/cluster-constant-panel.mjs";
import { controlEditorGraph, editedObjectsOf } from "../../core/model/control-editor.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
import { readHierarchyTexts, rebaseStoredPath, relinkTypeDefinition, resolveRelative, untitledKey } from "../../editor/src/common/ovi-paths.mjs";
import { memoryFirstReader } from "../../editor/electron/memory-first.mjs";
import { canDefer } from "../../editor/electron/deferred-close.mjs";
import { ENTRY_KINDS, createRegistry, isDirty, oviName, recordChange } from "../../editor/electron/ovi-registry.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { CAT, INV } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const row = (name) => `${CLUSTER_MENU_ROOT}.${name}`;
const LINKED_ROWS = ["review-and-update-from-type-def", "auto-update-from-type-def", "open-type-def", "disconnect-from-type-def", "show-vi-hierarchy", "explore"].map(row);
const CALLER = "/work/p1.ovi";

/** A panel with one cluster control, and its menu open; `typedef` is the cluster's link, if any. */
function clusterMenu(typedef, tipo = "cluster-control") {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, tipo, 40, 50, "Point", {});
  const g = { ...placed.g, nodos: placed.g.nodos.map((node) => (node.id === placed.id && typedef ? { ...node, config: { ...node.config, typedef } } : node)) };
  return { g, menu: { raiz: CLUSTER_MENU_ROOT, nodo: placed.id }, id: placed.id };
}

/** What Make Type Def. does across the processes: the untitled control entry, and the cluster linked to its key. */
function madeTypeDefinition() {
  const registry = createRegistry();
  registry.open({ path: CALLER });
  const { g, id } = clusterMenu(null);
  const text = typeDefinitionText("type-def", [definitionObjectOf(g.nodos.find((node) => node.id === id))]);
  const { entry } = registry.open({ kind: ENTRY_KINDS.CONTROL, initialText: text });
  recordChange(entry, text);
  const key = untitledKey(entry.id);
  const linked = { ...g, nodos: g.nodos.map((node) => (node.id === id ? { ...node, config: { ...node.config, typedef: linkFor(key, "type-def") } } : node)) };
  return { registry, entry, key, linked };
}

test("Make Type Def. on a cluster control links it to an untitled control and its menu becomes the linked instance's", async () => {
  // Unlinked: Make Type Def., and none of the linked rows.
  // Through the menus' general entry points, as the page asks them.
  const plain = ED.variantes(clusterMenu(null), null, INV);
  for (const id of LINKED_ROWS) assert.ok(plain.ocultos.has(id), id);
  assert.ok(!plain.ocultos.has(row("make-type-def")));
  // Linked, not strict: the linked rows in Make Type Def.'s place, Auto-Update ticked.
  const linked = clusterMenu({ path: "untitled:7", strict: false });
  assert.deepEqual([...typeDefinitionVariants(linked).ocultos], ["make-type-def", "find-terminal", "fit-control-to-pane", "scale-object-with-pane"].map(row));
  assert.ok(ED.variantes(linked, null, INV).ocultos.has(row("make-type-def")));
  assert.ok(ED.marcados(linked, null).has(row("auto-update-from-type-def")));
  // The order of a linked cluster's elements is the definition's: Reorder greyed, enabled once disconnected (measured).
  assert.ok(typeDefinitionVariants(linked).desactivados.has(row("reorder-controls-in-cluster")));
  assert.ok(!typeDefinitionVariants(clusterMenu(null)).desactivados.has(row("reorder-controls-in-cluster")));
  // Strict: no Auto-Update row.
  const strict = clusterMenu({ path: "ctl/S.octl", strict: true });
  assert.ok(typeDefinitionVariants(strict).ocultos.has(row("auto-update-from-type-def")));
  assert.ok(!typeDefinitionMarks(strict).has(row("auto-update-from-type-def")));
  // On an indicator it looked greyed (unverified).
  assert.ok(clusterMenuVariants(clusterMenu(null, "cluster-indicator")).desactivados.has(row("make-type-def")));
  assert.equal(INV.entrada(row("make-type-def")).estado, "built");

  // The entry is "Control N", unsaved at once, and the caller's hierarchy finds it in memory by its untitled key.
  const { registry, entry, key, linked: g } = madeTypeDefinition();
  assert.equal(oviName(entry), "Control 1", "its own count, beside Untitled 1");
  assert.equal(isDirty(entry), true, "measured: Control 5 Type Def *");
  const text = Q.aTexto(g, CAT);
  const { texts, missing } = await readHierarchyTexts(CALLER, text, memoryFirstReader(registry, async () => null));
  assert.deepEqual(missing, []);
  const hierarchy = buildHierarchy({ rootKey: CALLER, rootGraph: Q.leer(text, CAT), texts, baseCatalog: CAT, readOVI: Q.leer });
  assert.deepEqual(hierarchy.errors, [], "no 'Type definition not found'");
  assert.deepEqual([...hierarchy.typeDefinitions.keys()], [key]);

  // The page asks the main process, which keeps the entry in memory with no window (measured: nothing opens).
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /"make-type-def": \(nodeId\) => makeTypeDefinition\(nodeId\)/);
  assert.match(page, /const calledKeys = \(hierarchy\) => \[\.\.\.hierarchy\.keys, \.\.\.hierarchy\.typeDefinitions\.keys\(\)\]/, "the caller reports the definitions it follows");
  const main = source("editor/electron/main.mjs");
  const make = main.slice(main.indexOf("function makeTypeDefinition"), main.indexOf("\n}", main.indexOf("function makeTypeDefinition")));
  assert.match(make, /deferredEntries\.set\(entry\.id, entry\)/);
  assert.doesNotMatch(make, /openWindows/);
});

test("Open Type Def. opens the control editor of the type definition the cluster follows", () => {
  assert.equal(INV.entrada(row("open-type-def")).estado, "built");
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /"open-type-def": \(nodeId\) => openTypeDefinition\(nodeId\)/);
  assert.match(page, /window\.solder\?\.abrirRuta\(Paths\.resolveRelative\(oviKey, link\.path, oviLibRoot\)\)/);
  // An untitled key reaches the main process as it is, and opens the entry from memory as it was left.
  assert.equal(resolveRelative(CALLER, "untitled:7"), "untitled:7");
  const main = source("editor/electron/main.mjs");
  assert.match(main, /if \(isUntitledKey\(filePath\)\) return openUntitled\(filePath\);/);
  const open = main.slice(main.indexOf("function openUntitled"), main.indexOf("\n}", main.indexOf("function openUntitled")));
  assert.match(open, /deferredEntries\.delete\(entry\.id\)\) return openWindows\(Object\.assign\(entry, \{ initialText: entry\.current \}\)\)/);
  assert.match(open, /focusPanel\(open\)/, "an open editor comes forward");
});

test("an untitled key is never rebased and closing its editor while it is followed offers Defer Decision", () => {
  assert.equal(rebaseStoredPath("untitled:7", "/a/p1.ovi", "/b/c/p1.ovi"), "untitled:7");
  const { entry, key } = madeTypeDefinition();
  const keyOf = (candidate) => (candidate.path ?? untitledKey(candidate.id));
  const caller = { entry: { id: "99", path: CALLER }, calls: [key] };
  const editor = { entry, calls: [] };
  assert.equal(canDefer(editor, [caller, editor], keyOf), true, "measured: Save, Defer Decision, Cancel");
  assert.equal(canDefer(editor, [editor], keyOf), false, "nothing follows it");
});

test("saving the untitled control moves its instances' links to the file", () => {
  const { key, linked } = madeTypeDefinition();
  const moved = relinkTypeDefinition(linked, key, "/work/ctl/TDa.octl", CALLER);
  assert.deepEqual(moved.nodos.find((node) => node.config?.typedef).config.typedef, { path: "ctl/TDa.octl", strict: false }, "relative to the OVI");
  assert.equal(relinkTypeDefinition(linked, "untitled:999", "/work/x.octl", CALLER), linked, "another definition's save changes nothing");
  const untitledCaller = relinkTypeDefinition(linked, key, "/work/ctl/TDa.octl", "untitled:1");
  assert.equal(untitledCaller.nodos.find((node) => node.config?.typedef).config.typedef.path, "/work/ctl/TDa.octl", "absolute while the OVI has no file");
  const main = source("editor/electron/main.mjs");
  assert.match(main, /broadcast\("ovi:saved", \{ id: entry\.id, key: pathKey\(target\), from, follow: FOLLOW\.check \}\)/);
  assert.match(main, /if \(!entry\.path\) return \(await writeControl\(\{ entry, windows: \{\} \}, owner, entry\.current, false\)\) !== null;/, "a deferred untitled control asks where");
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /if \(from && from !== key && hierarchyKeys\.includes\(from\)\) return followSavedTypeDefinition\(from, key, follow\);/);
});

test("the control editor's window takes part in the Window menu and Open Type Def. sends nothing back to the page", () => {
  // Found trying stage a2 in the editor (reports/2026-11-22-typedef-make-open-editor.md §8): the standalone window had no
  // `activations`, so noteWindowActivated threw, and ovi:open-path answered with the entry's windows, which cannot be cloned.
  const main = source("editor/electron/main.mjs");
  const standalone = main.slice(main.indexOf("function openStandaloneWindow"), main.indexOf("\n}", main.indexOf("function openStandaloneWindow")));
  assert.match(standalone, /const open = \{ entry, windows: \{ \[windowKind\]: window \}, closing: false, activations: \{\} \};/);
  assert.match(main, /ipcMain\.handle\("ovi:open-path", async \(event, key\) => \{\n\s*await openPath\(key, ownerOf\(event\)\);\n\s*\}\);/);
});

/** A diagram with one constant of `tipo` and its menu open at `root`; `typedef` is its link, if any. */
function constantMenu(tipo, root, { typedef, config } = {}) {
  const created = Gr.crearNodo(Gr.nuevo(), CAT, tipo, 100, 100);
  const g = { ...created.g, nodos: created.g.nodos.map((node) => (node.id === created.id ? { ...node, config: { ...node.config, ...config, ...(typedef && { typedef }) } } : node)) };
  return { g, menu: { raiz: root, nodo: created.id }, id: created.id };
}

test("Make Type Def. on a Cluster Constant or a Numeric Constant links it to an untitled control holding the control it becomes", () => {
  for (const root of ["context.cluster-constant", "context.numeric-constant"]) {
    assert.equal(INV.entrada(`${root}.make-type-def`).estado, "built", root);
    assert.equal(INV.entrada(`${root}.open-type-def`).estado, "built", root);
  }
  // The menus: Make Type Def. unlinked, the linked rows once linked, Auto-Update ticked.
  const numeric = constantMenu("num-const", "context.numeric-constant", { config: { type: "i32", value: 7 } });
  assert.ok(ED.variantes(numeric, null, INV).ocultos.has("context.numeric-constant.open-type-def"));
  const linked = constantMenu("num-const", "context.numeric-constant", { typedef: { path: "untitled:3", strict: false } });
  assert.ok(ED.variantes(linked, null, INV).ocultos.has("context.numeric-constant.make-type-def"));
  assert.ok(ED.marcados(linked, null).has("context.numeric-constant.auto-update-from-type-def"));
  // Its type is the definition's: Adapt To Entered Data and Representation greyed (measured Q1).
  for (const name of ["adapt-to-entered-data", "representation"]) {
    assert.ok(ED.variantes(linked, null, INV).desactivados.has(`context.numeric-constant.${name}`), name);
    assert.ok(!ED.variantes(numeric, null, INV).desactivados?.has(`context.numeric-constant.${name}`), `${name} live unlinked`);
  }
  const frame = constantMenu("cluster-constant", "context.cluster-constant", { typedef: { path: "untitled:3", strict: false } });
  assert.ok(ED.variantes(frame, null, INV).ocultos.has("context.cluster-constant.make-type-def"));
  assert.ok(ED.marcados(frame, null).has("context.cluster-constant.auto-update-from-type-def"));
  // The other constants that share the numeric menu keep Make Type Def. greyed.
  assert.ok(ED.variantes(constantMenu("str-const", "context.numeric-constant"), null, INV).desactivados.has("context.numeric-constant.make-type-def"));
  assert.ok(!ED.variantes(numeric, null, INV).desactivados?.has("context.numeric-constant.make-type-def"));

  // The .octl holds the control: a numeric control of the constant's representation and value...
  const number = controlOfConstant(numeric.g.nodos.find((node) => node.id === numeric.id));
  assert.equal(number.tipo, "control");
  assert.equal(number.label.text, "Numeric", "measured: the label Numeric, shown");
  assert.deepEqual(number.config, { type: "i32", value: 7 });
  const opened = controlEditorGraph(typeDefinitionText("type-def", [number]), CAT);
  assert.equal(editedObjectsOf(opened.g, CAT)[0].tipo, "control", "the control editor opens it as a panel object");
  // ...and a cluster control of the Cluster Constant's elements, with their values as defaults.
  const empty = constantMenu("cluster-constant", "context.cluster-constant");
  const withElements = setClusterElements(empty.g, CAT, empty.id, [
    { tipo: "num-const", config: { type: "dbl", value: 3 }, x: 5, y: 5 },
    { tipo: "bool-const", config: { value: true }, x: 5, y: 40 },
  ]);
  const cluster = controlOfConstant(withElements.nodos.find((node) => node.id === empty.id));
  assert.equal(cluster.tipo, "cluster-control");
  assert.equal(cluster.label.text, "Cluster", "measured: the label Cluster, shown");
  assert.ok(cluster.config.elements.every((element) => element.label.text === ""), "measured: no element label shown");
  assert.deepEqual(cluster.config.elements.map((element) => [element.tipo, element.config.value]), [["control", 3], ["bool-control", true]]);
  const reopened = controlEditorGraph(typeDefinitionText("type-def", [cluster]), CAT);
  assert.equal(editedObjectsOf(reopened.g, CAT)[0].config.elements.length, 2);
  assert.equal(controlOfConstant({ tipo: "str-const", config: {} }), null);

  // The page holds a panel object as it is and a constant as its control.
  assert.match(source("editor/src/window/editor-window.mjs"), /const object = node && \(node\.panel \? definitionObjectOf\(node\) : controlOfConstant\(node\)\);/);
});

/** The rows a menu shows, in order, with "|" where a separator is drawn (as diagram-view.mjs draws them). */
function shownRows(state, root) {
  const { ocultos = new Set(), separadores = new Map(), rotulos = new Map() } = ED.variantes(state, null, INV);
  const rows = INV.hijos(root).filter((entry) => !ocultos.has(entry.id));
  return rows.flatMap((entry, index) => [...(index > 0 && (separadores.get(entry.id) ?? !!entry.separado) ? ["|"] : []), rotulos.get(entry.id) ?? entry.etiqueta]);
}

test("a linked object's menu orders its rows as LabVIEW's instance menu", () => {
  const linkedTo = { typedef: { path: "untitled:3", strict: false } };
  const linkedGroup = ["|", "Review and Update from Type Def...", "Auto-Update from Type Def.", "Open Type Def.", "Disconnect from Type Def.", "Show OVI Hierarchy", "Explore..."];
  // reports/2026-11-22-typedef-from-constants.md Q1: Find ▸ after Change to Array, Description and Tip... after Replace ▸.
  // Change to Shared Variable Node, from an older capture, was not in the menus of Q1: left out of the comparison.
  const withoutSharedVariable = (rows) => rows.filter((label) => label !== "Change to Shared Variable Node");
  const numeric = withoutSharedVariable(shownRows(constantMenu("num-const", "context.numeric-constant", linkedTo), "context.numeric-constant"));
  assert.deepEqual(numeric.slice(0, numeric.indexOf("Adapt To Entered Data")), [
    "Visible Items", "Change to Control", "Change to Indicator", "Change to Array", "Find", ...linkedGroup,
    "|", "Numeric Palette", "Create", "Replace", "Description and Tip...", "|", "Data Operations", "Advanced", "|",
  ]);
  const unlinked = withoutSharedVariable(shownRows(constantMenu("num-const", "context.numeric-constant"), "context.numeric-constant"));
  assert.deepEqual(unlinked.slice(unlinked.indexOf("Change to Array"), unlinked.indexOf("Create")), ["Change to Array", "|", "Make Type Def.", "|", "Description and Tip...", "|", "Numeric Palette"]);
  // Q3: the Cluster Constant's frame, the same moves.
  const frame = shownRows(constantMenu("cluster-constant", "context.cluster-constant", linkedTo), "context.cluster-constant");
  assert.deepEqual(frame.slice(frame.indexOf("Change to Array"), frame.indexOf("Reorder Controls In Cluster...")), [
    "Change to Array", "Find", ...linkedGroup, "|", "Cluster, Class, & Variant Palette", "Create", "Replace", "Description and Tip...", "|", "Data Operations", "Advanced", "|",
  ]);
  // reports/2026-11-23-typedef-instances.md Q1: the panel cluster's Find ▸ in Find Terminal's place, no Fit Control to Pane or Scale Object with Pane.
  const panel = shownRows(clusterMenu({ path: "untitled:3", strict: false }), CLUSTER_MENU_ROOT);
  assert.deepEqual(panel, ["Visible Items", "Find", "Change to Indicator", "Change to Array", ...linkedGroup, "|", "Description and Tip...", "|", "Create", "Replace", "Data Operations", "Advanced", "|", "Reorder Controls In Cluster...", "AutoSizing", "|", "Properties"]);
  assert.deepEqual(shownRows(clusterMenu(null), CLUSTER_MENU_ROOT).slice(0, 2), ["Visible Items", "Find Terminal"]);
});

test("a linked constant and a linked control's terminal carry LabVIEW's corner mark; a free one and the panel object none", async () => {
  const D = await import("../../editor/src/block-diagram/diagram-view.mjs");
  const ctx = D.contexto(CAT, D.glifosPorBloque(INV), ",");
  const drawn = (state) => D.contenido({ ...state, seleccion: [] }, ctx, Gr.tipos(state.g, CAT));
  const linkedTo = { typedef: { path: "untitled:3", strict: false } };
  // reports/2026-11-24-typedef-mark-and-footer.md Q1: 8 px legs from the outer corner, one flat colour.
  for (const [tipo, root] of [["num-const", "context.numeric-constant"], ["cluster-constant", "context.cluster-constant"]]) {
    assert.match(drawn(constantMenu(tipo, root, linkedTo)), /<svg class="typedef-mark typedef-mark-constant" width="8" height="8"[^>]*shape-rendering="crispEdges"/, tipo);
    assert.doesNotMatch(drawn(constantMenu(tipo, root)), /typedef-mark/, `${tipo} unlinked`);
  }
  assert.match(drawn(clusterMenu({ path: "untitled:3", strict: false })), /typedef-mark typedef-mark-terminal/, "the terminal's mark is black");
  const { typeDefinitionMarkHtml } = await import("../../editor/src/block-diagram/type-definition-mark.mjs");
  assert.match(typeDefinitionMarkHtml({ tipo: "num-const", config: linkedTo }), /d="M0 0H8V1H7V2H6V3H5V4H4V5H3V6H2V7H1V8H0Z"/, "rows of 8, 7, … 1 px");
  const styles = source("editor/src/styles.css");
  assert.match(styles, /\.typedef-mark-constant \{ fill: var\(--typedef-mark-constant\); \}/);
  assert.match(source("editor/src/themes/old-school.css"), /--typedef-mark-constant: #464646;\n  --typedef-mark-terminal: #000000;/);
});

/** A panel with one numeric control and its menu open at the panel Numeric control's root; `typedef` is its link, if any. */
function numericPanelMenu(typedef) {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, "control", 40, 50, "Numeric", {});
  const g = { ...placed.g, nodos: placed.g.nodos.map((node) => (node.id === placed.id && typedef ? { ...node, config: { ...node.config, typedef } } : node)) };
  return { g, menu: { raiz: "context.numeric-panel-control", nodo: placed.id }, id: placed.id };
}

test("the panel Numeric control has the type definition rows of the panel cluster, and Make Type Def. holds it as it is", () => {
  const root = "context.numeric-panel-control";
  const linkedGroup = ["|", "Review and Update from Type Def...", "Auto-Update from Type Def.", "Open Type Def.", "Disconnect from Type Def.", "Show OVI Hierarchy", "Explore..."];
  for (const name of ["make-type-def", "auto-update-from-type-def", "open-type-def", "disconnect-from-type-def"]) assert.equal(INV.entrada(`${root}.${name}`).estado, "built", name);
  // Unlinked: Make Type Def., and none of the linked rows; Fit Control to Pane and Scale Object with Pane are there.
  const free = shownRows(numericPanelMenu(null), root);
  assert.deepEqual(free.slice(free.indexOf("Change to Array"), free.indexOf("Find")), ["Change to Array", "|", "Make Type Def.", "Description and Tip..."]);
  assert.ok(free.includes("Fit Control to Pane") && free.includes("Scale Object with Pane"));
  // Linked (reports/2026-11-25-placing-a-control.md Q1, the order by analogy with the panel cluster).
  const linked = shownRows(numericPanelMenu({ path: "untitled:3", strict: false }), root);
  assert.deepEqual(linked.slice(linked.indexOf("Change to Array"), linked.indexOf("Find")), ["Change to Array", ...linkedGroup, "Description and Tip..."], "no separator before Description and Tip..., as the free menu measured (the linked one unverified)");
  assert.ok(!linked.includes("Fit Control to Pane") && !linked.includes("Scale Object with Pane"), "by analogy with the cluster: unverified for the numeric");
  assert.ok(ED.marcados(numericPanelMenu({ path: "untitled:3", strict: false }), null).has(`${root}.auto-update-from-type-def`));
  // Its representation is the definition's: greyed while linked, free once disconnected (unverified for the numeric).
  assert.ok(ED.variantes(numericPanelMenu({ path: "untitled:3", strict: false }), null, INV).desactivados.has(`${root}.representation`));
  assert.ok(!ED.variantes(numericPanelMenu(null), null, INV).desactivados?.has(`${root}.representation`));
  assert.ok(!ED.variantes(numericPanelMenu(null), null, INV).desactivados?.has(`${root}.make-type-def`));
  // Make Type Def. holds the panel object as it is: the .octl's object is the numeric, as the control editor opens it.
  const { g, id } = numericPanelMenu(null);
  const object = definitionObjectOf(g.nodos.find((node) => node.id === id));
  assert.equal(object.tipo, "control");
  assert.equal(editedObjectsOf(controlEditorGraph(typeDefinitionText("type-def", [object]), CAT).g, CAT)[0].tipo, "control");
});
