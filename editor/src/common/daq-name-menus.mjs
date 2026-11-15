// The right-click menus of the DAQ name controls and indicators on the panel, and the list their arrow button opens
// (DT-076 §5). Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-11-15-daqname-menus.md (Q1 the panel menus,
// Q2 the arrow button). What the report did not open is marked unverified below.

import { isDaqName, isDaqTask } from "../../../core/model/daq-name.mjs";

/**
 * A Task Name has the rows of LabVIEW's Task Name (New Task ▸, Edit Task, Generate Code ▸). The other six kinds have the
 * Physical Channel's: only the Physical Channel was opened, so that the Global Channel, Terminal, Scale, Device and
 * Switch menus are unverified.
 */
export const DAQ_NAME_PANEL_MENUS = Object.freeze({ task: "context.daq-task-name-control", other: "context.daq-name-control" });
const PANEL_MENU_ROOTS = new Set(Object.values(DAQ_NAME_PANEL_MENUS));

/** The menu the arrow button of a DAQ name control opens (Q2). */
export const DAQ_NAME_DROPDOWN_MENU = "context.daq-name-dropdown";

/** Is this a DAQ name control or indicator of the panel? */
export const isDaqNamePanelObject = (node) => (node?.tipo === "daq-name-control" || node?.tipo === "daq-name-indicator") && isDaqName(node.config?.type);

export const isDaqNamePanelMenu = (root) => PANEL_MENU_ROOTS.has(root);

/** The panel menu of a DAQ name control or indicator, by its kind. */
export const daqNamePanelMenuRoot = (node) => (isDaqTask(node.config.type) ? DAQ_NAME_PANEL_MENUS.task : DAQ_NAME_PANEL_MENUS.other);

const isIndicator = (node) => node.tipo === "daq-name-indicator";

/**
 * What the indicator's menu changes (Q1): it says Change to Control and Hide Indicator, has no Generate Code ▸ (the
 * Edit Task row stays), and its Menu Button is greyed (it has no arrow button). The control's own rows are the default.
 */
export function daqNameMenuVariants(node, root) {
  if (!isIndicator(node)) return {};
  return {
    rotulos: new Map([[`${root}.change-to-indicator`, "Change to Control"], [`${root}.advanced.hide-control`, "Hide Indicator"]]),
    ocultos: new Set([`${root}.generate-code`]),
    desactivados: new Set([`${root}.visible-items.menu-button`]),
  };
}

/**
 * The ticks of the menu (Q1): Visible Items shows the Label; the Menu Button too on a control, which has the arrow. Caption
 * is unticked, and the indicator has no Menu Button to tick.
 */
export function daqNameMenuMarks(node, root) {
  return [`${root}.visible-items.label`, ...(isIndicator(node) ? [] : [`${root}.visible-items.menu-button`])];
}
