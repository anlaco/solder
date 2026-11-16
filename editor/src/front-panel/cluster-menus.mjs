// The right-click menu of a user's cluster shell on the panel (DT-095), as measured in LabVIEW 2026 Q3 (reports/
// 2026-11-16-cluster-panel.md §4). Its rows come from the inventory (`context.cluster-control`); this file knows what
// is ticked and what the rows built so far do. Every other row stays greyed with its reason (DT-035).

import * as Gr from "../../../core/model/graph.mjs";
import { labelShown, toggledItem } from "./graph-state.mjs";

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

/** Runs a row of the cluster's menu that is built (Visible Items ▸ Label); undefined for any other row, which only explains itself. */
export function clusterCommand(d, id) {
  const node = isClusterMenu(d) && menuNode(d);
  if (!node || id !== `${CLUSTER_MENU_ROOT}.visible-items.label`) return undefined;
  return { ...d, g: Gr.fijarConfig(d.g, node.id, toggledItem(node, "label")), menu: null };
}
