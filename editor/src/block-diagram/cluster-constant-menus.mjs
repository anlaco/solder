// The right-click menus of a Cluster Constant on the Block Diagram (DT-095 stage c2), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-16-cluster-diagram.md Q2 and 2026-11-17-cluster-constant-elements.md Q2, Q5-Q7, local
// evidence never committed): the frame has one menu (`context.cluster-constant`, 20 rows) and each element another
// (`context.cluster-constant-element`, 19). Their rows come from the inventory; this file knows what is ticked, what changes
// with the cluster and what the rows built so far do. Every other row stays greyed with its reason (DT-035).
//
// Pure functions over the diagram's state `d`; diagram-editing.mjs only calls them.

import * as Gr from "../../../core/model/graph.mjs";
import { DBL, NUMERICOS, POR_ABREVIATURA } from "../../../core/model/types.mjs";
import * as Et from "../common/labels.mjs";
import { startReorder } from "../front-panel/cluster-reorder.mjs";
import { elementNodeAt, withElementChanged } from "./cluster-constant.mjs";
import { changeToPanelCluster, createConstantCopy, createControl, createIndicator } from "./cluster-constant-panel.mjs";
import { ELEMENT_MENU, FRAME_MENU, parseElementId } from "./cluster-constant-geometry.mjs";

export { ELEMENT_MENU, FRAME_MENU };

/** Is the open menu a Cluster Constant's (its frame's or an element's)? */
export const isClusterConstantMenu = (d) => d.menu?.raiz === FRAME_MENU || d.menu?.raiz === ELEMENT_MENU;

const isElementMenu = (d) => d.menu?.raiz === ELEMENT_MENU;

/** The Cluster Constant the open menu is about: the one itself, or the one that holds the element. */
const clusterOfMenu = (d) => {
  const clusterId = isElementMenu(d) ? parseElementId(d.menu.nodo)?.clusterId : d.menu.nodo;
  return d.g.nodos.find((node) => node.id === clusterId);
};

/** The element's own node (a constant with its place), when the menu is an element's. */
const elementOfMenu = (d) => isElementMenu(d) && elementNodeAt(d.g, d.menu.nodo);

const NUMERIC_BLOCKS = new Set(["num-const", "const"]);

/** The rows LabVIEW ticks: AutoSizing None (the frame never grows, rule 140), the Label while shown, an element's representation. */
export function menuMarks(d) {
  const marks = new Set();
  if (!isClusterConstantMenu(d)) return marks;
  if (!isElementMenu(d)) {
    marks.add(`${FRAME_MENU}.autosizing.none`);
    if (clusterOfMenu(d)?.label) marks.add(`${FRAME_MENU}.visible-items.label`);
    return marks;
  }
  const element = elementOfMenu(d);
  if (element && NUMERIC_BLOCKS.has(element.tipo)) marks.add(`${ELEMENT_MENU}.representation.${NUMERICOS[element.config?.type ?? DBL].abrev.toLowerCase()}`);
  return marks;
}

/**
 * The rows that change with what the menu is on: Reorder Controls In Cluster... is greyed while the cluster is empty
 * (report Q2 of the panel's cluster, taken for the constant), and an element that is not numeric has no Representation nor
 * Display Format (the numeric element's rows were the only ones measured; unverified for the others).
 */
export function menuVariants(d) {
  if (!isClusterConstantMenu(d)) return {};
  if (isElementMenu(d)) {
    const isNumeric = NUMERIC_BLOCKS.has(elementOfMenu(d)?.tipo);
    return { ocultos: new Set(isNumeric ? [] : [`${ELEMENT_MENU}.representation`, `${ELEMENT_MENU}.display-format`]) };
  }
  const isEmpty = !clusterOfMenu(d)?.config.elements.length;
  return { desactivados: new Set(isEmpty ? [`${FRAME_MENU}.reorder-controls-in-cluster`] : []) };
}

// ——— What the rows do ———

const withoutLabel = ({ label: _label, ...node }) => node;

/**
 * Visible Items ▸ Label: shows the label, empty and in text edit as a new one, or hides it. A constant has none until
 * it is shown (the label's text "Cluster" is unverified; the report did not show it).
 */
