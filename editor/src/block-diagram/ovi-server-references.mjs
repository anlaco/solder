// The OVI Server Reference constant (DT-090) as a node of the Block Diagram: its look, its terminal and its menu.
//
// Measured at 1:1 in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-14-vi-server-reference.md "Placed" and "Menu"): it
// is drawn like the control reference constant (control-references.mjs), 19 px tall with a 2 px frame and the text in
// teal #007f7f, the nodes' cream inside; "This OVI" is 52 px wide and "This Application" 102 px, and it grows about its
// centre when the text changes. Its label is visible by default, above it, and shows the same text. Its one terminal is at
// the right edge, in the vertical middle. Solder says OVI for OVI (DT-071), so the first one reads "This OVI".
//
// Pure geometry, drawing and menu rules, like control-references.mjs: no DOM.

import { OVI_SERVER_REFERENCE, APPLICATION_CLASS, OVI_CLASS, THIS_APPLICATION_TYPE, THIS_OVI_TYPE, linkText } from "../../../core/model/ovi-server-reference.mjs";
import { fijarConfig } from "../../../core/model/graph.mjs";
import { aspecto } from "../../../core/model/types.mjs";
import { constantBody, constantGrabPoint, constantSize, constantTerminals } from "./control-references.mjs";
import { labelWithText } from "./property-nodes.mjs";

export { OVI_SERVER_REFERENCE };

export const isOviServerReference = (node) => node?.tipo === OVI_SERVER_REFERENCE;

/** The class a constant is of: the OVI's unless it was linked to the application (LabVIEW places it as This VI). */
export const classOf = (node) => node?.config?.type?.refnum ?? OVI_CLASS;

/** What it shows, and what its label shows too. */
export const textOf = (node) => linkText(classOf(node));

export const size = (node, measure) => constantSize(textOf(node), measure);

/** It hangs from the cursor by its centre while placed (as the control reference's, measured). */
export const grabPoint = (config, measure) => constantGrabPoint(linkText(config?.type?.refnum ?? OVI_CLASS), measure);

export const terminals = (node, box) => constantTerminals(box);

/** The frame and the text are the refnums' teal (#007f7f measured; the wire's is the same). */
const colorOf = (node) => aspecto({ refnum: classOf(node) }).color;

export const body = (node, box) => constantBody(box, colorOf(node), textOf(node));

/** Its label, drawn above it and equal to its text (measured). */
export const label = (node) => labelWithText(textOf(node));

/** The graph with the node's left edge moved so that its centre stays where it was while its width changes. */
function keepCentre(before, after, measure, nodeId) {
  const [old, changed] = [before, after].map((graph) => graph.nodos.find((node) => node.id === nodeId));
  const shift = Math.round((size(changed, measure).ancho - size(old, measure).ancho) / 2);
  return shift ? { ...after, nodos: after.nodos.map((node) => (node.id === nodeId ? { ...node, x: node.x - shift } : node)) } : after;
}

// ——— The menu ———

/** The right-click menu (measured: `menu-main.png`, `menu-linkto.png`, `menu-create.png` of the report). */
export const MENU_ROOT = "context.vi-server-reference";

/** The rows of Link to ▸ that change the class, by their id. */
const LINK_TYPES = Object.freeze({
  [`${MENU_ROOT}.link-to.this-application`]: THIS_APPLICATION_TYPE,
  [`${MENU_ROOT}.link-to.this-ovi`]: THIS_OVI_TYPE,
});

/** The row of Link to ▸ that is ticked for each class (measured: the check was on This OVI, the current one). */
const LINK_ROW_OF_CLASS = Object.freeze({
  [OVI_CLASS]: "this-ovi",
  [APPLICATION_CLASS]: "this-application",
});

/**
 * How Create ▸ names the class's properties and methods: "Property for OVI Class" was measured on This OVI. The
 * Application's own names are **unverified** (taken to follow the same pattern).
 */
const classRowLabels = (node) => {
  const className = classOf(node) === APPLICATION_CLASS ? "Application" : "OVI";
  return new Map([
    [`${MENU_ROOT}.create.property-for-class`, `Property for ${className} Class`],
    [`${MENU_ROOT}.create.method-for-class`, `Method for ${className} Class`],
  ]);
};

/** The variants of the menu: the class rows are named after the constant's class. */
export const menuVariants = (node) => ({ rotulos: classRowLabels(node) });

/** The rows ticked: the label (visible by default) and the class it is linked to. */
export const menuMarks = (node) => [`${MENU_ROOT}.visible-items.label`, `${MENU_ROOT}.link-to.${LINK_ROW_OF_CLASS[classOf(node)]}`];

/**
 * Link to ▸ This Application and This OVI change the class: one edit, so one step of undo; the node grows or shrinks
 * about its centre. Returns the new state, or null if `id` is not one of those rows.
 */
export function menuCommand(d, id, measure) {
  const type = LINK_TYPES[id];
  if (!type) return null;
  const node = d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  const changed = fijarConfig(d.g, node.id, { type });
  return { ...d, g: keepCentre(d.g, changed, measure, node.id), menu: null };
}
