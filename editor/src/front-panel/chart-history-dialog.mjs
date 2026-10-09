// Chart History Length..., the dialog of the right-click menu of a Waveform Chart
// (labview-captures/graphs/50-chart-history-length-dialog.png): the number of data
// points the chart keeps, 1024 by default.
//
// Pure, like vi-properties.mjs: `open` creates the dialog from the chart, `type` writes into
// its field, `apply` puts the number into the VI and `view` draws it, from the inventory
// (`dialog.chart-history-length.*`).

import { esHueco } from "../common/labview-inventory.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { DEFAULT_CHART_HISTORY } from "./plot-data.mjs";
import { graphSettings } from "./graph-state.mjs";

export const DIALOG_ID = "dialog.chart-history-length";

/** The dialog in px from its top left corner (50, at 1:1: it sits at 826, 447 and measures 268 × 154). */
export const LAYOUT = {
  width: 268,
  height: 154,
  title: { height: 30, text: "Chart History Length" },
  prompt: { x: 18, y: 44, width: 210, text: "Number of data points in chart history buffer" },
  field: { x: 56, y: 89, width: 156, height: 21 },
  button: { y: 123, width: 72, height: 20, ok: 11, cancel: 98, help: 185 },
};

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/** The dialog for a chart: its field holds the current length, all selected. */
export const open = (node) => ({ tipo: "history-length", nodo: node.id, texto: String(graphSettings(node).historyLength), todo: true });

/** A key typed into the field: digits only; the first one replaces what is selected. */
export function type(dialog, key) {
  if (key === "Backspace") return { ...dialog, texto: dialog.todo ? "" : dialog.texto.slice(0, -1), todo: false };
  if (!/^[0-9]$/.test(key)) return dialog;
  return { ...dialog, texto: (dialog.todo ? "" : dialog.texto) + key, todo: false };
}

/** The length the field says, or nothing if it is not a whole number of at least 1 (what LabVIEW does with it is unverified). */
export function length(dialog) {
  const value = Number(dialog.texto);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

/** The VI with the length of the dialog; 1024 is the default and is not stored. An invalid field leaves it as it was. */
export function apply(g, dialog) {
  const value = length(dialog);
  return value === undefined ? g : Gr.fijarConfig(g, dialog.nodo, { historyLength: value === DEFAULT_CHART_HISTORY ? undefined : value });
}

const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/** The dialog, modal over the window, like the VI Properties one. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const text = dialog.todo ? `<span class="texto-elegido">${esc(dialog.texto)}</span>` : `<span>${esc(dialog.texto)}</span><span class="caret"></span>`;
  const buttons = [{ key: "ok", label: "OK", defaultButton: true }, { key: "cancel", label: "Cancel" }, { key: "help", label: "Help" }]
    .map(({ key, label, defaultButton }) => `<div class="pv-boton${defaultButton ? " defecto" : ""}${holeClass(inv, `${DIALOG_ID}.${key}`)}" data-id="${DIALOG_ID}.${key}" style="left:${px(L.button[key])};top:${px(L.button.y)};width:${px(L.button.width)};height:${px(L.button.height)}">${label}</div>`)
    .join("");
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-historial" data-dialogo="${DIALOG_ID}" style="width:${px(L.width)};height:${px(L.height)}">` +
    `<div class="pv-titulo" style="height:${px(L.title.height)}"><span>${L.title.text}</span><span class="pv-cerrar" data-id="${DIALOG_ID}.cancel">✕</span></div>` +
    `<div class="pv-nota" style="left:${px(L.prompt.x)};top:${px(L.prompt.y)};width:${px(L.prompt.width)}">${esc(L.prompt.text)}</div>` +
    `<div class="pv-campo" style="left:${px(L.field.x)};top:${px(L.field.y)};width:${px(L.field.width)};height:${px(L.field.height)}">${text}</div>` +
    `${buttons}</div></div>`;
}
