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
import { controlEditorGraph, editedObjectOf } from "../../core/model/control-editor.mjs";
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
  const text = typeDefinitionText("type-def", definitionObjectOf(g.nodos.find((node) => node.id === id)));
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
  assert.deepEqual([...typeDefinitionVariants(linked).ocultos], [row("make-type-def")]);
  assert.ok(ED.variantes(linked, null, INV).ocultos.has(row("make-type-def")));
  assert.ok(ED.marcados(linked, null).has(row("auto-update-from-type-def")));
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
  assert.match(main, /broadcast\("ovi:saved", \{ id: entry\.id, key: pathKey\(target\), from \}\)/);
  assert.match(main, /if \(!entry\.path\) return \(await writeControl\(\{ entry, windows: \{\} \}, owner, entry\.current, false\)\) !== null;/, "a deferred untitled control asks where");
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /if \(from && from !== key && hierarchyKeys\.includes\(from\)\) return followSavedTypeDefinition\(from, key\);/);
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
  const opened = controlEditorGraph(typeDefinitionText("type-def", number), CAT);
  assert.equal(editedObjectOf(opened.g, CAT).tipo, "control", "the control editor opens it as a panel object");
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
  const reopened = controlEditorGraph(typeDefinitionText("type-def", cluster), CAT);
  assert.equal(editedObjectOf(reopened.g, CAT).config.elements.length, 2);
  assert.equal(controlOfConstant({ tipo: "str-const", config: {} }), null);

  // The page holds a panel object as it is and a constant as its control.
  assert.match(source("editor/src/window/editor-window.mjs"), /const object = node && \(node\.panel \? definitionObjectOf\(node\) : controlOfConstant\(node\)\);/);
});
