// The right-click menus of Bundle and Unbundle on the Block Diagram (DT-095 stage d), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-bundle-unbundle.md Q6, local evidence never committed): Bundle has one menu for
// its body and its output and another for each input row, which adds Add Input and Remove Input; Unbundle has one for
// its body and its output rows. Their rows come from the inventory; this file knows which are greyed or hidden and what
// the built ones do. Every other row stays greyed with its reason (DT-035).
//
// Pure functions over the diagram's state `d`; diagram-editing.mjs only calls them.

import * as Gr from "../../../core/model/graph.mjs";
import { esNumerico } from "../../../core/model/types.mjs";
import { bundleRowCount } from "../../../core/model/cluster-node-ports.mjs";
import { addedRow, followsCluster, isBundle, removedRow, rowOfPort } from "./bundle-nodes.mjs";
import { bodyTerminalPort } from "./terminal-creation.mjs";

export const BUNDLE_MENU = "context.bundle";
export const BUNDLE_ROW_MENU = "context.bundle-row";
export const UNBUNDLE_MENU = "context.unbundle";

/** The menu root of a click on `node`: an input row of a Bundle has its own, every other place of either node the node's. */
export function menuRoot(node, port) {
  if (!isBundle(node)) return UNBUNDLE_MENU;
  return port !== undefined && port !== null && rowOfPort(port) >= 0 ? BUNDLE_ROW_MENU : BUNDLE_MENU;
}

/** Is the open menu one of Bundle's or Unbundle's? */
export const isBundleMenu = (d) => d.menu?.raiz === BUNDLE_MENU || d.menu?.raiz === BUNDLE_ROW_MENU || d.menu?.raiz === UNBUNDLE_MENU;

const CREATE_ON_TERMINAL = ["constant", "control", "indicator"];

/** The type that reaches or leaves port `port` of `node`, or undefined while it has none (nothing wired to an unwired row). */
function portType(g, cat, node, port) {
  const direction = cat.puertos(node).in.some((candidate) => candidate.name === port) ? "in" : "out";
  const types = Gr.tipos(g, cat);
  return (direction === "in" ? types.entradas : types.salidas).get(`${node.id}.${port}`);
}

/**
 * The rows that change with what the menu is on. Create ▸ Constant, Control and Indicator are greyed while the terminal's
 * type is undefined: LabVIEW crashed on Create ▸ Indicator on a Bundle output of undefined type (Fatal Internal Error,
 * Q6), so Solder never offers it; on an input row with no type yet the same holds (unverified). Numeric Palette shows on
 * a typed numeric row only (measured on Bundle's row; the Unbundle's is the same by its mirror, unverified). Remove
 * Input is greyed on the only row left of a Bundle that can be changed (unverified).
 */
export function menuVariants(d, ctx, node) {
  const root = d.menu.raiz;
  const port = d.menu.puerto ?? bodyTerminalPort(node);
  const type = port ? portType(d.g, ctx.cat, node, port) : undefined;
  const greyed = port && type === undefined ? CREATE_ON_TERMINAL.map((kind) => `${root}.create.${kind}`) : [];
  const onRow = rowOfPort(d.menu.puerto ?? "") >= 0;
  const hidden = onRow && esNumerico(type) ? [] : [`${root}.numeric-palette`];
  const lastRow = isBundle(node) && !followsCluster(node) && bundleRowCount(node) <= 1;
  const noRowsToSpare = lastRow ? [`${root}.remove-input`] : [];
  return { desactivados: new Set([...greyed, ...noRowsToSpare]), ocultos: new Set(hidden) };
}

/**
 * Runs the rows of these menus that are built: Add Input and Remove Input on an unwired-top Bundle. On one wired at the
 * top they leave the rows as they were (Add Input did nothing, Q6; Remove Input is unverified). Returns undefined for any
 * other row, which the generic commands run.
 */
export function menuCommand(d, id) {
  if (d.menu?.raiz !== BUNDLE_ROW_MENU) return undefined;
  const row = rowOfPort(d.menu.puerto);
  const change = id === `${BUNDLE_ROW_MENU}.add-input` ? addedRow : id === `${BUNDLE_ROW_MENU}.remove-input` ? removedRow : undefined;
  return change ? { ...d, g: change(d.g, d.menu.nodo, row), menu: null } : undefined;
}
