// The objects that follow a type definition (DT-104 stage b), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-23-typedef-instances.md): Disconnect from Type Def., Auto-Update from Type Def., an OVI
// following its definitions when it opens, File ▸ Apply Changes of the control editor with what the OVIs read of a control
// being edited, and what a linked cluster does not allow on the panel.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import { mismatchReason } from "../../core/model/type-definition-follow.mjs";
import { definitionObjectOf } from "../../core/model/control-editor.mjs";
import { typeDefinitionText } from "../../core/model/type-definition.mjs";
import { setClusterElements } from "../../core/model/user-cluster.mjs";
// The diagram's editing comes first: front-panel.mjs cannot be the first module loaded of its import cycle.
import "../../editor/src/block-diagram/diagram-editing.mjs";
import { CLUSTER_MENU_ROOT } from "../../editor/src/front-panel/cluster-menus.mjs";
import { clusterAt, dropObjects, selectsLockedElement } from "../../editor/src/front-panel/cluster-panel.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as PC from "../../editor/src/front-panel/panel-clipboard.mjs";
import { typeDefinitionMarks, typeDefinitionVariants } from "../../editor/src/front-panel/type-definition-menus.mjs";
import { editMenuVariants } from "../../editor/src/window/edit-menu.mjs";
import { applyMenuVariant, createApplyTracker, APPLY_ROW } from "../../editor/src/window/control-editor-apply.mjs";
import { createFollower, disconnectQuestion, toInstanceElement, withAutoUpdateToggled, withoutTypeDefinition } from "../../editor/src/window/type-definition-instances.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { FOLLOW } from "../../editor/src/common/type-definition-publishing.mjs";
import { memoryFirstReader } from "../../editor/electron/memory-first.mjs";
import { ENTRY_KINDS, createRegistry, isDirty, recordChange, recordSave } from "../../editor/electron/ovi-registry.mjs";
import { appliedTextOf, applyControl, editChangesCallers, publishSavedControl, textSeenByCallers } from "../../editor/electron/type-definition-publishing.mjs";
import { CAT, INV } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const PAGE = "editor/src/window/editor-window.mjs";
const MAIN = "editor/electron/main.mjs";
const ROOT = "/work/p1.ovi";
const KEY = "/work/ctl/PointTD.octl";
const LINK = { path: "ctl/PointTD.octl", strict: false };

const numeric = (label, value) => ({ tipo: "control", label: { text: label }, config: { type: "number", ...(value !== undefined && { value }) }, x: 4, y: 19 });
const boolean = (label, value) => ({ tipo: "bool-control", label: { text: label }, config: { style: "push-button", ...(value !== undefined && { value }) }, x: 25, y: 48 });
const string = (label) => ({ tipo: "str-control", label: { text: label }, config: { value: "" }, x: 3, y: 64 });

/** The `.octl` text of a cluster control holding `elements`, as the control editor writes it. */
const definitionText = (elements, kind = "type-def") =>
  typeDefinitionText(kind, { tipo: "cluster-control", label: { text: "Point" }, config: { elements }, x: 31, y: 109 });

/** A panel with one cluster control "Pt" holding `elements` and following `link`, and its id. */
function panelWithCluster(elements, link = LINK, tipo = "cluster-control") {
  const placed = Gr.crearEnPanel(Gr.nuevo(), CAT, tipo, 40, 50, "Pt", {});
  const g = setClusterElements(placed.g, CAT, placed.id, elements);
  return { g: { ...g, nodos: g.nodos.map((node) => (node.id === placed.id ? { ...node, config: { ...node.config, ...(link && { typedef: link }) } } : node)) }, id: placed.id };
}

/** What a page does for the OVI `g`: builds its hierarchy over the definition `text` and lets its instances follow. */
function followedOver(g, text, options) {
  const follower = options.follower ?? createFollower();
  const hierarchy = buildHierarchy({ rootKey: ROOT, rootGraph: g, texts: { [KEY]: text }, baseCatalog: CAT, readOVI: Q.leer });
  follower.know(hierarchy.typeDefinitions);
  return { follower, hierarchy, g: follower.follow(hierarchy.graph, { catalog: hierarchy.catalog, oviKey: ROOT, oviLibRoot: "", ...options }) };
}

const elementLabels = (g, id) => g.nodos.find((node) => node.id === id).config.elements.map((element) => element.label?.text ?? "");

