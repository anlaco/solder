// The inside of Time Delay's configuration dialog (DT-069): one numeric field, "Time delay (seconds)". The frame around it
// (title, OK, Cancel, Help) is express-dialog.mjs.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-29-time-delay.md Q6, express-vi/td-dlg.png at 100 %): it
// opens with the node's value, 1.000 for a new node; the field shows three decimals but keeps the value whole (2.123456 is
// shown 2.123 and is configured as 2.123456); the least is 0, so a negative number becomes 0; there is no greatest. Not
// measured: what a text that is not a number does (here the field goes back to the value it opened with), and the step of the
// step of the field's spin arrows (here 1).

export const SIZE = { width: 302, height: 142 };

/** The parts of the dialog's body in px from its top left corner (td-dlg.png). */
const LAYOUT = {
  prompt: { x: 16, y: 46, text: "Time delay (seconds)" },
  field: { x: 13, y: 60, width: 80, height: 22 },
  /** The spin arrows sit at the right end of the field, one above the other. */
  spin: { width: 13 },
};
/** How many decimals the field shows (the value itself is kept whole). */
const SHOWN_DECIMALS = 3;
const LEAST_DELAY = 0;

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/** The field as the node's configuration has it: its value shown with three decimals, all selected. */
export const open = (node, block) => {
  const value = node.config?.delay ?? block.config.delay.value;
  return { original: value, text: value.toFixed(SHOWN_DECIMALS), typed: false, todo: true };
};

/** The characters a number is written with; a comma stands for the decimal point. */
const NUMBER_CHARACTER = /^[0-9.,eE+-]$/;

/** A key typed into the field: the first one replaces what is selected, Backspace deletes, anything else that is not part of a number is ignored. */
export function key(state, pressed) {
  if (pressed === "Backspace") return { ...state, text: state.todo ? "" : state.text.slice(0, -1), typed: true, todo: false };
  if (!NUMBER_CHARACTER.test(pressed)) return state;
  return { ...state, text: (state.todo ? "" : state.text) + pressed, typed: true, todo: false };
}

/** The delay the field says: what was typed, with a negative number as 0; or, with nothing typed or not a number, what it opened with. */
export function delay(state) {
  if (!state.typed) return state.original;
  const value = Number(state.text.replace(",", "."));
  if (state.text.trim() === "" || !Number.isFinite(value)) return state.original;
  return Math.max(LEAST_DELAY, value);
}

/** How much a click on a spin arrow changes the delay. Unverified: LabVIEW's step. */
const SPIN_STEP = 1;

/** A click on a spin arrow: the delay goes up or down by the step, never below 0, and is written with three decimals. */
export function click(state, part) {
  const direction = { "spin-up": 1, "spin-down": -1 }[part];
  if (!direction) return null;
  const value = Math.max(LEAST_DELAY, delay(state) + direction * SPIN_STEP);
  return { ...state, text: value.toFixed(SHOWN_DECIMALS), typed: true, todo: false };
}

/** What an OK sets in the node's configuration. */
export const changes = (state) => ({ delay: delay(state) });

/** The prompt and the field, with its spin arrows. */
export function view(state) {
  const { prompt, field, spin } = LAYOUT;
  const text = state.todo ? `<span class="texto-elegido">${esc(state.text)}</span>` : `<span>${esc(state.text)}</span><span class="caret"></span>`;
  return `<div class="pv-nota" style="left:${px(prompt.x)};top:${px(prompt.y)}">${esc(prompt.text)}</div>` +
    `<div class="pv-campo" style="left:${px(field.x)};top:${px(field.y)};width:${px(field.width)};height:${px(field.height)}">${text}<div class="pv-spin" style="width:${px(spin.width)}"><div class="pv-spin-up" data-id="dialog.express-vi.spin-up"></div><div class="pv-spin-down" data-id="dialog.express-vi.spin-down"></div></div></div>`;
}
