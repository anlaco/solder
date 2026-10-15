// The modal dialogs of the VI window — Edit Items… of an enum and Chart History Length… —:
// which one is open and what a key or a click means for it.
//
// It exists because of the review of the enum commit (#32, 2026-10-14): the routing used to live
// in `editor-window.mjs`, where nothing can be tested without a browser, and two defects got
// through with every test green. The window shell now only applies the intent this module
// returns, so a new dialog adds one row to `DIALOGS` and nothing else.
//
// Each dialog's module answers with one intent: `{ dialog }` a new state for it, `{ accept }`
// write it into the VI and close, `{ cancel }` close it as it was, `{ explain }` say why the part
// is not done (DT-035), or `null` for a key or a part the dialog ignores.

import * as CH from "../front-panel/chart-history-dialog.mjs";
import * as EI from "../block-diagram/edit-items-dialog.mjs";

/**
 * The dialogs, by the field their state lives in and the side of the VI they belong to. The
 * fields are distinct on purpose: while the items dialog shared `dialogo` with the chart one,
 * a digit typed into Chart History Length reached the items dialog's view and threw.
 */
export const DIALOGS = [
  { field: "itemsDialog", side: "diagram", mod: EI },
  { field: "itemsDialog", side: "panel", mod: EI },
  { field: "graphDialog", side: "panel", mod: CH },
];

/**
 * The dialog open over the window, or `null`: the module that drives it, its state, the field it
 * lives in and the side whose state holds it. `diagram` and `panel` are the two editing states,
 * or `null` for a window that does not show that side.
 */
export function openDialog(diagram, panel) {
  const stateOf = { diagram, panel };
  for (const { field, side, mod } of DIALOGS) {
    const state = stateOf[side];
    if (state?.[field]) return { side, field, mod, dialog: state[field] };
  }
  return null;
}

/** What a key means for the open dialog; `null` when no dialog is open or it ignores the key. */
export const keyIntent = (open, event) => (open ? open.mod.key(open.dialog, event) : null);

/** What a click on the part `id` means for the open dialog (`clicks`: 2 for a double click); `null` when it ignores it. */
export const clickIntent = (open, id, clicks = 1) => (open && id ? open.mod.click(open.dialog, id, clicks) : null);

/** The VI that accepting the open dialog gives, from the graph `g` it was opened on. */
export const accepted = (open, g) => open.mod.apply(g, open.dialog);
