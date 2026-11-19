// The switch at the foot of the Project Explorer between LabVIEW's floating windows and Solder's docked window (DT-101):
// Solder's own, not LabVIEW's, so it is drawn apart from the measured buttons and marked experimental.

export const LAYOUT_FLOATING = "floating";
export const LAYOUT_DOCKED = "docked";

/** What the switch says when hovered (DT-101, the developer's words). */
export const LAYOUT_ADVICE = "If you come from LabVIEW, use the floating windows; if you start from scratch, use the docked view.";

export const nextLayout = (layout) => (layout === LAYOUT_DOCKED ? LAYOUT_FLOATING : LAYOUT_DOCKED);

/** The switch: on while the docked view is on, with "Experimental" in red beside it. */
export function layoutSwitchHtml(layout) {
  const on = layout === LAYOUT_DOCKED;
  return `<div class="pe-layout-switch${on ? " on" : ""}" role="switch" aria-checked="${on}" data-layout-switch title="${LAYOUT_ADVICE}">` +
    `<span class="pe-switch-track"><span class="pe-switch-thumb"></span></span>` +
    `<span class="pe-switch-label">Docked view</span><span class="pe-experimental">Experimental</span></div>`;
}