test("Disconnect from Type Def. asks LabVIEW's question and then unlinks the object, changing nothing else", () => {
  // The words measured on a panel control, a strict one and a Cluster Constant.
  assert.equal(disconnectQuestion("Pt", "PointTD.ctl"), 'Disconnect the control "Pt" from its Type Definition, "PointTD.ctl"?');
  const { g, id } = panelWithCluster([numeric("a", 4), boolean("b", true)]);
  const unlinked = withoutTypeDefinition(g, id);
  const [before, after] = [g, unlinked].map((graph) => graph.nodos.find((node) => node.id === id));
  assert.equal(after.config.typedef, undefined);
  assert.deepEqual({ ...after, config: { ...after.config, typedef: before.config.typedef } }, before, "elements, values, default, label and place stay");
  // Its menu then offers Make Type Def. again, and the linked rows are gone.
  const menu = (graph) => ({ g: graph, menu: { raiz: CLUSTER_MENU_ROOT, nodo: id } });
  assert.ok(typeDefinitionVariants(menu(g)).ocultos.has(`${CLUSTER_MENU_ROOT}.make-type-def`));
  assert.ok(!typeDefinitionVariants(menu(unlinked)).ocultos.has(`${CLUSTER_MENU_ROOT}.make-type-def`));
  assert.ok(typeDefinitionVariants(menu(unlinked)).ocultos.has(`${CLUSTER_MENU_ROOT}.disconnect-from-type-def`));

  for (const root of ["context.cluster-control", "context.cluster-constant", "context.numeric-constant"]) {
    assert.equal(INV.entrada(`${root}.disconnect-from-type-def`).estado, "built", root);
  }
  // The page asks with the box a Run's confirmation uses, and the edit marks the OVI modified (setGraphAndRest).
  const page = source(PAGE);
  assert.match(page, /"disconnect-from-type-def": \(nodeId\) => disconnectFromTypeDefinition\(nodeId\)/);
  const disconnect = page.slice(page.indexOf("async function disconnectFromTypeDefinition"), page.indexOf("\n}", page.indexOf("async function disconnectFromTypeDefinition")));
  assert.match(disconnect, /if \(!\(await window\.solder\.confirm\(\{ message: question \}\)\)\) return;/, "Cancel changes nothing");
  assert.match(disconnect, /setGraphAndRest\(await withHierarchyTextsOf\(withoutTypeDefinition\(grafo\(\), nodeId\)\), "disconnect-from-type-def"\);/);
  assert.match(source("editor/electron/preload.cjs"), /confirm: \(question\) => ipcRenderer\.invoke\("run:confirm", question\)/);
});

test("Auto-Update from Type Def. is ticked until unticked, and ticking it again follows at once", () => {
  const { g, id } = panelWithCluster([numeric("a", 4), boolean("b", true)]);
  const withString = definitionText([numeric("a"), boolean("b"), string("s")]);
  const menu = (graph) => ({ g: graph, menu: { raiz: CLUSTER_MENU_ROOT, nodo: id } });
  const tick = `${CLUSTER_MENU_ROOT}.auto-update-from-type-def`;
  assert.ok(typeDefinitionMarks(menu(g)).has(tick), "ticked by default");

  const unticked = withAutoUpdateToggled(g, id);
  assert.equal(unticked.nodos.find((node) => node.id === id).config.typedef["auto-update"], false);
  assert.ok(!typeDefinitionMarks(menu(unticked)).has(tick));
  // Unticked, a definition that differs breaks the instance and does not update it (measured, Q2).
  const checked = followedOver(unticked, withString, { apply: true });
  assert.deepEqual(checked.follower.problems(checked.g, CAT).map((row) => row.text), [mismatchReason("Pt")]);
  assert.deepEqual(elementLabels(checked.g, id), ["a", "b"]);
  // Ticking it deletes the key and follows at once, keeping the instance's own default (a stayed 4).
  const reticked = withAutoUpdateToggled(unticked, id);
  assert.equal("auto-update" in reticked.nodos.find((node) => node.id === id).config.typedef, false);
  const hierarchy = buildHierarchy({ rootKey: ROOT, rootGraph: reticked, texts: { [KEY]: withString }, baseCatalog: CAT, readOVI: Q.leer });
  checked.follower.know(hierarchy.typeDefinitions);
  const followed = checked.follower.follow(hierarchy.graph, { catalog: hierarchy.catalog, oviKey: ROOT, oviLibRoot: "", apply: true, only: [id] });
  assert.deepEqual(elementLabels(followed, id), ["a", "b", "s"]);
  assert.equal(followed.nodos.find((node) => node.id === id).config.elements[0].config.value, 4);
  assert.deepEqual(checked.follower.problems(followed, CAT).map((row) => row.text), [], "the instance no longer breaks the OVI");

  for (const root of ["context.cluster-control", "context.cluster-constant", "context.numeric-constant"]) assert.equal(INV.entrada(`${root}.auto-update-from-type-def`).estado, "built", root);
  assert.equal(INV.entrada("context.cluster-control.review-and-update-from-type-def").estado, "todo", "its window is stage (c)");
  const page = source(PAGE);
  assert.match(page, /"auto-update-from-type-def": \(nodeId\) => toggleAutoUpdate\(nodeId\)/);
  assert.match(page, /setGraphAndRest\(followTypeDefinitions\(toggled, \{ apply: followsAutomatically\(link\), only: \[nodeId\] \}\), "auto-update-from-type-def"\);/);
});

