// The font of the pages that are not a VI window (Getting Started, the Polymorphic OVI window, the New dialog): Segoe UI at
// 12 px, LabVIEW's, or Noto Sans at 11.3 px where Segoe UI is missing, which matches its widths (spec/06-visual.md §10).

const FULL_SIZE_FONT = "12px";
const SUBSTITUTE_FONT = "11.3px";
const SUBSTITUTE_SCALE = 11.3 / 12;

/** Whether a font is installed: `document.fonts.check` does not work for system fonts. */
function isInstalled(font) {
  const context = document.createElement("canvas").getContext("2d");
  const widthIn = (family) => {
    context.font = `72px ${family}`;
    return context.measureText("Solder abcdefghij 0123456789").width;
  };
  return widthIn(`"${font}", monospace`) !== widthIn("monospace");
}

/**
 * Sets `--fuente` on the page and `--escala` on its body, and returns the width of a text in that font (what the menus
 * need to size themselves).
 */
export function installPageFont() {
  const hasSegoe = isInstalled("Segoe UI");
  document.documentElement.style.setProperty("--fuente", hasSegoe ? FULL_SIZE_FONT : SUBSTITUTE_FONT);
  document.body.style.setProperty("--escala", hasSegoe ? "1" : String(SUBSTITUTE_SCALE));
  const canvas = document.createElement("canvas").getContext("2d");
  return (text) => {
    canvas.font = `${getComputedStyle(document.documentElement).getPropertyValue("--fuente")} "Segoe UI", "Noto Sans", sans-serif`;
    return canvas.measureText(text).width;
  };
}
