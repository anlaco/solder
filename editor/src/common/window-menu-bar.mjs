// The menu bar of the windows that draw their own (Polymorphic OVI, Project Explorer): the titles declared under
// `<prefix>.menu` in the inventory, in LabVIEW's order, a title that is not done drawn as a hole.

import { esHueco } from "./labview-inventory.mjs";

/** The height of the bar the page draws itself, in pixels (as the Getting Started window's). */
export const MENU_BAR_HEIGHT = 20;

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const holeClass = (inventory, id) => (esHueco(inventory.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/**
 * The bar of a window. `prefix` is the window's inventory id (`window.polymorphic-ovi`), `barClass` the class that
 * places it in the window's own stylesheet, and `state.menuBarra` the menu that is open, if any.
 */
export function menuBarHtml(inventory, state, prefix, barClass) {
  const titles = inventory
    .hijos(`${prefix}.menu`)
    .map((entry) => {
      const open = state.menuBarra?.id === entry.id ? " abierto" : "";
      return `<div class="menu${holeClass(inventory, entry.id)}${open}" data-id="${escapeHtml(entry.id)}"><span class="medida">${escapeHtml(entry.etiqueta)}</span><span class="texto">${escapeHtml(entry.etiqueta)}</span></div>`;
    })
    .join("");
  return `<div class="cabecera ${barClass}" style="height:${MENU_BAR_HEIGHT}px"><div class="menus" style="height:${MENU_BAR_HEIGHT - 1}px">${titles}</div></div>`;
}