test("an OVI follows its type definitions when it opens, silently, and the instances left behind break it", () => {
  const { g, id } = panelWithCluster([numeric("a", 4), boolean("b", true)]);
  const opened = followedOver(g, definitionText([numeric("a"), boolean("b"), string("s")]), { apply: true });
  assert.deepEqual(elementLabels(opened.g, id), ["a", "b", "s"]);
  assert.deepEqual(opened.follower.problems(opened.g, CAT).map((row) => row.text), []);
  // A default that would be lost waits for a review: broken, not updated, with the Error list's words.
  const review = followedOver(g, definitionText([boolean("b")]), { apply: true });
  assert.deepEqual(elementLabels(review.g, id), ["a", "b"]);
  assert.match(review.follower.problems(review.g, CAT).map((row) => row.text)[0], /^Type Definition 'Pt': .*review|^Type Definition 'Pt': .*default values/);
  // Disconnecting it ends the error: it follows nothing.
  assert.deepEqual(review.follower.problems(withoutTypeDefinition(review.g, id), CAT).map((row) => row.text), []);

  const page = source(PAGE);
  assert.match(page, /cargar\(followTypeDefinitions\(Gr\.adaptPolymorphicNodes\(result\.graph, cat\), \{ apply: true \}\)\);/, "the load follows, and cargar reports the text as the OVI's saved one: not modified");
  const rebuild = page.slice(page.indexOf("function rebuildHierarchy"), page.indexOf("\n}", page.indexOf("function rebuildHierarchy")));
  assert.ok(!rebuild.includes("followTypeDefinitions"), "an edit never follows: a renamed element would be taken for a new one");
  assert.match(page, /hierarchyProblems\(\)\.length > 0/, "Run is broken by an instance left behind");
  assert.match(page, /hierarchyErrors: problems,/, "and the Error list says so, as it does for a missing definition");
});

test("each kind of instance holds the definition's elements as its own block: controls, indicators, constants", () => {
  const control = { id: "n1", tipo: "cluster-control" };
  const indicator = { id: "n2", tipo: "cluster-indicator" };
  const constant = { id: "n3", tipo: "cluster-constant" };
  assert.deepEqual([control, indicator].map((instance) => toInstanceElement(numeric("a", 3), instance).tipo), ["control", "indicator"]);
  assert.equal(toInstanceElement(boolean("b", true), indicator).config.style, "round-led", "a Boolean keeps to its kind");
  const asConstant = toInstanceElement(boolean("b", true), constant);
  assert.deepEqual([asConstant.tipo, asConstant.config.value, asConstant.label], ["bool-const", true, undefined], "a constant's element has no label");

  // A Cluster Constant follows through its unlabelled elements, matched by their place: each keeps its own value.
  const created = Gr.crearNodo(Gr.nuevo(), CAT, "cluster-constant", 100, 100);
  const own = [
    { tipo: "num-const", config: { type: "number", value: 7 }, x: 4, y: 4 },
    { tipo: "bool-const", config: { value: true }, x: 4, y: 30 },
  ];
  const withElements = setClusterElements(created.g, CAT, created.id, own);
  const g = { ...withElements, nodos: withElements.nodos.map((node) => (node.id === created.id ? { ...node, config: { ...node.config, typedef: LINK } } : node)) };
  const unlabelled = (element) => ({ ...element, label: { text: "" } });
  const definition = definitionText([unlabelled(numeric("")), unlabelled(boolean("")), unlabelled(string(""))]);
  const followed = followedOver(g, definition, { apply: true });
  const elements = followed.g.nodos.find((node) => node.id === created.id).config.elements;
  assert.deepEqual(elements.map((element) => [element.tipo, element.config.value]), [["num-const", 7], ["bool-const", true], ["str-const", ""]]);
});