function toggleLabel(d, cluster) {
  if (cluster.label) return { ...d, g: { ...d.g, nodos: d.g.nodos.map((node) => (node.id === cluster.id ? withoutLabel(node) : node)) }, menu: null };
  const g = Gr.fijarEtiqueta(d.g, cluster.id, "");
  return { ...d, g, menu: null, seleccion: [], edicion: { ...Et.editar(g.nodos.find((node) => node.id === cluster.id)), nuevo: true } };
}

/** The state after a command made panel cluster `made.id`: its label, "Cluster", is in text edit (report Q6, Q7). */
function typingLabelOfNew(d, made) {
  const terminal = made.g.nodos.find((node) => node.id === made.id);
  return { ...d, g: made.g, menu: null, aviso: null, seleccion: [], accion: null, edicion: { ...Et.editar(terminal), nuevo: true } };
}

/** Create ▸ Constant: the copy is left selected where it lands. */
const copied = (d, made) => ({ ...d, g: made.g, menu: null, aviso: null, seleccion: [made.id], accion: null });

/** Reorder Controls In Cluster...: the diagram's mode, the same state as the panel's (front-panel/cluster-reorder.mjs). */
const reordering = (d, cluster) => ({ ...d, menu: null, seleccion: [], reorder: startReorder(cluster) });

/** Representation ▸ of an element: that element takes the type, and the cluster's follows. */
function retypedElement(d, ctx, abbreviation) {
  const type = POR_ABREVIATURA[abbreviation];
  const element = elementOfMenu(d);
  if (!type || !element || !NUMERIC_BLOCKS.has(element.tipo)) return d;
  // The graph's own Representation, applied to the element as if it were a node of a graph of one.
  const retype = (stored) => {
    const { tipo, config } = Gr.fijarRepresentacion({ nodos: [{ id: "element", tipo: stored.tipo, config: stored.config }] }, "element", type).nodos[0];
    return { ...stored, tipo, config };
  };
  return { ...d, g: withElementChanged(d.g, ctx, d.menu.nodo, retype), menu: null };
}

/** Change to Control and Change to Indicator turn the whole constant, from its frame's menu or an element's (report Q6). */
const SHARED_COMMANDS = {
  "change-to-control": (d, ctx, cluster) => typingLabelOfNew(d, changeToPanelCluster(d.g, ctx, cluster.id, "control")),
  "change-to-indicator": (d, ctx, cluster) => typingLabelOfNew(d, changeToPanelCluster(d.g, ctx, cluster.id, "indicator")),
};

/** The rows of the frame's menu alone (an element's Visible Items and Create were not read). */
const FRAME_COMMANDS = {
  "visible-items.label": (d, ctx, cluster) => toggleLabel(d, cluster),
  "create.constant": (d, ctx, cluster) => copied(d, createConstantCopy(d.g, ctx, cluster.id)),
  "create.control": (d, ctx, cluster) => typingLabelOfNew(d, createControl(d.g, ctx, cluster.id)),
  "create.indicator": (d, ctx, cluster) => typingLabelOfNew(d, createIndicator(d.g, ctx, cluster.id)),
  "reorder-controls-in-cluster": (d, ctx, cluster) => (cluster.config.elements.length ? reordering(d, cluster) : d),
};

/**
 * Runs a row of a Cluster Constant's menus that is built; any other row of these menus changes nothing (it only
 * explains itself). Returns undefined when the open menu is not a Cluster Constant's.
 */
export function menuCommand(d, id, ctx) {
  if (!isClusterConstantMenu(d)) return undefined;
  const cluster = clusterOfMenu(d);
  const row = id.slice(d.menu.raiz.length + 1);
  if (!cluster) return d;
  if (isElementMenu(d) && row.startsWith("representation.")) return retypedElement(d, ctx, row.slice("representation.".length));
  const command = SHARED_COMMANDS[row] ?? (isElementMenu(d) ? undefined : FRAME_COMMANDS[row]);
  return command ? command(d, ctx, cluster) : d;
}
