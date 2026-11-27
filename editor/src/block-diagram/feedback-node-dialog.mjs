// The Properties dialog of the Feedback Node (DT-109): two tabs, Appearance (Label, Position, Header Appearance, Arrow Direction)
// and Configuration (Delay, Show enable terminal, Initialization), with OK, Cancel and Help. Opened from Properties in the node's
// menu.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-26-feedback-node-look.md Q7): 503 x 500, nothing greyed; the parts
// above in that order; the label is not visible by default and reads "Feedback Node"; Header Appearance is "Arrow only" (default)
// or "Z-transform and arrow"; Arrow Direction is "Arrow points left" (default) or "Arrow points right"; Delay is a number whose
// least is 1 (LabVIEW ignores 0 and less, behavior report Q3); Initialization is "First call" (selected) or "Compile or load".
// Read from the captures dlg1c.png and dlg2c.png (2x crops): the title, "Object Properties", the position of every part, and that
// Position is the node's Left and Top (they showed 400 and 200).
// Not measured, and decided here: that "Compile or load" is greyed with the reason that it is not built yet (DT-109 §6; LabVIEW
// shows it enabled), the step of Delay's arrows (1), and that unchecking Visible takes the label off the node.
//
// Pure, like call-library-dialog.mjs: `open` builds the dialog from the node, `key` and `click` turn what the user does into an
// intent (modal-dialog.mjs), `apply` writes the draft into the OVI as one step and `view` draws it from the inventory
// (`dialog.feedback-node.*`). The draft is separate from the node: Cancel and Escape leave the node as it was.

import { esHueco } from "../common/labview-inventory.mjs";
import { configuredFromDialog } from "./feedback-node-edits.mjs";
import {
  DIRECTION_LEFT, DIRECTION_RIGHT, HEADER_ARROW, HEADER_Z_TRANSFORM, feedbackConfig,
} from "./feedback-node-geometry.mjs";

export const DIALOG_ID = "dialog.feedback-node";
export const TITLE = "Object Properties";
/** The name of the undo step an OK makes, as the other node dialogs' (Express OVIs, Call Library Function Node). */
export const UNDO_STEP_NAME = "Change Attribute";
export const SIZE = { width: 503, height: 500 };
/** What the label says when the node never had one (Q7). */
export const DEFAULT_LABEL = "Feedback Node";
const LEAST_DELAY = 1;
const DELAY_STEP = 1;
const TABS = [["appearance", "Appearance"], ["configuration", "Configuration"]];
/** The parts that explain why they are greyed instead of acting (their inventory entries say why). */
const EXPLAINED = new Set(["help", "initialize-compile-or-load"]);
const NO_CHANGE = null;

// ——— The state ———

/** The dialog for a node: a draft of what it can change, the tab in view and the text field that has the focus. */
export function open(node) {
  const config = feedbackConfig(node);
  return {
    nodo: node.id,
    tab: "appearance",
    focus: null,
    replaceOnType: false,
    original: { left: node.x, top: node.y },
    draft: {
      labelVisible: Boolean(node.label),
      label: node.label?.text ?? DEFAULT_LABEL,
      left: String(node.x),
      top: String(node.y),
      header: config.zTransform ? HEADER_Z_TRANSFORM : HEADER_ARROW,
      direction: config.direction,
      delay: String(config.delay),
      showEnable: config.showEnable,
    },
  };
}

const withDraft = (dialog, changes) => ({ ...dialog, draft: { ...dialog.draft, ...changes } });
const FIELD_PATTERNS = { label: /^[^]$/, left: /^[0-9-]$/, top: /^[0-9-]$/, delay: /^[0-9]$/ };

/** The delay the draft says: a whole number of at least 1; anything else means what the node had (LabVIEW ignores it). */
const typedDelay = (text, fallback) => {
  const value = Number(text);
  return Number.isInteger(value) && value >= LEAST_DELAY ? value : fallback;
};

// ——— Keys and clicks ———

/** Enter accepts and Escape cancels; a character typed goes to the field with the focus, the first one replacing its text. */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return NO_CHANGE;
  if (event.key === "Escape") return { cancel: true };
  if (event.key === "Enter") return { accept: true };
  if (!dialog.focus) return NO_CHANGE;
  const field = dialog.focus;
  const text = dialog.replaceOnType ? "" : dialog.draft[field];
  if (event.key === "Backspace") return { dialog: { ...withDraft(dialog, { [field]: text.slice(0, -1) }), replaceOnType: false } };
  if (event.key.length !== 1 || !FIELD_PATTERNS[field].test(event.key)) return NO_CHANGE;
  return { dialog: { ...withDraft(dialog, { [field]: text + event.key }), replaceOnType: false } };
}

const TEXT_FIELDS = new Set(["label", "left", "top", "delay"]);
const RADIOS = {
  "header-arrow": { header: HEADER_ARROW },
  "header-z-transform": { header: HEADER_Z_TRANSFORM },
  "direction-left": { direction: DIRECTION_LEFT },
  "direction-right": { direction: DIRECTION_RIGHT },
};

