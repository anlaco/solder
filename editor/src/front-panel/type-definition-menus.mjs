// The rows a type definition (DT-096, DT-104) changes in an object's right-click menu, as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-typedef-update.md Q4, 2026-11-17-typedef-editor-entry.md Q2). An object that
// follows no `.octl` shows Make Type Def.; one that follows one shows, in its place, Review and Update from Type Def...,
// Auto-Update from Type Def. (ticked; a strict instance has no such row), Open Type Def., Disconnect from Type Def., Show
// OVI Hierarchy and Explore.... The inventory lists both groups under the menu's root; this file hides the group that
// does not apply. Pure, as the other menu files.

import { followsAutomatically } from "../../../core/model/type-definition-follow.mjs";
import { typeDefinitionLink } from "../../../core/model/type-definition.mjs";

const MAKE_ROW = "make-type-def";
const AUTO_UPDATE_ROW = "auto-update-from-type-def";
const LINKED_ROWS = ["review-and-update-from-type-def", AUTO_UPDATE_ROW, "open-type-def", "disconnect-from-type-def", "show-vi-hierarchy", "explore"];

const menuNode = (d) => d.menu && d.g.nodos.find((node) => node.id === d.menu.nodo);

/**
 * The menus whose objects Make Type Def. is built for (DT-104 stages a2, a2b): the panel cluster, the Cluster Constant's
 * frame, the Numeric Constant and the panel Numeric control. The other roots' Make Type Def. rows stay greyed with their reason.
 */
export const TYPE_DEFINITION_MENU_ROOTS = new Set(["context.cluster-control", "context.cluster-constant", "context.numeric-constant", "context.numeric-panel-control"]);

const isTypeDefinitionMenu = (d) => TYPE_DEFINITION_MENU_ROOTS.has(d.menu?.raiz);

/** The link of the object the open menu is about (`{ path, strict }`), or null when it follows no type definition. */
export const menuTypeDefinitionLink = (d) => {
  const link = typeDefinitionLink(menuNode(d));
  return typeof link?.path === "string" ? link : null;
};

/** The variants of the open menu: the rows its object's link hides (none outside those menus). */
export const typeDefinitionVariants = (d) =>
  isTypeDefinitionMenu(d)
    ? { ocultos: typeDefinitionHiddenRows(d), desactivados: new Set([...unbuiltMakeRow(d), ...fixedByDefinition(d)]), separadores: typeDefinitionSeparators(d) }
    : {};

/**
 * What a linked object may not change, its type being the definition's: greyed. A Numeric Constant's representation
 * (reports/2026-11-22-typedef-from-constants.md Q1); a panel cluster's order of elements (greyed while linked, enabled
 * after Disconnect: reports/2026-11-23-typedef-instances.md Q1).
 */
const FIXED_BY_DEFINITION = {
  "context.numeric-constant": ["adapt-to-entered-data", "representation"],
  "context.cluster-control": ["reorder-controls-in-cluster"],
  // By analogy with the Numeric Constant: unverified for the panel Numeric control, whose Representation was not measured linked.
  "context.numeric-panel-control": ["representation"],
};
const fixedByDefinition = (d) => (menuTypeDefinitionLink(d) ? (FIXED_BY_DEFINITION[d.menu.raiz] ?? []).map((name) => `${d.menu.raiz}.${name}`) : []);

/**
 * The Numeric Constant's menu is also the one of the other constants typed into (diagram-view.mjs `menuDe`): Make Type
 * Def. is built for the numeric ones only, and greyed on the others, whose type definitions were not measured.
 */
const NUMERIC_CONSTANTS = new Set(["num-const", "const"]);
const unbuiltMakeRow = (d) =>
  new Set(d.menu.raiz === "context.numeric-constant" && !NUMERIC_CONSTANTS.has(menuNode(d)?.tipo) ? [`${d.menu.raiz}.${MAKE_ROW}`] : []);

/**
 * The rows a link moves or swaps, per menu: shown on an instance (`linked`), hidden on the free object (`unlinked`). On a
 * constant Find ▸ is added after Change to Array and Description and Tip... moves after Replace ▸
 * (reports/2026-11-22-typedef-from-constants.md Q1, Q3); on the panel cluster Find ▸ takes the place of Find Terminal
 * and Fit Control to Pane and Scale Object with Pane go (reports/2026-11-23-typedef-instances.md Q1).
 */
const CONSTANT_SWAP = { linked: ["find", "description-and-tip-linked"], unlinked: ["description-and-tip"] };
const SWAPPED_ROWS = {
  "context.numeric-constant": CONSTANT_SWAP,
  "context.cluster-constant": CONSTANT_SWAP,
  "context.cluster-control": { linked: ["find"], unlinked: ["find-terminal", "fit-control-to-pane", "scale-object-with-pane"] },
  // By analogy with the panel cluster (unverified for the numeric: only the type definition rows were measured, reports/2026-11-25-placing-a-control.md Q1):
  // Fit Control to Pane and Scale Object with Pane go. Its Find ▸ is one row already, shown in both states.
  "context.numeric-panel-control": { linked: [], unlinked: ["fit-control-to-pane", "scale-object-with-pane"] },
};

/** The rows the object's link hides: the linked group and rows without a link, Make Type Def. and the free rows with one. */
function typeDefinitionHiddenRows(d) {
  const row = (name) => `${d.menu.raiz}.${name}`;
  const swapped = SWAPPED_ROWS[d.menu.raiz] ?? { linked: [], unlinked: [] };
  const link = menuTypeDefinitionLink(d);
  if (!link) return new Set([...LINKED_ROWS, ...swapped.linked].map(row));
  return new Set([MAKE_ROW, ...swapped.unlinked, ...(link.strict ? [AUTO_UPDATE_ROW] : [])].map(row));
}

/** On a linked constant Data Operations ▸ opens a group of its own, after Description and Tip... (Q1, Q3). */
const typeDefinitionSeparators = (d) =>
  menuTypeDefinitionLink(d) && SWAPPED_ROWS[d.menu.raiz] === CONSTANT_SWAP ? new Map([[`${d.menu.raiz}.data-operations`, true]]) : new Map();

/** The rows ticked: Auto-Update from Type Def. on an instance that is not strict, ticked by default and until it is unticked (measured). */
export const typeDefinitionMarks = (d) => {
  const link = isTypeDefinitionMenu(d) && menuTypeDefinitionLink(d);
  return new Set(link && !link.strict && followsAutomatically(link) ? [`${d.menu.raiz}.${AUTO_UPDATE_ROW}`] : []);
};
