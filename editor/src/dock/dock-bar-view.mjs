// The bar of Solder's docked window (DT-101 §2): at its left the switch between the active OVI's Front Panel and Block
// Diagram, then the split button (Ctrl+T) and one tab per open OVI with its close button. Pure: dock-bar.mjs puts it in
// the page and answers its clicks.

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The FP / BD switch: which of the two is shown; both are pressed while the middle is split. */
function kindSwitch({ shown, split, tabs }) {
  const disabled = tabs.length ? "" : " disabled";
  const button = (kind, text, title) => {
    const pressed = split || shown === kind;
    return `<button class="dock-kind${pressed ? " pressed" : ""}" data-dock-kind="${kind}" title="${title} (Ctrl+E)" aria-pressed="${pressed}"${disabled}>${text}</button>`;
  };
  const splitButton = `<button class="dock-split${split ? " pressed" : ""}" data-dock-split title="Split the Front Panel and the Block Diagram (Ctrl+T)" aria-pressed="${split}"${disabled}>⊟</button>`;
  return `<div class="dock-switch" role="group" aria-label="Window">${button("front-panel", "FP", "Front Panel")}${button("block-diagram", "BD", "Block Diagram")}${splitButton}</div>`;
}

function tab({ id, label, active }) {
  const name = escapeHtml(label);
  return `<div class="dock-tab${active ? " active" : ""}" role="tab" aria-selected="${active}" data-dock-tab="${escapeHtml(id)}" title="${name}"><span class="dock-tab-label">${name}</span><span class="dock-tab-close" role="button" aria-label="Close ${name}" data-dock-close="${escapeHtml(id)}">×</span></div>`;
}

/** The bar's HTML for a state `{ tabs, shown, split }`. */
export function dockBarHtml(state) {
  const tabs = state.tabs.length ? state.tabs.map(tab).join("") : `<div class="dock-empty">No OVI open</div>`;
  return `${kindSwitch(state)}<div class="dock-tabs" role="tablist">${tabs}</div>`;
}
