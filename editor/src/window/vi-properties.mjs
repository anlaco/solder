// VI Properties, with the Execution page (DT-045, spec/05 §12). Measured in
// LabVIEW 2026 Q3: labview-captures/subvi/vi-properties-execution-default.png
// and vi-properties-category-list.png.
//
// Pure: the dialog is a state, `open` creates it from the VI, `choose` changes
// it and `apply` writes it back into the VI when OK is pressed. Only the
// reentrancy choices Non-reentrant and Preallocated clone work; the rest of the
// page is shown greyed out with its reason (the inventory, rule 55).

import { esHueco } from "../common/labview-inventory.mjs";

export const DIALOG_ID = "dialog.vi-properties";
export const CATEGORIES_ID = `${DIALOG_ID}.categories`;
const EXECUTION = `${DIALOG_ID}.execution`;

/** The reentrancy options in the order of the page, with the value `vi.execution.reentrancy` takes. */
export const REENTRANCY_OPTIONS = [
  { id: `${EXECUTION}.non-reentrant-execution`, value: "non-reentrant", label: "Non-reentrant execution" },
  { id: `${EXECUTION}.shared-clone-reentrant-execution`, value: "shared-clone", label: "Shared clone reentrant execution" },
  { id: `${EXECUTION}.preallocated-clone-reentrant-execution`, value: "preallocated", label: "Preallocated clone reentrant execution" },
];

/**
 * The dialog as LabVIEW draws it, in px from the top left corner of the dialog
 * (the capture has it at 507, 175 and 640 × 380), and the checkboxes and
 * combo boxes of the page that are not done yet, with what they show.
 */
export const LAYOUT = {
  width: 640,
  height: 380,
  title: { height: 30 },
  categoryLabel: { x: 155, y: 48 },
  categoryBox: { x: 211, y: 37, width: 227, height: 22 },
  page: { x: 6, y: 73, width: 624, height: 262 },
  button: { y: 350, width: 71, height: 21, ok: 401, cancel: 482, help: 562 },
  reentrancy: { x: 20, y: 115, width: 286, height: 185, firstOption: 136, optionStep: 31.5, optionX: 48, noteY: 233 },
};

const CHECKBOXES = [
  { id: `${EXECUTION}.allow-debugging`, label: "Allow debugging", x: 30, y: 90, checked: true },
  { id: `${EXECUTION}.inline-subvi-into-calling-vis`, label: "Inline subVI into calling VIs", x: 36, y: 320, checked: false },
  { id: `${EXECUTION}.enable-automatic-error-handling`, label: "Enable automatic error handling", x: 349, y: 199, checked: true },
  { id: `${EXECUTION}.run-when-opened`, label: "Run when opened", x: 349, y: 223, checked: false },
  { id: `${EXECUTION}.suspend-when-called`, label: "Suspend when called", x: 349, y: 247, checked: false },
  { id: `${EXECUTION}.clear-indicators-when-called`, label: "Clear indicators when called", x: 349, y: 271, checked: false },
  { id: `${EXECUTION}.auto-handle-menus-at-launch`, label: "Auto handle menus at launch", x: 349, y: 295, checked: true },
];
const COMBOS = [
  { id: `${EXECUTION}.priority`, label: "Priority", shown: "normal priority", x: 344, labelY: 92, boxY: 104 },
  { id: `${EXECUTION}.preferred-execution-system`, label: "Preferred Execution System", shown: "same as caller", x: 344, labelY: 140, boxY: 152 },
];
const COMBO_BOX = { width: 200, height: 20 };

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/** The dialog for a VI: showing the Execution page, with the VI's reentrancy. */
export const open = (g) => ({ page: "execution", reentrancy: g.vi?.execution?.reentrancy ?? "non-reentrant" });

/** Chooses a reentrancy option. A greyed one (shared clones) is not available and changes nothing. */
export function choose(dialog, reentrancy) {
  return reentrancy === "non-reentrant" || reentrancy === "preallocated" ? { ...dialog, reentrancy } : dialog;
}

