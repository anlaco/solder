// Which entries of a palette the window shows, shared by the palette itself and by Replace ▸ of a panel object, which
// opens the Controls palette as a submenu (DT-092): the two must list the same things.

import { ultimo } from "./labview-inventory.mjs";

/** The entries that live in a palette's title bar and its foot, not in its grid. */
export const PALETTE_TITLE_ENTRIES = ["thumbtack", "search"];
export const PALETTE_FOOT_ENTRIES = ["double-arrows", "change-visible-palettes"];

/** The entries of palette `id` that are shown by default: its elements, in LabVIEW's order, without the hidden ones. */
export function paletteElements(inv, id) {
  const chrome = [...PALETTE_TITLE_ENTRIES, ...PALETTE_FOOT_ENTRIES];
  return inv.hijos(id).filter((entry) => !chrome.includes(ultimo(entry.id)) && !entry.oculto);
}
