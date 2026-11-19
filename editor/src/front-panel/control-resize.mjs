// Resizing a control or indicator by its handles with the Positioning tool (GitHub issue #21). The size is kept in the
// placement's `w` and `h`, which the .ovi already stores for every panel object (qvi-format.mjs); a size equal to the
// default is not kept. Arrays, users' clusters and free labels have handles of their own (front-panel.mjs).

import { HANDLE_SIDES, handlesHtml, stretchedBox } from "../common/free-labels.mjs";

const BOTH_AXES = HANDLE_SIDES;
const HORIZONTAL_ONLY = ["e", "w"];
/** The smallest box is the default one: the object only grows. */
const DEFAULT = null;

/**
 * How each kind of object resizes: the sides it has handles on, the smallest box (`DEFAULT` for the default box) and
 * whether its label stays put when the left handle is dragged (every other label follows the left edge, as Solder's
 * stored offset does). `measured` rules come from LabVIEW 2026 Q3 (labview-captures/reports/2026-11-19-control-resizing.md
 * §1, §3, §5); the rest are unverified, pending a review in LabVIEW (docs/design/labview-plan.md, "Cross-cutting"), and
 * follow the measured kind they look most like.
 */
const RULES = {
  "visa-control": { sides: BOTH_AXES, smallest: { width: 43, height: DEFAULT }, labelStaysOnLeftDrag: true, measured: true },
  "visa-indicator": { sides: BOTH_AXES, smallest: { width: 26, height: DEFAULT }, labelStaysOnLeftDrag: true, measured: true },
  "str-control": { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT }, measured: true },
  "str-indicator": { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT }, measured: true },
  "path-control": { sides: BOTH_AXES, smallest: { width: 25, height: DEFAULT }, measured: true },
  "path-indicator": { sides: BOTH_AXES, smallest: { width: 25, height: DEFAULT }, measured: true },
  // A numeric never grows taller; its narrowest is counted after a control's incrementer (Solder's box holds it, LabVIEW's does not).
  control: { sides: HORIZONTAL_ONLY, smallest: { width: 13, height: DEFAULT }, afterIncrementer: true, measured: true },
  indicator: { sides: HORIZONTAL_ONLY, smallest: { width: 18, height: DEFAULT }, measured: true },
  // Unverified: an enum and the rings as a numeric.
  enum: { sides: HORIZONTAL_ONLY, smallest: { width: 13, height: DEFAULT }, afterIncrementer: true },
  "text-ring": { sides: HORIZONTAL_ONLY, smallest: { width: 13, height: DEFAULT }, afterIncrementer: true },
  "menu-ring": { sides: HORIZONTAL_ONLY, smallest: { width: 30, height: DEFAULT } },
  // Unverified: a DAQ name as the VISA resource name it is drawn like.
  "daq-name-control": { sides: BOTH_AXES, smallest: { width: 43, height: DEFAULT }, labelStaysOnLeftDrag: true },
  "daq-name-indicator": { sides: BOTH_AXES, smallest: { width: 26, height: DEFAULT }, labelStaysOnLeftDrag: true },
  // Unverified: a Boolean's drawing scales to its box, both ways, down to a few pixels.
  "bool-control": { sides: BOTH_AXES, smallest: { width: 8, height: 8 } },
  "bool-indicator": { sides: BOTH_AXES, smallest: { width: 8, height: 8 } },
  // Unverified: a refnum's page scales to its box; an error cluster's shell grows round elements that keep their place.
  "refnum-control": { sides: BOTH_AXES, smallest: { width: DEFAULT, height: DEFAULT } },
  "refnum-indicator": { sides: BOTH_AXES, smallest: { width: DEFAULT, height: DEFAULT } },
  "error-cluster": { sides: BOTH_AXES, smallest: { width: DEFAULT, height: DEFAULT } },
  // Unverified: a graph's plot area takes what its frame grows by; the smallest leaves a plot of about 50 × 50.
  "waveform-chart": { sides: BOTH_AXES, smallest: { width: 150, height: 100 } },
  "waveform-graph": { sides: BOTH_AXES, smallest: { width: 150, height: 100 } },
  "xy-graph": { sides: BOTH_AXES, smallest: { width: 150, height: 100 } },
};

/** How a kind of object resizes (`kind`: its block, or "enum", "text-ring", "menu-ring", "error-cluster"), or null. */
export const resizeRule = (kind) => RULES[kind] ?? null;

const growsTaller = (rule) => rule.sides.includes("s");

/** The box of a resizable node: its default box with the width and height it was resized to. */
export function sizedBox(node, rule, defaultBox) {
  const width = node.panel.w ?? defaultBox.ancho;
  const height = growsTaller(rule) ? node.panel.h ?? defaultBox.alto : defaultBox.alto;
  return { ...defaultBox, ancho: width, alto: height };
}

/** Whether the node was made taller than its default, so a string's or a VISA resource name's text wraps onto more rows. */
export const isTall = (box, defaultBox) => box.alto > defaultBox.alto;

/** The handles of a selected resizable node, inside its box (only a selected object shows them, report §1). */
export const controlHandlesHtml = (node, rule, box) => handlesHtml(node, box, { shown: true, attribute: "data-asa-control", sides: rule.sides });

/** The smallest box of a rule, in Solder's box: a numeric's narrowest width is counted after its incrementer (`casilla`). */
function smallestBox(rule, defaultBox) {
  const incrementer = rule.afterIncrementer ? defaultBox.casilla ?? 0 : 0;
  const width = rule.smallest.width === DEFAULT ? defaultBox.ancho : rule.smallest.width + incrementer;
  const height = rule.smallest.height === DEFAULT ? defaultBox.alto : rule.smallest.height;
  return { ancho: width, alto: height };
}

/**
 * The node after its `side` handle is dragged by (dx, dy). `start`: `{ box, defaultBox, labelOffset }` when the drag
 * began.
 */
export function stretchedControl(node, rule, start, side, dx, dy) {
  const box = stretchedBox(start.box, side, dx, dy, smallestBox(rule, start.defaultBox));
  const panel = { ...node.panel, x: box.x, y: box.y, w: keptSize(box.ancho, start.defaultBox.ancho), h: keptSize(box.alto, start.defaultBox.alto) };
  const movedLeft = box.x - start.box.x;
  if (rule.labelStaysOnLeftDrag && movedLeft) panel.etiqueta = [start.labelOffset[0] - movedLeft, start.labelOffset[1]];
  return { ...node, panel: withoutUndefined(panel) };
}

const keptSize = (size, defaultSize) => (size === defaultSize ? undefined : size);

const withoutUndefined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
