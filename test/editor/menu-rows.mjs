// Reading a right-click menu as text, for the tests: the rows a menu or one of its submenus draws, with their ticks,
// their greying and the separator before each. Not a test file.

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

/** The rows of the open menu (or of the submenu `parent`): label, greyed, ticked, and whether a separator comes before. */
export function menuRows(d, parent = d.menu.raiz) {
  const drawing = D.menuContextual(INV, { ...d.menu, x: 0, y: 0 }, ED.marcados(d, CTX), (text) => text.length * 6, ED.variantes(d, CTX));
  const menu = drawing.split('<div class="menu-contextual"').find((part) => part.includes(`data-menu="${parent}"`));
  return [...menu.matchAll(/(<div class="separador-menu"[^>]*><\/div>)?<div class="item-menu([^"]*)" data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => ({
    id: m[3], label: m[4].replaceAll("&amp;", "&"), greyed: /hueco|desactivado/.test(m[2]), separated: !!m[1], checked: /marcado/.test(m[2]),
  }));
}

/** Opens the submenus of `ids`, one in the other, as hovering them does. */
export const hover = (d, ...ids) => ids.reduce((menu, id) => ED.sobreMenu(menu, id, true), d);

/** The labels of the rows, with "---" where a separator is. */
export const shown = (rows) => rows.flatMap((row) => (row.separated ? ["---", row.label] : [row.label]));
