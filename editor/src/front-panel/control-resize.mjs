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
 * stored offset does). All measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-19-control-resizing.md
 * §1, §3, §5; 2026-11-24-control-resizing-2.md; 2026-11-24-control-resizing-3.md).
 */
const RULES = {
  "visa-control": { sides: BOTH_AXES, smallest: { width: 43, height: DEFAULT }, labelStaysOnLeftDrag: true },
  "visa-indicator": { sides: BOTH_AXES, smallest: { width: 26, height: DEFAULT }, labelStaysOnLeftDrag: true },
  "str-control": { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT } },
  "str-indicator": { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT } },
  "path-control": { sides: BOTH_AXES, smallest: { width: 25, height: DEFAULT } },
  "path-indicator": { sides: BOTH_AXES, smallest: { width: 25, height: DEFAULT } },
  // A numeric never grows taller; its narrowest is counted after a control's incrementer (Solder's box holds it, LabVIEW's does not).
  control: { sides: HORIZONTAL_ONLY, smallest: { width: 13, height: DEFAULT }, afterIncrementer: true },
  indicator: { sides: HORIZONTAL_ONLY, smallest: { width: 18, height: DEFAULT } },
  // An enum and the rings grow both ways, their incrementer left outside LabVIEW's box (reports/2026-11-24-control-resizing-2.md
  // §1, §2): the Text Ring control's narrowest is 22, its indicator's and the enum's 16 (why they differ is unmeasured).
  enum: { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT }, afterIncrementer: true },
  "text-ring": { sides: BOTH_AXES, smallest: { width: 22, height: DEFAULT }, afterIncrementer: true },
  "text-ring-indicator": { sides: BOTH_AXES, smallest: { width: 16, height: DEFAULT }, afterIncrementer: true },
  "menu-ring": { sides: BOTH_AXES, smallest: { width: 33, height: DEFAULT } },
  // A DAQ name resizes as the VISA resource name it is drawn like (§1, §2); it has no visible label, so whether the
  // label stays on a left drag is the VISA name's, unmeasured.
  "daq-name-control": { sides: BOTH_AXES, smallest: { width: 43, height: DEFAULT }, labelStaysOnLeftDrag: true },
  "daq-name-indicator": { sides: BOTH_AXES, smallest: { width: 26, height: DEFAULT }, labelStaysOnLeftDrag: true },
  // Measured (reports/2026-11-24-control-resizing-3.md §1–§4). A Boolean's drawing stretches to its box, both ways,
  // its aspect not kept, down to 5 × 5 (a small Round LED shows 4 handles, not drawn: Solder always shows 8).
  "bool-control": { sides: BOTH_AXES, smallest: { width: 5, height: 5 } },
  "bool-indicator": { sides: BOTH_AXES, smallest: { width: 5, height: 5 } },
  // An error cluster's shell takes the growth round elements that keep their size and place, down to 13 × 13. A file
  // refnum is not resizable (measured on the Byte Stream File Refnum), so it has no rule.
  "error-cluster": { sides: BOTH_AXES, smallest: { width: 13, height: 13 } },
  // A graph's plot area takes what its frame grows by, its margins kept; the smallest leaves a plot of about 3 px.
  "waveform-chart": { sides: BOTH_AXES, smallest: { width: 99, height: 55 } },
  "waveform-graph": { sides: BOTH_AXES, smallest: { width: 99, height: 55 } },
  "xy-graph": { sides: BOTH_AXES, smallest: { width: 97, height: 55 } },
};

/** How a kind of object resizes (`kind`: its block, or "enum", "text-ring", "text-ring-indicator", "menu-ring", "error-cluster"), or null. */
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