test("File ▸ Apply Changes is enabled only when the definition changed in more than its defaults, and Save does not apply", () => {
  const base = [numeric("a", 5), boolean("b", true)];
  const opened = definitionText(base);
  const tracker = createApplyTracker(opened);
  const hasChanges = (text, kind) => {
    const g = {};
    return tracker.hasChanges(CAT, g, kind, () => text);
  };
  assert.equal(hasChanges(opened, "type-def"), false, "greyed at open (measured)");
  assert.equal(hasChanges(definitionText([numeric("a", 7), boolean("b", true)]), "type-def"), false, "greyed after a default-only change (measured)");
  const structural = definitionText([...base, string("s")]);
  assert.equal(hasChanges(structural, "type-def"), true, "enabled after a structural change (measured)");
  assert.equal(hasChanges(definitionText(base, "strict-type-def"), "strict-type-def"), true, "the ring changing is a change too");
  tracker.applied(structural);
  assert.equal(hasChanges(structural, "type-def"), false, "greyed right after Apply (measured)");
  assert.equal(createApplyTracker(null).hasChanges(CAT, {}, "type-def", () => structural), false, "an editor that was not given what was applied has nothing to apply");
  assert.deepEqual([...applyMenuVariant("window.control-editor.menu.file", false).desactivados], [APPLY_ROW]);
  assert.deepEqual(applyMenuVariant("window.control-editor.menu.file", true), {});
  assert.deepEqual(applyMenuVariant("window.control-editor.menu.edit", false), {});

  assert.equal(INV.entrada(APPLY_ROW).estado, "built");
  const page = source(PAGE);
  assert.match(page, /"apply-changes": applyControlChanges,/);
  const apply = page.slice(page.indexOf("function applyControlChanges"), page.indexOf("\n}", page.indexOf("function applyControlChanges")));
  assert.match(apply, /applying\.applied\(text\);\n\s*window\.solder\.applyControl\(text\);/);
  assert.ok(!apply.includes("guardar"), "Apply does not save: the editor keeps its asterisk (measured)");
});

test("what the OVIs read of a control being edited is its published text: Apply or Save publishes it, an edit does not", async () => {
  const registry = createRegistry();
  const { entry } = registry.open({ path: KEY, kind: ENTRY_KINDS.CONTROL, initialText: definitionText([numeric("a")]) });
  const [opened, edited, applied, savedText] = [definitionText([numeric("a")]), definitionText([numeric("a"), boolean("b")]), definitionText([numeric("a"), boolean("b"), string("s")]), definitionText([numeric("a"), string("s")])];
  recordChange(entry, opened);
  const reader = memoryFirstReader(registry, async () => "from disk");
  assert.equal(await reader(KEY), opened, "the file's text at open");
  recordChange(entry, edited);
  assert.equal(await reader(KEY), opened, "an unsaved edit is not seen");
  assert.equal(editChangesCallers(entry), false, "and announces nothing to the callers");
  assert.equal(appliedTextOf(entry), opened, "what was applied is what was opened until the first Apply");
  recordChange(entry, applied);
  applyControl(entry, applied);
  assert.equal(await reader(KEY), applied, "Apply publishes the text of the editor");
  assert.equal(isDirty(entry), true, "and the editor keeps its asterisk");
  recordChange(entry, savedText);
  assert.equal(await reader(KEY), applied, "later edits are not seen either");
  recordSave(entry, KEY, savedText);
  publishSavedControl(entry, savedText);
  assert.equal(await reader(KEY), savedText, "Save publishes its text...");
  assert.equal(appliedTextOf(entry), applied, "...without applying it");
  assert.equal(textSeenByCallers({ kind: ENTRY_KINDS.OVI, current: "ovi", saved: "x" }), "ovi", "an OVI is read as it is edited (issue #20)");

  const main = source(MAIN);
  assert.match(main, /announceEdit\(entry, FOLLOW\.apply\)/);
  assert.match(main, /broadcast\("ovi:saved", \{ id: entry\.id, key: pathKey\(target\), from, follow: FOLLOW\.check \}\)/);
  assert.match(main, /if \(editChangesCallers\(open\.entry\) && changesWhatCallersSee\(previous, text\)\) announceEdit\(open\.entry\);/);
  assert.match(main, /if \(!entry\.path && entry\.kind !== ENTRY_KINDS\.CONTROL\) return;/, "an untitled definition is followed by its key, so it is announced");
});

