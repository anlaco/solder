// The control reference constant (DT-072 §2) as a node of the Block Diagram, and the names LabVIEW gives the classes of
// the panel controls.
//
// Measured at 1:1 in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-03-control-references.md Q1, Q4, Q6): Create ▸
// Reference makes a constant 19 px tall, with a 2 px frame in the control's type colour, the nodes' cream inside, a
// refnum glyph (a curved arrow) and the class's name in the type colour ("Digital", 54 px wide; "Boolean", 62 px); the
// control's label is drawn above it. Its wire is teal, 1 px and solid.
//
// Pure geometry and drawing, like property-nodes.mjs: no DOM.

import { aspecto } from "../../../core/model/types.mjs";
import { linkedControlType } from "../../../core/model/graph.mjs";

export const CONTROL_REFERENCE = "control-reference";

export const isControlReference = (node) => node?.tipo === CONTROL_REFERENCE;

/** The class a reference is of: its type's (`{ refnum: "Numeric" }`). */
export const referenceClass = (node) => node.config?.type?.refnum;

/**
 * How LabVIEW names a panel control's class: on the reference constant (Q1), in an explicit Property Node's header
 * (Q4, Q6) and in Create ▸ Property for … Class (Q3). Measured for the numeric and the Boolean; the string's are
 * **unverified** (its class name with " (strict)", as the Boolean's).
 */
const CLASS_NAMES = Object.freeze({
  Numeric: { reference: "Digital", header: "DigNum (strict)", menu: "Digital (strict)" },
  Boolean: { reference: "Boolean", header: "Bool (strict)", menu: "Boolean (strict)" },
  String: { reference: "String", header: "String (strict)", menu: "String (strict)" },
});

const namesOf = (className) => CLASS_NAMES[className] ?? { reference: className, header: className, menu: className };
export const referenceText = (className) => namesOf(className).reference;
export const strictHeaderText = (className) => namesOf(className).header;
export const strictMenuName = (className) => namesOf(className).menu;

/** The configuration of the constant Create ▸ Reference makes for the panel control `linkName` of `className`. */
export const referenceConfig = (className, linkName) => ({ type: { refnum: className }, link: linkName });

const HEIGHT = 19;
const FRAME = 2;
/** The text starts after the glyph (x 5..11) and leaves this much room on the right (Q1: "Digital" in 54 px). */
const TEXT_LEFT = 14;
const TEXT_RIGHT = 6;
const GLYPH = { x: 5, y: 5 };
const GLYPH_COLOR = "#000000";

export function referenceSize(node, measure) {
  return { ancho: Math.ceil(TEXT_LEFT + measure(referenceText(referenceClass(node))) + TEXT_RIGHT), alto: HEIGHT };
}

/** The point it hangs from while placed: its centre, as measured (dropped centred on the click). */
export function referenceGrabPoint(config, measure) {
  const { ancho, alto } = referenceSize({ tipo: CONTROL_REFERENCE, config }, measure);
  return { x: Math.round(ancho / 2), y: Math.round(alto / 2) };
}

/** Its one terminal: the reference, at the middle of the right edge. */
export function referenceTerminals(node, box) {
  const [x, y] = [box.x + box.ancho, box.y + box.alto / 2];
  const half = 4;
  return [{ puerto: "reference", etiqueta: "", dir: "out", x, y, zona: { x: x - 2 * half, y: box.y, ancho: 2 * half, alto: box.alto }, centro: { x, y } }];
}

/** The refnum glyph: a curved arrow pointing up and right, 7 x 10 (drawn anew). */
const ARROW = `<path d="M${GLYPH.x + 1} ${GLYPH.y + 10}V${GLYPH.y + 6}Q${GLYPH.x + 1} ${GLYPH.y + 3} ${GLYPH.x + 4} ${GLYPH.y + 3}H${GLYPH.x + 5}" fill="none" stroke="${GLYPH_COLOR}" stroke-width="1.5"/><path d="M${GLYPH.x + 4} ${GLYPH.y}L${GLYPH.x + 7} ${GLYPH.y + 3}L${GLYPH.x + 4} ${GLYPH.y + 6}Z" fill="${GLYPH_COLOR}"/>`;

/** The body: the type-coloured frame, the cream inside, the glyph and the class's name. */
export function referenceBody(graph, cat, node, box) {
  const color = aspecto(linkedControlType(graph, cat, node) ?? "number").color;
  return (
    `<svg class="formato" viewBox="0 0 ${box.ancho} ${box.alto}">` +
    `<rect x="${FRAME / 2}" y="${FRAME / 2}" width="${box.ancho - FRAME}" height="${box.alto - FRAME}" fill="var(--node-fill)" stroke="${color}" stroke-width="${FRAME}"/>` +
    ARROW +
    `<text class="nombre-propiedad clase-referencia" x="${TEXT_LEFT}" y="${box.alto / 2}" fill="${color}">${escapeText(referenceText(referenceClass(node)))}</text></svg>`
  );
}

const escapeText = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
