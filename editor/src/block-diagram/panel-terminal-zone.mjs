// The wiring zones of a control's or indicator's diagram terminal and of a constant's output.

/**
 * A control's or indicator's terminal wires only by a patch at its data side, 16 × 12 px, vertically centred on the
 * terminal's arrow: 10 px inside the icon and 6 px outside its edge (right of a control, left of an indicator). It is
 * the same in View As Icon (38 px wide) and as a plain terminal (32 × 16). The rest of the icon selects it, so a click
 * on its middle selects and Delete removes it (S13-#3 of daq-plugin-findings.md), and a SELECTED terminal has no
 * wiring zone at all: a press on it moves or selects (labview-captures/reports/2026-11-15-terminal-hot-zones.md §1, §2;
 * measured on DBL controls and indicators; other types, wired terminals and other DPI are unverified).
 */
export const PANEL_WIRING_ZONE = { width: 16, height: 12, inside: 10, outside: 6 };

/**
 * The zone of a panel terminal of `box`. `dir` is "out" for a control (the data leaves by its right edge) and "in"
 * for an indicator (it enters by its left edge); `arrowY` is the arrow's height from the box's top.
 */
export function panelTerminalZone(box, dir, arrowY) {
  const { width, height, inside, outside } = PANEL_WIRING_ZONE;
  const x = dir === "out" ? box.x + box.ancho - inside : box.x - outside;
  // The report gives the patch as rows centred on the arrow's row: the half row of an arrow at 19.5 or 8.5 is dropped.
  const y = box.y + Math.floor(arrowY - height / 2);
  return { x, y, ancho: width, alto: height };
}

/**
 * A constant wires only by a patch entirely OUTSIDE its box, 6 px wide (R+1 to R+6) and 12 px high, centred on the box's
 * middle row (top+3 to top+14 of a 19 px box); the whole box, frame included, selects and moves. A SELECTED constant has
 * no wiring zone at all (labview-captures/reports/2026-11-16-constant-wiring-zone.md; measured on unselected I32
 * constants 13 and 31 px wide; other representations and zoom unverified, and string, ring, path and other constants were
 * not measured: they take the numeric's).
 */
export const CONSTANT_WIRING_ZONE = { width: 6, height: 12 };

/** The zone of the output of a constant of `box`. */
export function constantTerminalZone(box) {
  const { width, height } = CONSTANT_WIRING_ZONE;
  return { x: box.x + box.ancho, y: box.y + Math.floor((box.alto - height) / 2), ancho: width, alto: height };
}
