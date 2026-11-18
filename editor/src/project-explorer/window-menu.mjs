// The window list of the Window menu in the Project Explorer (DT-099 §6; measured in LabVIEW 2026 Q3, reports/2026-11-18-project-explorer-s3.md
// Q6): after Full Size come the OVI windows, then the Project Explorers, numbered continuously, and last All Windows....
// The main process gives the rows (electron/project-window-list.mjs); this turns them into what the menu draws. Pure.

import { PREFIX } from "./project-explorer-state.mjs";

export const WINDOW_MENU = `${PREFIX}.menu.window`;
/** The ids of the listed rows: the inventory has none of them, since the windows come and go. */
export const LISTED_ROW_PREFIX = `${WINDOW_MENU}.listed-`;

const ALL_WINDOWS = `${WINDOW_MENU}.all-windows`;

/** The index of a listed row from its id, or -1 when the id is not one. */
export const listedIndexOf = (id) => (id.startsWith(LISTED_ROW_PREFIX) ? Number(id.slice(LISTED_ROW_PREFIX.length)) : -1);

/**
 * What `menuContextual` needs to draw the Window menu with the listed windows: its fixed rows with the listed ones
 * before All Windows..., and a separator at the start of each group of listed rows.
 */
export function windowMenuVariant(inventory, rows) {
  const fixed = inventory.hijos(WINDOW_MENU);
  const listed = rows.map((row, index) => ({ id: `${LISTED_ROW_PREFIX}${index}`, etiqueta: row.label, estado: "built" }));
  const allWindowsAt = fixed.findIndex((entry) => entry.id === ALL_WINDOWS);
  const withListed = [...fixed.slice(0, allWindowsAt), ...listed, ...fixed.slice(allWindowsAt)];
  const separators = new Map(rows.map((row, index) => [`${LISTED_ROW_PREFIX}${index}`, row.startsGroup]));
  return { submenus: new Map([[WINDOW_MENU, withListed]]), separadores: separators };
}