/** What a click on the part `id` means: the buttons act, the greyed parts explain themselves, the rest changes the draft. */
export function click(dialog, id) {
  const part = id.slice(DIALOG_ID.length + 1);
  if (part === "ok") return { accept: true };
  if (part === "cancel" || part === "close") return { cancel: true };
  if (EXPLAINED.has(part)) return { explain: true };
  const tab = /^tab-(.+)$/.exec(part)?.[1];
  if (tab) return { dialog: { ...dialog, tab, focus: null } };
  if (TEXT_FIELDS.has(part)) return { dialog: { ...dialog, focus: part, replaceOnType: true } };
  if (part in RADIOS) return { dialog: withDraft({ ...dialog, focus: null }, RADIOS[part]) };
  if (part === "label-visible") return { dialog: withDraft({ ...dialog, focus: null }, { labelVisible: !dialog.draft.labelVisible }) };
  if (part === "show-enable") return { dialog: withDraft({ ...dialog, focus: null }, { showEnable: !dialog.draft.showEnable }) };
  if (part === "initialize-first-call") return NO_CHANGE;
  const spin = /^delay-(up|down)$/.exec(part)?.[1];
  if (spin) return { dialog: steppedDelay(dialog, spin === "up" ? DELAY_STEP : -DELAY_STEP) };
  return NO_CHANGE;
}

function steppedDelay(dialog, step) {
  const delay = Math.max(LEAST_DELAY, typedDelay(dialog.draft.delay, LEAST_DELAY) + step);
  return { ...withDraft(dialog, { delay: String(delay) }), focus: null };
}

// ——— Writing it into the OVI ———

const intOr = (text, fallback) => (Number.isInteger(Number(text)) && text.trim() !== "" ? Number(text) : fallback);

/** The label as the draft leaves it: the node's own text while visible, none when not. */
function withLabel(node, draft) {
  const { label: _hidden, ...rest } = node;
  return draft.labelVisible ? { ...rest, label: { ...node.label, text: draft.label } } : rest;
}

/** The OVI with the draft applied to the node: one step, which an OK that changes nothing does not make. */
export function apply(g, dialog) {
  const node = g.nodos.find((candidate) => candidate.id === dialog.nodo);
  if (!node) return g;
  const { draft } = dialog;
  const config = feedbackConfig(node);
  const patch = { delay: typedDelay(draft.delay, config.delay), showEnable: draft.showEnable, header: draft.header, direction: draft.direction };
  let applied = configuredFromDialog(g, node.id, patch);
  const configured = applied.nodos.find((candidate) => candidate.id === node.id);
  const left = draft.left === String(dialog.original.left) ? configured.x : intOr(draft.left, configured.x);
  const top = draft.top === String(dialog.original.top) ? configured.y : intOr(draft.top, configured.y);
  const final = withLabel({ ...configured, x: left, y: top }, draft);
  applied = { ...applied, nodos: applied.nodos.map((candidate) => (candidate.id === node.id ? final : candidate)) };
  return JSON.stringify(applied.nodos) === JSON.stringify(g.nodos) ? g : applied;
}

export const stepName = () => UNDO_STEP_NAME;

// ——— Drawing ———

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;
const partId = (part) => `${DIALOG_ID}.${part}`;
const box = ({ x, y, width, height }) => `left:${px(x)};top:${px(y)};${width ? `width:${px(width)};` : ""}${height ? `height:${px(height)}` : ""}`;
const holeClass = (inv, id) => {
  const entry = inv.resolver(id);
  return entry && esHueco(entry) ? " hueco" : "";
};

/** The parts in px from the dialog's top left corner, read from labview-captures/feedback-node-look/dlg1c.png and dlg2c.png (2x crops). */
const LAYOUT = {
  titleHeight: 30,
  tabs: { y: 45, height: 25, lefts: [14, 99], widths: [85, 92] },
  page: { x: 14, y: 70, width: 473, height: 380 },
  buttons: { y: 465, width: 57, height: 20, ok: 297, cancel: 363, help: 430 },
  label: { group: { x: 25, y: 88, width: 178, height: 63, title: "Label" }, visible: { x: 31, y: 100 }, field: { x: 31, y: 122, width: 165, height: 22 } },
  position: { group: { x: 339, y: 162, width: 132, height: 76, title: "Position" }, left: { x: 345, y: 193 }, top: { x: 409, y: 193 }, leftField: { x: 344, y: 210, width: 55, height: 21 }, topField: { x: 408, y: 210, width: 54, height: 21 } },
  header: { group: { x: 23, y: 260, width: 209, height: 74, title: "Header Appearance" }, arrow: { x: 32, y: 274 }, zTransform: { x: 32, y: 303 } },
  direction: { group: { x: 22, y: 351, width: 209, height: 74, title: "Arrow Direction" }, left: { x: 31, y: 365 }, right: { x: 31, y: 394 } },
  delay: { label: { x: 24, y: 82 }, field: { x: 23, y: 100, width: 94, height: 22 } },
  showEnable: { x: 23, y: 142 },
  initialization: { group: { x: 23, y: 183, width: 454, height: 72, title: "Initialization" }, firstCall: { x: 32, y: 199 }, compileOrLoad: { x: 32, y: 223 } },
};

