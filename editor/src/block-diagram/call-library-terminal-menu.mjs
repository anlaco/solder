// The right-click menu of a parameter's terminal on a Call Library Function Node (DT-080), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-daqname-menus.md, Q4, with the node's parameter Adapt to Type and unwired). The
// rest of the node, and the terminals that are not a parameter's (path, error, return value), keep the node's menu
// (`context.call-library`): their own menus were not opened, so they are unverified.

import * as Gr from "../../../core/model/graph.mjs";
import { MENU_ROOT } from "./call-library-nodes.mjs";

export const TERMINAL_MENU_ROOT = "context.call-library-terminal";

const PARAMETER_PORT = /^arg-\d+-(in|out)$/;

/** The terminal of a parameter (`arg-<n>-in` or `-out`) has this menu. */
export const isParameterPort = (port) => PARAMETER_PORT.test(port ?? "");

/** Name Format ticks No Names here as on the node's menu (measured on the node; the terminal's ticks were not read, unverified). */
export const NAME_FORMAT_MARKS = Object.freeze([`${TERMINAL_MENU_ROOT}.name-format.no-names`]);

/** Configure... opens the dialog from the node's menu and from the terminal's. */
export const isConfigureCommand = (root, id) => (root === MENU_ROOT || root === TERMINAL_MENU_ROOT) && id === `${root}.configure`;

/** The Create ▸ rows that need the terminal's type: LabVIEW greys all four on an Adapt to Type parameter that is not wired (Q4). */
const CREATE_ROWS_THAT_NEED_A_TYPE = ["constant", "control", "indicator", "channel-writer"];

/**
 * What the terminal's menu changes: with no type yet (an unwired Adapt to Type parameter) Constant, Control, Indicator and
 * Channel Writer... are greyed, as measured. A typed parameter has them enabled (the error terminals' were measured enabled,
 * and so was a DAQ name's); Channel Writer... is greyed in Solder anyway, it has no channels yet.
 */
export function menuVariants(graph, ctx, node, port) {
  const direction = PARAMETER_PORT.exec(port)?.[1];
  const types = Gr.tipos(graph, ctx.cat);
  const type = (direction === "in" ? types.entradas : types.salidas).get(`${node.id}.${port}`);
  return type === undefined ? { desactivados: new Set(CREATE_ROWS_THAT_NEED_A_TYPE.map((row) => `${TERMINAL_MENU_ROOT}.create.${row}`)) } : {};
}
