// The New dialog drawn as HTML. The rectangles are read off labview-captures/polymorphic-window/new2.png (802 x 632 with
// its title bar), not measured by script: the sizes of the boxes and the buttons are approximate; the tree and the
// description are what was captured.

import { esHueco } from "../common/labview-inventory.mjs";
import * as V from "../window/window-view.mjs";
import { PREFIX, TREE, acceptedCreation, descriptionOf, entryId } from "./new-dialog-state.mjs";

export const TITLE_BAR_HEIGHT = 33;
export const WINDOW_SIZE = Object.freeze({ width: 802, height: 632 });
const ROW_HEIGHT = 17;
const INDENT = 16;

const LAYOUT = Object.freeze({
  treeLabel: { x: 18, y: 55 },
  tree: { x: 18, y: 66, width: 448, height: 513 },
  descriptionLabel: { x: 472, y: 55 },
  description: { x: 472, y: 66, width: 294, height: 424 },
  addToProject: { x: 472, y: 517 },
  ok: { x: 547, y: 593, width: 76, height: 21 },
  cancel: { x: 629, y: 593, width: 76, height: 21 },
  help: { x: 711, y: 593, width: 76, height: 21 },
});

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (value) => `${value}px`;
const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");
const at = ({ x, y, width, height }) => `left:${px(x)};top:${px(y - TITLE_BAR_HEIGHT)}${width === undefined ? "" : `;width:${px(width)};height:${px(height)}`}`;

/** The rows of the tree: each folder, expanded, then its items (a folder with nothing done in it is greyed). */
function tree(inv, state) {
  let top = 0;
  const row = (html) => {
    const drawn = html(top);
    top += ROW_HEIGHT;
    return drawn;
  };
  return TREE.flatMap((folder) => [
    row((y) => `<div class="nd-row nd-folder${holeClass(inv, entryId(folder.id))}" data-id="${entryId(folder.id)}" style="top:${px(y)};height:${px(ROW_HEIGHT)}"><span class="nd-label" style="left:0">${esc(folder.label)}</span></div>`),
    ...folder.children.map((item) =>
      row((y) => `<div class="nd-row nd-item${holeClass(inv, entryId(item.id))}${state.selected === item.id ? " seleccionada" : ""}" data-id="${entryId(item.id)}" data-item="${item.id}" style="top:${px(y)};height:${px(ROW_HEIGHT)}"><span class="nd-label" style="left:${px(INDENT)}">${esc(item.label)}</span></div>`),
    ),
  ]).join("");
}

function explanation(inv, opened) {
  const entry = opened && inv.resolver(opened.id);
  if (!entry) return "";
  return `<div class="explicacion" data-explicacion="${esc(opened.id)}" style="left:${opened.x}px;top:${opened.y}px">${V.explicacion(inv, entry)}</div>`;
}

/** The whole dialog. */
export function newDialog(inv, state) {
  const L = LAYOUT;
  const button = (key, label, box, enabled = true, isDefault = false) =>
    `<div class="pv-boton nd-button${isDefault ? " defecto" : ""}${enabled ? "" : " desactivado"}${holeClass(inv, `${PREFIX}.${key}`)}" data-id="${PREFIX}.${key}" style="${at(box)}">${label}</div>`;
  return `<div class="nd-window">
  <div class="nd-text" style="${at(L.treeLabel)}">Create New</div>
  <div class="nd-tree" style="${at(L.tree)}">${tree(inv, state)}</div>
  <div class="nd-text" style="${at(L.descriptionLabel)}">Description</div>
  <div class="nd-description" style="${at(L.description)}">${esc(descriptionOf(state))}</div>
  <div class="nd-check${holeClass(inv, `${PREFIX}.add-to-project`)}" data-id="${PREFIX}.add-to-project" style="${at(L.addToProject)}"><span class="pv-casilla"></span><span>Add to project</span></div>
  ${button("ok", "OK", L.ok, acceptedCreation(state) !== null, true)}${button("cancel", "Cancel", L.cancel)}${button("help", "Help", L.help)}
  ${explanation(inv, state.abierta)}
</div>`;
}