test("a definition saved and not applied breaks the instances that differ until Apply updates them", () => {
  const { g, id } = panelWithCluster([numeric("a", 4), boolean("b", true)]);
  const savedNotApplied = definitionText([numeric("a"), boolean("b"), string("s")]);
  const saved = followedOver(g, savedNotApplied, { apply: false });
  assert.deepEqual(saved.follower.problems(saved.g, CAT).map((row) => row.text), [mismatchReason("Pt")]);
  assert.deepEqual(elementLabels(saved.g, id), ["a", "b"], "the instance is as it was");
  // Apply: the same definition, now applied: the instance updates and the OVI is no longer broken.
  const applied = followedOver(saved.g, savedNotApplied, { apply: true, follower: saved.follower });
  assert.deepEqual(elementLabels(applied.g, id), ["a", "b", "s"]);
  assert.deepEqual(saved.follower.problems(applied.g, CAT).map((row) => row.text), []);
  assert.equal(FOLLOW.apply, "apply");
  const page = source(PAGE);
  assert.match(page, /ponerGrafo\(follow \? followTypeDefinitions\(rebuilt, \{ apply: follow === FOLLOW\.apply \}\) : rebuilt, \{ share: true \}\);/);
  assert.match(page, /window\.solder\?\.onOVIEdited\(\(\{ id, key, follow \}\) => \{/);
});

test("an element of a cluster that follows a type definition cannot be deleted or cut, takes no new element, and keeps its label editable", () => {
  const linked = panelWithCluster([numeric("a", 4), boolean("b", true)]);
  const plain = panelWithCluster([numeric("a", 4), boolean("b", true)], null);
  const elementId = `${linked.id}.elements.0`;
  assert.equal(selectsLockedElement(linked.g, [elementId]), true);
  assert.equal(selectsLockedElement(plain.g, [`${plain.id}.elements.0`]), false, "a plain cluster's elements are free");
  assert.equal(selectsLockedElement(linked.g, [linked.id]), false, "the cluster itself is not an element");

  // Edit ▸ Cut, Copy and Delete are greyed and Delete does nothing (measured, Q4).
  const selected = { ...P.inicial(linked.g), seleccion: [elementId] };
  assert.equal(PC.hasSelection(selected), false);
  assert.equal(PC.selectionIsLocked(selected), true);
  assert.equal(P.borrarSeleccion(selected, () => [0, 0]), selected);
  const edit = editMenuVariants("front-panel", { canUndo: false, canRedo: false, canCopy: PC.hasSelection(selected), hasSelection: !PC.selectionIsLocked(selected), clipboardFilled: true });
  for (const name of ["cut", "copy", "delete"]) assert.ok(edit.desactivados.has(`window.front-panel.menu.edit.${name}`), name);
  assert.match(source(PAGE), /hasSelection: seleccion\.length > 0 && !\(conPanel && PC\.selectionIsLocked\(pan\)\),/);

  // An object dropped on it lands on the panel, outside it; a plain cluster still takes it.
  const inside = { x: 60, y: 70 };
  assert.equal(clusterAt(linked.g, inside), undefined);
  assert.equal(clusterAt(plain.g, inside)?.id, plain.id);
  const dropped = Gr.crearEnPanel(linked.g, CAT, "control", 60, 70, "x", {});
  assert.equal(dropObjects(dropped.g, CAT, [dropped.id], inside), null, "never added as an element");
  assert.equal(elementLabels(dropped.g, linked.id).length, 2);
  void definitionObjectOf;
});

test("an instance left behind is a Front Panel error with LabVIEW's two lines, and Show Error frames it", async () => {
  const { collect, PANEL_GROUP_TITLE } = await import("../../editor/src/debugging/error-list.mjs");
  const problem = { text: mismatchReason("Pt"), details: "You must right-click this control and select Update or Disconnect from Type Def.", node: 7, onPanel: true };
  const graph = { nodos: [], cables: [] };
  const [row] = collect({ graph, catalog: CAT, resolved: new Map(), hierarchyErrors: [problem], inventory: INV });
  assert.deepEqual({ text: row.text, details: row.details, target: row.target, group: row.group }, { text: problem.text, details: problem.details, target: { node: 7 }, group: PANEL_GROUP_TITLE });
  const [plain] = collect({ graph, catalog: CAT, resolved: new Map(), hierarchyErrors: ["The OVI \"x\" cannot be found."], inventory: INV });
  assert.deepEqual({ details: plain.details, target: plain.target, group: plain.group }, { details: "The OVI \"x\" cannot be found.", target: null, group: undefined });
});
