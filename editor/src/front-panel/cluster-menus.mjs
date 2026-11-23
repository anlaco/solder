// The right-click menu of a user's cluster shell on the panel (DT-095), as measured in LabVIEW 2026 Q3 (reports/
// 2026-11-16-cluster-panel.md §4). Its rows come from the inventory (`context.cluster-control`); this file knows what
// is ticked and what the rows built so far do. Every other row stays greyed with its reason (DT-035).

import * as Gr from "../../../core/model/graph.mjs";
import { labelShown, toggledItem } from "./graph-state.mjs";
import { flipCluster } from "./cluster-panel.mjs";
import { startReorder } from "./cluster-reorder.mjs";
import { foldClusters } from "./cluster-unfolding.mjs";

export const CLUSTER_MENU_ROOT = "context.cluster-control";

const menuNode = (d) => d.menu && d.g.nodos.find((node) => node.id === d.menu.nodo);

/** Is the open menu a user's cluster's? */
export const isClusterMenu = (d) => d.menu?.raiz === CLUSTER_MENU_ROOT;

/**
 * The rows LabVIEW ticks: Caption (measured ticked on the shell, though its label class is unclear), the Label while it is
 * shown, and AutoSizing None, the shell's only mode here (a shell never grows when elements are dropped in).
 */
export function clusterMenuMarks(d) {
  const node = menuNode(d);
  const marks = new Set([`${CLUSTER_MENU_ROOT}.visible-items.caption`, `${CLUSTER_MENU_ROOT}.autosizing.none`]);
  if (node && labelShown(node)) marks.add(`${CLUSTER_MENU_ROOT}.visible-items.label`);
  return marks;
}

const LABEL_ROW = `${CLUSTER_MENU_ROOT}.visible-items.label`;
const CHANGE_TO_INDICATOR_ROW = `${CLUSTER_MENU_ROOT}.change-to-indicator`;
const MAKE_TYPE_DEF_ROW = `${CLUSTER_MENU_ROOT}.make-type-def`;
const REORDER_ROW = `${CLUSTER_MENU_ROOT}.reorder-controls-in-cluster`;

/** Does the cluster hold elements: its own (folded) or the objects inside it (the panel's unfolded graph, DT-106)? */
const hasElementsNow = (g, node) => !!node && ((node.config?.elements?.length ?? 0) > 0 || g.nodos.some((other) => other.inside === node.id));

/**
 * The rows that change with the cluster: Change to Control on an indicator (report §6), Reorder Controls In
 * Cluster... greyed while the cluster is empty (report §3), and Make Type Def. greyed on an indicator. The rows of a
 * type definition are type-definition-menus.mjs's, as for every object that has them.
 */
export function clusterMenuVariants(d) {
  const node = menuNode(d);
  const rotulos = new Map(node?.tipo === "cluster-indicator" ? [[CHANGE_TO_INDICATOR_ROW, "Change to Control"]] : []);
  const desactivados = new Set(hasElementsNow(d.g, node) ? [] : [REORDER_ROW]);
  // On an indicator Make Type Def. looked greyed (reports/2026-11-17-typedef-editor-entry.md Q1, at half scale: unverified).
  if (node?.tipo === "cluster-indicator") desactivados.add(MAKE_TYPE_DEF_ROW);
  return { rotulos, desactivados };
}

/**
 * Runs a row of the cluster's menu that is built (Visible Items ▸ Label, Change to Indicator or to Control, Reorder
 * Controls In Cluster..., which puts the panel in its mode); undefined for any other row, which only explains itself.
 */
/**
 * The panel in the mode that sets the order of `node`'s elements. The mode works on the cluster's own list, so the panel's
 * graph is folded while it lasts, and ✓ unfolds it again (`unfoldAfter`, cluster-reorder.mjs).
 */
function reorderingOf(d, node, cat) {
  const folded = foldClusters(d.g, cat);
  const unfoldAfter = d.g.nodos.some((other) => other.inside !== undefined);
  return { ...d, g: folded, menu: null, seleccion: [], reorder: { ...startReorder(folded.nodos.find((other) => other.id === node.id)), unfoldAfter } };
}

export function clusterCommand(d, id, cat) {
  const node = isClusterMenu(d) && menuNode(d);
  if (!node) return undefined;
  if (id === LABEL_ROW) return { ...d, g: Gr.fijarConfig(d.g, node.id, toggledItem(node, "label")), menu: null };
  if (id === CHANGE_TO_INDICATOR_ROW) return { ...d, g: flipCluster(d.g, cat, node.id), menu: null };
  if (id === REORDER_ROW && hasElementsNow(d.g, node)) return reorderingOf(d, node, cat);
  return undefined;
}
