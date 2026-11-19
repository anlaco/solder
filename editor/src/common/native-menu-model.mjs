// The menus of a window as data for the docked window's native menu bar (DT-101 §7): the same rows LabVIEW's drawn menus
// show (diagram-view.mjs `menuContextual`), with the same variants (rows hidden, renamed, greyed or ticked), so the main
// process can build an Electron menu and send back the id of the row chosen. Pure.

import { esHueco } from "./labview-inventory.mjs";

/**
 * The menu bar of the window whose inventory id is `prefix` (`window.front-panel`): one entry per title, each with its
 * rows. `variantOf(menuId)` gives a menu's variants as `menuContextual` takes them, `marksOf(menuId)` its ticked rows.
 */
export function menuBarModel(inventory, prefix, { variantOf = () => ({}), marksOf = () => new Set() } = {}) {
  return inventory.hijos(`${prefix}.menu`).map((title) => ({
    id: title.id,
    label: title.etiqueta,
    hole: esHueco(inventory.resolver(title.id) ?? title),
    rows: rowsOf(inventory, title.id, variantOf(title.id), marksOf(title.id)),
  }));
}

function rowsOf(inventory, parent, variant, marks) {
  const { ocultos = new Set(), rotulos = new Map(), desactivados = new Set(), redirigidos = new Map(), separadores = new Map(), submenus = new Map() } = variant;
  const children = (submenus.get(parent) ?? inventory.hijos(parent)).filter((entry) => !ocultos.has(entry.id));
  return children.map((entry) => {
    const opensSubmenu = submenus.has(entry.id) || inventory.tieneContenido(entry.id);
    return {
      id: entry.id,
      label: rotulos.get(entry.id) ?? entry.etiqueta,
      shortcut: entry.atajo ?? null,
      enabled: !desactivados.has(entry.id),
      checked: marks.has(entry.id),
      hole: esHueco(entry) || redirigidos.has(entry.id),
      separatorBefore: separadores.get(entry.id) ?? !!entry.separado,
      rows: opensSubmenu ? rowsOf(inventory, entry.id, variant, marks) : null,
    };
  });
}

/** A row shown in a native menu: a hole keeps its place and says so, since a native menu cannot draw it in italics. */
export const rowLabel = (row) => (row.hole ? `${row.label}   (not yet)` : row.label);
