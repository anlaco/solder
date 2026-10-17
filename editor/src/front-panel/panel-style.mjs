// Which style the Front Panels show (DT-058 §5–6): SOLDER_PANEL_STYLE=old-school|plain|solder|solder-night, until
// Tools ▸ Options exists. Development starts in Old School, so the clone can still be compared with LabVIEW; a
// packaged release starts in Solder.
//
// Every style is a CSS sheet over the plain HTML of html-controls.mjs, Old School included (DT-058 §5): every page
// loads panel-styles/plain.css, the mother template, and then CHOSEN_PANEL_STYLE_ROUTE, which the solder:// protocol
// serves as the chosen style's own sheet. A style with no sheet yet shows as Plain (DT-058 §3).

export const CHOSEN_PANEL_STYLE_ROUTE = "/src/panel-styles/chosen.css";

/** `stylesheet`, relative to editor/src/panel-styles/. */
export const PANEL_STYLES = {
  "old-school": { stylesheet: "old-school.css" },
  plain: { stylesheet: null },
  // Their sheets come in the next step of DT-058; until then they show as Plain.
  solder: { stylesheet: null },
  "solder-night": { stylesheet: null },
};

const DEVELOPMENT_PANEL_STYLE = "old-school";
const RELEASE_PANEL_STYLE = "solder";

/** The name of the panel style to show; an unknown name is reported and the default is used. */
export function chosenPanelStyleName(environmentValue, isPackaged, warn = console.warn) {
  const defaultName = isPackaged ? RELEASE_PANEL_STYLE : DEVELOPMENT_PANEL_STYLE;
  if (!environmentValue) return defaultName;
  if (Object.hasOwn(PANEL_STYLES, environmentValue)) return environmentValue;
  warn(`! SOLDER_PANEL_STYLE=${environmentValue} is not a panel style (${Object.keys(PANEL_STYLES).join(", ")}): using ${defaultName}`);
  return defaultName;
}

/** The style a window reads from its URL (`panelStyle`); an unknown or missing one is Old School. */
export const panelStyleFromQuery = (value) => (Object.hasOwn(PANEL_STYLES, value ?? "") ? value : DEVELOPMENT_PANEL_STYLE);

