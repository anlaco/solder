// Which theme the editor shows (DT-056 §6): SOLDER_THEME=old-school|solder, with no option in the interface yet.
// Development starts in Old School, the LabVIEW clone the measurements are checked against; a packaged release
// starts in Solder.
//
// Every page loads themes/old-school.css, which defines every token, and then CHOSEN_THEME_ROUTE, which the
// solder:// protocol serves as the chosen theme's own sheet: a theme only redefines the tokens it changes.

export const CHOSEN_THEME_ROUTE = "/src/themes/chosen.css";

/**
 * The main process cannot read CSS, so the color a window shows before its page paints is repeated here; a
 * test checks it against the tokens. `stylesheet` is relative to editor/src/themes/; Old School needs none.
 */
export const THEMES = {
  "old-school": {
    stylesheet: null,
    windowBackground: { token: "--chrome-background", color: "#f0f0f0" },
    gettingStartedBackground: { token: "--getting-started-background", color: "#ffffff" },
  },
  solder: {
    stylesheet: "solder.css",
    windowBackground: { token: "--chrome-background", color: "#ffffff" },
    gettingStartedBackground: { token: "--getting-started-background", color: "#ffffff" },
  },
};

const DEVELOPMENT_THEME = "old-school";
const RELEASE_THEME = "solder";

/** The name of the theme to show; an unknown name is reported and the default is used. */
export function chosenThemeName(environmentValue, isPackaged, warn = console.warn) {
  const defaultName = isPackaged ? RELEASE_THEME : DEVELOPMENT_THEME;
  if (!environmentValue) return defaultName;
  if (Object.hasOwn(THEMES, environmentValue)) return environmentValue;
  warn(`! SOLDER_THEME=${environmentValue} is not a theme (${Object.keys(THEMES).join(", ")}): using ${defaultName}`);
  return defaultName;
}
