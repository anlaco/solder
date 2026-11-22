// The list of open windows in a Window menu, shared by the Project Explorer and the OVI windows (measured in LabVIEW 2026
// Q3: labview-captures/reports/2026-11-18-project-explorer-s3.md Q6 and 2026-11-22-vi-window-menu.md): after Full Size
// come the OVI windows, then the Project Explorers, numbered continuously, and last All Windows.... The main process gives
// the rows (electron/project-window-list.mjs); this turns them into what a menu draws. Pure.

/** The ids of the listed rows of the Window menu `windowMenuId`: the inventory has none of them, since the windows come and go. */
export const listedRowPrefix = (windowMenuId) => `${windowMenuId}.listed-`;

/** The index of a listed row from its id, or -1 when the id is not one. */
export function listedIndexOf(id) {
  const marker = ".listed-";
  const at = id.lastIndexOf(marker);
  return at < 0 ? -1 : Number(id.slice(at + marker.length));
}

/**
 * What a menu needs to draw the Window menu `windowMenuId` with the listed windows: its fixed rows with the listed ones
 * before All Windows..., and a separator at the start of each group of listed rows.
 */
export function listedWindowsVariant(inventory, windowMenuId, rows) {
  const prefix = listedRowPrefix(windowMenuId);
  const fixed = inventory.hijos(windowMenuId);
  const listed = rows.map((row, index) => ({ id: `${prefix}${index}`, etiqueta: row.label, estado: "built" }));
  const allWindowsAt = fixed.findIndex((entry) => entry.id === `${windowMenuId}.all-windows`);
  const withListed = [...fixed.slice(0, allWindowsAt), ...listed, ...fixed.slice(allWindowsAt)];
  const separators = new Map(rows.map((row, index) => [`${prefix}${index}`, row.startsGroup]));
  return { submenus: new Map([[windowMenuId, withListed]]), separadores: separators };
}