/** The VI with what the dialog says. Non-reentrant is the default, so it is not stored. */
export function apply(g, dialog) {
  const { execution: previous, ...rest } = g.vi ?? {};
  const { reentrancy: _old, ...others } = previous ?? {};
  const execution = dialog.reentrancy === "non-reentrant" ? others : { ...others, reentrancy: dialog.reentrancy };
  const vi = Object.keys(execution).length ? { ...rest, execution } : rest;
  return { ...g, vi: Object.keys(vi).length ? vi : undefined };
}

/** The class of an element of the page: greyed out and italic when the inventory says it is not done. */
const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

function checkbox(inv, { id, label, x, y, checked }) {
  return `<div class="pv-check${holeClass(inv, id)}${checked ? " marcada" : ""}" data-id="${esc(id)}" style="left:${px(x)};top:${px(y)}"><span class="pv-casilla"></span><span class="pv-texto">${esc(label)}</span></div>`;
}

function comboBox(inv, { id, label, shown, x, labelY, boxY }) {
  return `<div class="pv-etiqueta" style="left:${px(x)};top:${px(labelY)}">${esc(label)}</div>` +
    `<div class="pv-combo${holeClass(inv, id)}" data-id="${esc(id)}" style="left:${px(x)};top:${px(boxY)};width:${px(COMBO_BOX.width)};height:${px(COMBO_BOX.height)}"><span class="pv-texto">${esc(shown)}</span><span class="pv-flecha"></span></div>`;
}

function reentrancyGroup(inv, dialog) {
  const R = LAYOUT.reentrancy;
  const options = REENTRANCY_OPTIONS.map((option, i) => {
    const selected = dialog.reentrancy === option.value;
    return `<div class="pv-radio${holeClass(inv, option.id)}${selected ? " marcada" : ""}" data-id="${esc(option.id)}" style="left:${px(R.optionX)};top:${px(R.firstOption + i * R.optionStep)}"><span class="pv-casilla redonda"></span><span class="pv-texto">${esc(option.label)}</span></div>`;
  }).join("");
  const note = "Reentrancy decides whether several calls to this VI can run at the same time, and whether each call keeps a state of its own.";
  return `<div class="pv-grupo" style="left:${px(R.x)};top:${px(R.y)};width:${px(R.width)};height:${px(R.height)}"><span class="pv-grupo-titulo">Reentrancy</span></div>${options}<div class="pv-nota" style="left:${px(R.optionX - 5)};top:${px(R.noteY)};width:${px(R.width - 20)}">${esc(note)}</div>`;
}

/**
 * The dialog, modal over the window. `data-id` ties each element to the inventory
 * (dialog.vi-properties.*): the ones that are not done are greyed out and, when
 * clicked, say why.
 */
export function view(inv, dialog) {
  const L = LAYOUT;
  const box = L.categoryBox;
  const buttons = [
    { key: "ok", label: "OK", defaultButton: true },
    { key: "cancel", label: "Cancel" },
    { key: "help", label: "Help" },
  ]
    .map(({ key, label, defaultButton }) => `<div class="pv-boton${defaultButton ? " defecto" : ""}${holeClass(inv, `${DIALOG_ID}.${key}`)}" data-id="${DIALOG_ID}.${key}" style="left:${px(L.button[key])};top:${px(L.button.y)};width:${px(L.button.width)};height:${px(L.button.height)}">${label}</div>`)
    .join("");
  return `<div class="pv-velo"><div class="pv-dialogo" style="width:${px(L.width)};height:${px(L.height)}">` +
    `<div class="pv-titulo" style="height:${px(L.title.height)}"><span>VI Properties</span><span class="pv-cerrar" data-id="${DIALOG_ID}.cancel">✕</span></div>` +
    `<div class="pv-etiqueta" style="left:${px(L.categoryLabel.x)};top:${px(L.categoryLabel.y)}">Category</div>` +
    `<div class="pv-combo categoria" data-id="${CATEGORIES_ID}" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)}"><span class="pv-texto">Execution</span><span class="pv-flecha"></span></div>` +
    `<div class="pv-pagina" style="left:${px(L.page.x)};top:${px(L.page.y)};width:${px(L.page.width)};height:${px(L.page.height)}"></div>` +
    CHECKBOXES.map((entry) => checkbox(inv, entry)).join("") + reentrancyGroup(inv, dialog) + COMBOS.map((entry) => comboBox(inv, entry)).join("") +
    `${buttons}</div></div>`;
}
