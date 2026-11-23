// What a page does with the objects of its OVI that follow a type definition (DT-096 §4, DT-104 stage b), as measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-11-23-typedef-instances.md): Disconnect from Type Def., Auto-Update
// from Type Def., and the following itself, which is core/model/type-definition-follow.mjs over the editor's blocks.
// Pure functions over a graph; the page asks the questions and makes the edits.

import { followDefinitions, followsAutomatically } from "../../../core/model/type-definition-follow.mjs";
import { typeDefinitionLink } from "../../../core/model/type-definition.mjs";
import { elementBlock, elementConfig } from "../front-panel/cluster-panel.mjs";
import { BLOCK as CLUSTER_CONSTANT } from "../block-diagram/cluster-constant-geometry.mjs";
import { DBL } from "../../../core/model/types.mjs";
import { resolveRelative } from "../common/ovi-paths.mjs";

const AUTO_UPDATE_KEY = "auto-update";

/** The node of `g` with `id`, with its configuration changed by `change`; the rest as it is. */
const withConfigOf = (g, id, change) => ({ ...g, nodos: g.nodos.map((node) => (node.id === id ? { ...node, config: change(node.config) } : node)) });

/** The name of a definition's file, as the confirmation says it: the last part of its path (an untitled one is named by the main process). */
export const fileNameOfDefinition = (path) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The question Disconnect from Type Def. asks (measured on a panel control, a strict one and a Cluster Constant): `name`
 * is the object's label and `fileName` its definition's file. For an untitled definition `fileName` is its "Control N",
 * unmeasured: LabVIEW's own name for it was not seen in this dialog.
 */
export const disconnectQuestion = (name, fileName) => `Disconnect the control "${name}" from its Type Definition, "${fileName}"?`;

/** The graph with the object `id` no longer linked: its elements, values, default, label and place stay (measured). */
export const withoutTypeDefinition = (g, id) =>
  withConfigOf(g, id, ({ typedef: _link, ...config }) => config);

/**
 * The graph with Auto-Update from Type Def. of the object `id` toggled: unticked is stored as `"auto-update": false`
 * and ticking deletes the key, the default (measured: ticked by default, DT-096).
 */
export function withAutoUpdateToggled(g, id) {
  return withConfigOf(g, id, (config) => {
    const { [AUTO_UPDATE_KEY]: _own, ...link } = config.typedef;
    return { ...config, typedef: followsAutomatically(config.typedef) ? { ...link, [AUTO_UPDATE_KEY]: false } : link };
  });
}

/** A constant's block for each block of a control element: the opposite of cluster-constant-panel.mjs's `PANEL_BLOCK`. */
const CONSTANT_OF_CONTROL = { control: "num-const", indicator: "num-const", "bool-control": "bool-const", "bool-indicator": "bool-const", "str-control": "str-const", "str-indicator": "str-const" };

/** What a control element's configuration gives the constant: its representation and its default value as the value. */
function constantConfig(element) {
  const value = element.config?.value;
  if (element.tipo.startsWith("str")) return { value: value ?? "" };
  if (element.tipo.startsWith("bool")) return { value: !!value };
  return { type: element.config?.type ?? DBL, ...(value !== undefined && { value }) };
}

/** An element of a cluster in the definition, a control as the `.octl` holds it, as a cluster constant holds its elements: constants, with no label (DT-095). */
const constantElement = (element) => ({ tipo: CONSTANT_OF_CONTROL[element.tipo], config: constantConfig(element), x: element.x, y: element.y });

/** An element as the elements of a cluster of `block` hold them: controls for a control, indicators for an indicator; a cluster inside it, its own elements too. */
function panelElement(element, clusterBlock) {
  if (element.config?.elements) return { ...element, tipo: clusterBlock, config: { ...element.config, elements: element.config.elements.map((inner) => panelElement(inner, clusterBlock)) } };
  const tipo = elementBlock(element.tipo, clusterBlock);
  return { ...element, tipo, config: elementConfig(element.config, tipo) };
}

/**
 * An element of the definition (a control, as the `.octl` holds it) as `instance` holds its elements: controls in a
 * cluster control, indicators in an indicator, constants in a Cluster Constant (type-definition-update.mjs asks for it).
 */
export const toInstanceElement = (element, instance) =>
  instance.tipo === CLUSTER_CONSTANT ? constantElement(element) : panelElement(element, instance.tipo);

/**
 * `g` with the objects it follows made to follow their definitions (core/model/type-definition-follow.mjs). `typeDefinitions`
 * is the hierarchy's map of definition keys to what each holds (null when missing, an error of the hierarchy); `apply`
 * and `only` (the ids of the objects to follow, all by default) say which are updated and which are left behind.
 * Returns `{ g, broken }`: the graph and the Error list's texts of the instances left behind.
 */
export function followedTypeDefinitions(catalog, g, { typeDefinitions, oviKey, oviLibRoot, apply, only }) {
  const definitionOf = (node) => (only && !only.includes(node.id) ? null : typeDefinitions.get(resolveRelative(oviKey, typeDefinitionLink(node).path, oviLibRoot))?.object ?? null);
  const followed = followDefinitions(catalog, g, definitionOf, { apply, toInstanceElement });
  return { g: followed.g, broken: followed.broken };
}

/**
 * The Error list's row of an instance left behind its definition: its text, the line that says what to do, and the
 * object, under Front Panel Errors when it is a panel object (measured, reports/2026-11-23-typedef-instances.md Q2; a
 * constant's group was not seen, so it stays with the Block Diagram's).
 */
const problemRow = (entry, g, catalog) => {
  const node = g.nodos.find((candidate) => candidate.name === entry.node);
  return { text: entry.motivo, details: entry.detail, node: node?.id, onPanel: !!(node && catalog.bloque(node.tipo)?.panel) };
};

/**
 * What a page remembers of its objects' definitions (the hierarchy's map, as it was last built) and of the instances that
 * were left behind them, which break the OVI (Run is broken, the Error list says why). `follow(g, ...)` makes the
 * objects of `g` follow and remembers who was left behind; `problems(g, catalog)` gives the Error list's rows
 * (`problemRow`) of those that are still left behind in `g` (an object that was disconnected or deleted since no longer is).
 */
export function createFollower() {
  let typeDefinitions = new Map();
  let broken = [];
  const linkedNames = (g) => new Set(g.nodos.filter((node) => typeof typeDefinitionLink(node)?.path === "string").map((node) => node.name));
  return {
    know(definitions) {
      typeDefinitions = definitions;
    },
    follow(g, { catalog, oviKey, oviLibRoot, apply, only }) {
      const followed = followedTypeDefinitions(catalog, g, { typeDefinitions, oviKey, oviLibRoot, apply, only });
      const rechecked = new Set(g.nodos.filter((node) => !only || only.includes(node.id)).map((node) => node.name));
      broken = [...broken.filter((entry) => !rechecked.has(entry.node)), ...followed.broken];
      return followed.g;
    },
    problems(g, catalog) {
      const linked = linkedNames(g);
      return broken.filter((entry) => linked.has(entry.node)).map((entry) => problemRow(entry, g, catalog));
    },
  };
}
