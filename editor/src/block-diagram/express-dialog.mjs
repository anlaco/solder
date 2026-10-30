// The configuration dialog of an Express VI (DT-069 §3): "Configure <Express VI> [<caption>]", with OK (default), Cancel
// and Help. This is the part every Express VI shares: the title, the buttons, opening and closing, and writing the
// configuration into the node. What is inside the dialog is each Express VI's own module (its "body", see
// time-delay-dialog.mjs), registered in `BODIES`.
//
// Pure, like chart-history-dialog.mjs: `open` builds the dialog from the node, `key` and `click` turn what the user
// does into an intent, `apply` writes the configuration into the VI and `view` draws it from the inventory
// (`dialog.express-vi.*`). Measured in LabVIEW 2026 Q3 (labview-captures/express-vi/td-dlg.png, 100 %; reports/
// 2026-10-29-express-vi-common.md §1, §6).
//
// A body is a module with: `SIZE` (the dialog's width and height), `open(node, block)` its state, `key(state, key)` its
// state after a key typed into it, optionally `click(state, part)` what a click on one of its parts (`dialog.express-vi.<part>`) means: `{ body }` its new state or `{ explain: true }` for a part that is greyed with a reason (DT-035), and optionally `BUTTONS` where its row of buttons is when it is not the usual one, `changes(state)` the configuration an OK sets, and `view(state)` the markup of its
// own parts, placed from the dialog's top left corner.

import { configure } from "../../../core/model/express.mjs";
import { esHueco } from "../common/labview-inventory.mjs";
import { configureTitle } from "./express-nodes.mjs";
import * as FileDialog from "./file-dialog-express-dialog.mjs";
import * as TimeDelay from "./time-delay-dialog.mjs";

export const DIALOG_ID = "dialog.express-vi";

/** The name LabVIEW gives the undo step of an OK (measured: the Edit menu says "Undo Change Attribute"). */
export const UNDO_STEP_NAME = "Change Attribute";

/** The bodies of the Express VIs whose dialog is done, by block. */
const BODIES = { "time-delay": TimeDelay, "file-dialog": FileDialog };

/** Whether the Express VI `block` has its configuration dialog done. */
export const hasDialog = (block) => block in BODIES;

/** The title bar and the row of buttons every Express VI's dialog has, in px from its top left corner (td-dlg.png). */
const FRAME = {
  titleHeight: 28,
  button: { width: 82, height: 22, ok: 14, cancel: 110, help: 206 },
  /** The distance from the bottom of the dialog to its row of buttons. */
  buttonsBottom: 15,
};

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/**
 * The dialog for an Express VI node. `dropped` says it opened as the node was placed: cancelling it keeps the node,
 * unconfigured (measured).
 */
export function open(node, cat, { dropped = false } = {}) {
  const body = BODIES[node.tipo];
  return { nodo: node.id, bloque: node.tipo, titulo: configureTitle(node, cat), dropped, body: body.open(node, cat.bloque(node.tipo)) };
}

/**
 * What a key means: Enter accepts and Escape cancels; the rest goes to the body, which may ignore it. A key with Ctrl,
 * Meta or Alt is not for the dialog.
 */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Enter") return { accept: true };
  if (event.key === "Escape") return { cancel: true };
  const body = BODIES[dialog.bloque].key(dialog.body, event.key);
  return body === dialog.body ? null : { dialog: { ...dialog, body } };
}

/** What a click on the part `id` means: OK and Cancel (and the X) act, Help explains why it does not, the rest is nothing. */
export function click(dialog, id) {
  const part = id.slice(id.lastIndexOf(".") + 1);
  if (part === "ok") return { accept: true };
  if (part === "cancel" || part === "close") return { cancel: true };
  if (part === "help") return { explain: true };
  const answer = BODIES[dialog.bloque].click?.(dialog.body, part);
  if (answer?.explain) return { explain: true };
  return answer?.body ? { dialog: { ...dialog, body: answer.body } } : null;
}

/**
 * The VI with the configuration of the dialog: any OK configures the node, even with nothing changed (measured), but an
 * OK that leaves it as it was is not a step to undo.
 */
export function apply(g, dialog) {
  const node = g.nodos.find((candidate) => candidate.id === dialog.nodo);
  if (!node) return g;
  const configured = configure(node, BODIES[dialog.bloque].changes(dialog.body));
  const unchanged = JSON.stringify(configured.config) === JSON.stringify(node.config);
  return unchanged ? g : { ...g, nodos: g.nodos.map((candidate) => (candidate === node ? configured : candidate)) };
}

/** The name of the undo step an accepted dialog makes. */
export const stepName = () => UNDO_STEP_NAME;

const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/** The dialog, modal over the window, like the other ones. */
export function view(inv, dialog) {
  const body = BODIES[dialog.bloque];
  const { width, height } = body.SIZE;
  const buttonBox = body.BUTTONS ?? FRAME.button;
  const buttonTop = height - FRAME.buttonsBottom - buttonBox.height;
  const buttons = [{ key: "ok", label: "OK", defaultButton: true }, { key: "cancel", label: "Cancel" }, { key: "help", label: "Help" }]
    .map(({ key: part, label, defaultButton }) => `<div class="pv-boton${defaultButton ? " defecto" : ""}${holeClass(inv, `${DIALOG_ID}.${part}`)}" data-id="${DIALOG_ID}.${part}" style="left:${px(buttonBox[part])};top:${px(buttonTop)};width:${px(buttonBox.width)};height:${px(buttonBox.height)}">${label}</div>`)
    .join("");
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-express" data-dialogo="${DIALOG_ID}" style="width:${px(width)};height:${px(height)}">` +
    `<div class="pv-titulo" style="height:${px(FRAME.titleHeight)}"><span>${esc(dialog.titulo)}</span><span class="pv-cerrar" data-id="${DIALOG_ID}.close">✕</span></div>` +
    `${body.view(dialog.body, inv)}${buttons}</div></div>`;
}
