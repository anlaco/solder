// The connector pane on the Front Panel (DT-045, spec/05 §12): the 32 × 32
// square to the left of the icon, where each cell is given a control or an
// indicator so that the VI can be used as a subVI. Measured in LabVIEW 2026 Q3
// (labview-captures/subvi/).
//
// Pure functions over the panel state of front-panel.mjs: the window translates
// DOM events into these calls. The state it adds:
//   conector   { celda } the cell that was clicked and now waits for a control
//              or an indicator to be clicked
//   menu       as for any right-click menu, plus `conector: { celda }`, the cell
//              under the cursor when it was opened (`null` outside every cell)
// The connector itself is `g.vi.connector` (core/model/connector.mjs).

import { CONNECTOR_PATTERN, assignPanelElement, cellAt, connectorTerminals, disconnectAll, disconnectCell, setConnection, terminalAt } from "../../../core/model/connector.mjs";
import { patternNamed } from "../../../core/model/connector-patterns.mjs";
import { connectorPorts } from "../../../core/model/graph.mjs";
import { aspecto } from "../../../core/model/types.mjs";
import { conectorPane } from "../common/glyphs.mjs";

export const MENU_ROOT = "context.connector-pane";
export const ICON_MENU_ROOT = "context.vi-icon";

/** The colour a terminal paints its cell with: the colour of the type of its control or indicator. */
const NEUTRAL_COLOR = "#808080";

/**
 * The connector pane as the window paints it: one cell per terminal of the VI
 * coloured with its type, and the cell waiting for an element, if any.
 */
export function paneGlyph(g, cat, selectedCell = null) {
  const ports = connectorPorts({ g, cat });
  const cells = [...ports.in, ...ports.out].map((port) => ({ cell: port.cell, dir: port.dir, color: port.type ? aspecto(port.type).color : NEUTRAL_COLOR }));
  return conectorPane(cells, selectedCell);
}

/** The cell under a click on the pane, given the pane's on-screen box and the click position. */
export function cellUnderPointer(paneBox, pointer) {
  const scale = 32 / paneBox.width;
  return cellAt({ x: (pointer.clientX - paneBox.left) * scale, y: (pointer.clientY - paneBox.top) * scale });
}

// ——— Assigning ———

/** Clicking a cell selects it; clicking the selected one again lets go of it. */
export function selectCell(panel, cell) {
  if (cell === null) return panel;
  return { ...panel, conector: panel.conector?.celda === cell ? null : { celda: cell }, seleccion: [], accion: null, menu: null };
}

/**
 * Clicking an object of the panel while a cell is selected assigns it to that
 * cell. Clicking anywhere else, the background or a label, only lets go of the
 * cell.
 */
export function assignClicked(panel, cat, objectId) {
  if (!panel.conector) return panel;
  const g = objectId ? assignPanelElement(panel.g, cat, objectId, panel.conector.celda) : panel.g;
  return { ...panel, g, conector: null, seleccion: g === panel.g ? panel.seleccion : [] };
}

// ——— The right-click menus ———

/** Opens the menu of the connector pane (`cell` is the one under the cursor) or of the icon (`cell` is `null`). */
export const openMenu = (state, root, x, y, cell) => ({
  ...state,
  menu: { raiz: root, nodo: null, puerto: null, x, y, en: null, abierto: null, conector: { celda: cell } },
  accion: null,
  edicion: null,
});

/** Does this state hold a menu opened on the connector pane? */
export const hasConnectorMenu = (state) => !!state.menu?.conector && state.menu.raiz === MENU_ROOT;

const connectionOf = (g, cell) => terminalAt(g, cell)?.connection;

/**
 * The rows of the connector menu that depend on what is under the cursor:
 * Disconnect This Terminal and This Connection Is need a terminal, and Required
 * is greyed for an output (labview-captures/subvi/connector-this-connection-is-*.png).
 */
export function menuVariants(state) {
  const disabled = new Set();
  const cell = state.menu.conector.celda;
  const terminal = cell === null ? undefined : terminalAt(state.g, cell);
  if (!terminal) {
    disabled.add(`${MENU_ROOT}.disconnect-this-terminal`);
    disabled.add(`${MENU_ROOT}.this-connection-is`);
  } else if (terminal.dir === "out") {
    disabled.add(`${MENU_ROOT}.this-connection-is.required`);
  }
  if (!connectorTerminals(state.g.vi?.connector).length) disabled.add(`${MENU_ROOT}.disconnect-all-terminals`);
  return { desactivados: disabled, redirigidos: new Map(), rotulos: new Map() };
}

/** The row of the Patterns submenu of the pattern in use, the one outlined in blue (connector-menu-patterns.png). */
export const CURRENT_PATTERN_ROW = `${MENU_ROOT}.patterns.${patternNamed(CONNECTOR_PATTERN).id}`;

/** The rows with a check mark: the connection of the terminal under the cursor, and the pattern in use. */
export function menuMarks(state) {
  const connection = connectionOf(state.g, state.menu.conector.celda ?? -1);
  return new Set([CURRENT_PATTERN_ROW, ...(connection ? [`${MENU_ROOT}.this-connection-is.${connection}`] : [])]);
}

/** The orders of the connector menu that are done. A greyed row does nothing. */
export function runMenuCommand(state, rowId) {
  const cell = state.menu.conector.celda;
  const close = (g) => ({ ...state, g, menu: null });
  const disabled = menuVariants(state).desactivados;
  if (disabled.has(rowId)) return state;
  // Choosing the pattern already in use only closes the menu: it is the only one there is.
  if (rowId === CURRENT_PATTERN_ROW) return close(state.g);
  if (rowId === `${MENU_ROOT}.disconnect-all-terminals`) return close(disconnectAll(state.g));
  if (rowId === `${MENU_ROOT}.disconnect-this-terminal`) return close(disconnectCell(state.g, cell));
  const connection = /\.this-connection-is\.(required|recommended|optional)$/.exec(rowId)?.[1];
  if (connection) return close(setConnection(state.g, cell, connection));
  return state;
}
