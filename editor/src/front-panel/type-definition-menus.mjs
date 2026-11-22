// The rows a type definition (DT-096, DT-104) changes in an object's right-click menu, as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-typedef-update.md Q4, 2026-11-17-typedef-editor-entry.md Q2). An object that
// follows no `.octl` shows Make Type Def.; one that follows one shows, in its place, Review and Update from Type Def...,
// Auto-Update from Type Def. (ticked; a strict instance has no such row), Open Type Def., Disconnect from Type Def., Show
// OVI Hierarchy and Explore.... The inventory lists both groups under the menu's root; this file hides the group that
// does not apply. Pure, as the other menu files.

import { typeDefinitionLink } from "../../../core/model/type-definition.mjs";

const MAKE_ROW = "make-type-def";
const AUTO_UPDATE_ROW = "auto-update-from-type-def";
const LINKED_ROWS = ["review-and-update-from-type-def", AUTO_UPDATE_ROW, "open-type-def", "disconnect-from-type-def", "show-vi-hierarchy", "explore"];

const menuNode = (d) => d.menu && d.g.nodos.find((node) => node.id === d.menu.nodo);

/**
 * The menus whose objects Make Type Def. is built for (DT-104 stages a2, a2b): the panel cluster, the Cluster Constant's
 * frame and the Numeric Constant. The other roots' Make Type Def. rows stay greyed with their reason.
 */
export const TYPE_DEFINITION_MENU_ROOTS = new Set(["context.cluster-control", "context.cluster-constant", "context.numeric-constant"]);

const isTypeDefinitionMenu = (d) => TYPE_DEFINITION_MENU_ROOTS.has(d.menu?.raiz);

/** The link of the object the open menu is about (`{ path, strict }`), or null when it follows no type definition. */
export const menuTypeDefinitionLink = (d) => {
  const link = typeDefinitionLink(menuNode(d));
  return typeof link?.path === "string" ? link : null;
};

/** The variants of the open menu: the rows its object's link hides (none outside those menus). */
export const typeDefinitionVariants = (d) =>
  isTypeDefinitionMenu(d) ? { ocultos: typeDefinitionHiddenRows(d), desactivados: new Set([...unbuiltMakeRow(d), ...fixedByDefinition(d)]) } : {};

/** What a linked Numeric Constant may not change, its type being the definition's: greyed (reports/2026-11-22-typedef-from-constants.md Q1). */
const FIXED_BY_DEFINITION = { "context.numeric-constant": ["adapt-to-entered-data", "representation"] };
const fixedByDefinition = (d) => (menuTypeDefinitionLink(d) ? (FIXED_BY_DEFINITION[d.menu.raiz] ?? []).map((name) => `${d.menu.raiz}.${name}`) : []);

/**
 * The Numeric Constant's menu is also the one of the other constants typed into (diagram-view.mjs `menuDe`): Make Type
 * Def. is built for the numeric ones only, and greyed on the others, whose type definitions were not measured.
 */
const NUMERIC_CONSTANTS = new Set(["num-const", "const"]);
const unbuiltMakeRow = (d) =>
  new Set(d.menu.raiz === "context.numeric-constant" && !NUMERIC_CONSTANTS.has(menuNode(d)?.tipo) ? [`${d.menu.raiz}.${MAKE_ROW}`] : []);

/** The rows the object's link hides: the linked group without a link, Make Type Def. with one. */
function typeDefinitionHiddenRows(d) {
  const row = (name) => `${d.menu.raiz}.${name}`;
  const link = menuTypeDefinitionLink(d);
  if (!link) return new Set(LINKED_ROWS.map(row));
  return new Set([row(MAKE_ROW), ...(link.strict ? [row(AUTO_UPDATE_ROW)] : [])]);
}

/** The rows ticked: Auto-Update from Type Def. on an instance that is not strict (measured ticked by default). */
export const typeDefinitionMarks = (d) => {
  const link = isTypeDefinitionMenu(d) && menuTypeDefinitionLink(d);
  return new Set(link && !link.strict ? [`${d.menu.raiz}.${AUTO_UPDATE_ROW}`] : []);
};
