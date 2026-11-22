// What an OVI window's menus say about the project it belongs to (DT-099 stage d; measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-22-vi-window-menu.md). Window ▸ Show Project and the project rows of the File and
// Project menus act on the OVI's project and are greyed for an OVI outside one (outside a project only Create Project...
// and Open Project... are enabled, Q3); the Window menu lists the open windows (Q1, Q2). Pure.

import { listedWindowsVariant } from "../common/window-list-menu.mjs";

/** The rows that need a project, by the last segment of their id, in the Window, Project and File menus. */
const NEEDS_PROJECT = Object.freeze({
  window: ["show-project"],
  project: ["save-project", "close-project", "add-to-project", "package-dependencies", "filter-view", "show-item-paths", "file-information", "resolve-conflicts", "project-environment-settings", "properties"],
  file: ["save-project", "close-project"],
});

/** The Window menu of the window `kind` ("front-panel" or "block-diagram"). */
export const windowMenuId = (kind) => `window.${kind}.menu.window`;

/** The menu bar menu `menuId` of the window `kind`, by its last segment, or null when it is not one of this window. */
function menuOf(kind, menuId) {
  const prefix = `window.${kind}.menu.`;
  return menuId.startsWith(prefix) ? menuId.slice(prefix.length) : null;
}

/**
 * The variant of the menu `menuId` of an OVI window of `kind`: the rows that need a project greyed when `inProject` is
 * false, and in the Window menu the listed windows `windowRows` (project-window-list.mjs rows). Empty for other menus.
 */
export function projectMenuVariant(inventory, kind, menuId, { inProject, windowRows = [] }) {
  const menu = menuOf(kind, menuId);
  const greyed = !inProject && NEEDS_PROJECT[menu] ? new Set(NEEDS_PROJECT[menu].map((row) => `${menuId}.${row}`)) : new Set();
  const listed = menu === "window" ? listedWindowsVariant(inventory, menuId, windowRows) : {};
  return { ...listed, desactivados: greyed };
}

/** The commands of the menu rows that act on the OVI's project, by the last segment of their id: what the main process does with them. */
export const PROJECT_COMMANDS = Object.freeze({ "show-project": "show", "save-project": "save", "close-project": "close" });