const group = ({ x, y, width, height, title }) => `<div class="pv-grupo" style="${box({ x, y, width, height })}"><span class="pv-grupo-titulo">${esc(title)}</span></div>`;
const label = (text, at) => `<div class="pv-etiqueta clfn-etiqueta" style="left:${px(at.x)};top:${px(at.y)}">${esc(text)}</div>`;

function textField(dialog, part, rect) {
  const focused = dialog.focus === part;
  const selected = focused && dialog.replaceOnType;
  const caret = focused && !selected ? `<span class="caret"></span>` : "";
  return `<div class="pv-campo clfn-campo" data-id="${partId(part)}" style="${box(rect)}"><span class="clfn-texto${selected ? " texto-elegido" : ""}">${esc(dialog.draft[part])}</span>${caret}</div>`;
}

const check = (inv, part, text, checked, at) =>
  `<div class="pv-check${holeClass(inv, partId(part))}${checked ? " marcada" : ""}" data-id="${partId(part)}" style="left:${px(at.x)};top:${px(at.y)}"><span class="pv-casilla"></span><span class="pv-texto">${esc(text)}</span></div>`;

const radio = (inv, part, text, selected, at) =>
  `<div class="pv-radio${holeClass(inv, partId(part))}${selected ? " marcada" : ""}" data-id="${partId(part)}" style="left:${px(at.x)};top:${px(at.y)}"><span class="pv-casilla redonda"></span><span class="pv-texto">${esc(text)}</span></div>`;

const button = (inv, part, text, rect, defaultButton) =>
  `<div class="pv-boton${defaultButton ? " defecto" : ""}${holeClass(inv, partId(part))}" data-id="${partId(part)}" style="${box(rect)}">${esc(text)}</div>`;

function tabs(dialog) {
  const { y, height, lefts, widths } = LAYOUT.tabs;
  return TABS.map(([name, text], index) => {
    const active = dialog.tab === name;
    return `<div class="ficha clfn-ficha${active ? " activa" : ""}" data-id="${partId(`tab-${name}`)}" style="left:${px(lefts[index])};top:${px(active ? y - 2 : y)};width:${px(widths[index])};height:${px(active ? height + 2 : height)}">${esc(text)}</div>`;
  }).join("");
}

function appearanceTab(inv, dialog) {
  const L = LAYOUT;
  const { draft } = dialog;
  return group(L.label.group) + check(inv, "label-visible", "Visible", draft.labelVisible, L.label.visible) + textField(dialog, "label", L.label.field) +
    group(L.position.group) + label("Left", L.position.left) + textField(dialog, "left", L.position.leftField) +
    label("Top", L.position.top) + textField(dialog, "top", L.position.topField) +
    group(L.header.group) + radio(inv, "header-arrow", "Arrow only", draft.header === HEADER_ARROW, L.header.arrow) +
    radio(inv, "header-z-transform", "Z-transform and arrow", draft.header === HEADER_Z_TRANSFORM, L.header.zTransform) +
    group(L.direction.group) + radio(inv, "direction-left", "Arrow points left", draft.direction === DIRECTION_LEFT, L.direction.left) +
    radio(inv, "direction-right", "Arrow points right", draft.direction === DIRECTION_RIGHT, L.direction.right);
}

function configurationTab(inv, dialog) {
  const L = LAYOUT;
  const spin = `<div class="pv-spin"><div class="pv-spin-up" data-id="${partId("delay-up")}"></div><div class="pv-spin-down" data-id="${partId("delay-down")}"></div></div>`;
  const delayField = textField(dialog, "delay", L.delay.field).replace(/<\/div>$/, `${spin}</div>`);
  return label("Delay", L.delay.label) + delayField + check(inv, "show-enable", "Show enable terminal", dialog.draft.showEnable, L.showEnable) +
    group(L.initialization.group) + radio(inv, "initialize-first-call", "First call", true, L.initialization.firstCall) +
    radio(inv, "initialize-compile-or-load", "Compile or load", false, L.initialization.compileOrLoad);
}

/** The dialog, modal over the window, like the other ones. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const { width, height } = SIZE;
  const buttons = [["ok", "OK", true], ["cancel", "Cancel", false], ["help", "Help", false]]
    .map(([part, text, isDefault]) => button(inv, part, text, { x: L.buttons[part], y: L.buttons.y, width: L.buttons.width, height: L.buttons.height }, isDefault))
    .join("");
  const page = `<div class="pv-pagina clfn-pagina" style="${box(L.page)}"></div>`;
  const body = dialog.tab === "appearance" ? appearanceTab(inv, dialog) : configurationTab(inv, dialog);
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-clfn dialogo-feedback" data-dialogo="${DIALOG_ID}" style="width:${px(width)};height:${px(height)}">` +
    `<div class="pv-titulo" style="height:${px(L.titleHeight)}"><span>${esc(TITLE)}</span><span class="pv-cerrar" data-id="${partId("close")}">✕</span></div>` +
    `${page}${tabs(dialog)}${body}${buttons}</div></div>`;
}
