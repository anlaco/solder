// LabVIEW 2026 Q3's 36 connector pane patterns (DT-075): each by its number (4800–4835, what LabVIEW's
// ConnectorPane.Pattern gives), with the rectangle of each terminal in the order of the connector index, and the
// order of the 6 × 6 grid of the Patterns submenu. Spec/05 §12.
//
// Measured two ways that agree (labview-captures/reports/2026-11-05-connector-4833.md): the table of NI's example
// Connector Pane Pattern Reference.vi read as data, and VIs built by scripting with control tN on index N, whose
// terminals were found on a subVI node. The grid order was matched thumbnail by thumbnail against the table; its
// cell counts are those of Solder's own capture (labview-captures/subvi/connector-patterns-grid-zoom2x.png).

/** Each pattern's terminals, index = connector index: [left, top, right, bottom) in the 32 × 32 icon's pixels. */
const TERMINAL_RECTS = {
  4800: [[0,0,32,32]],
  4801: [[16,0,32,32],[0,0,16,32]],
  4802: [[16,0,32,32],[0,16,16,32],[0,0,16,16]],
  4803: [[0,21,32,32],[0,11,32,21],[0,0,32,11]],
  4804: [[16,0,32,32],[0,21,16,32],[0,11,16,21],[0,0,16,11]],
  4805: [[16,16,32,32],[16,0,32,16],[0,16,16,32],[0,0,16,16]],
  4806: [[0,24,32,32],[0,16,32,24],[0,8,32,16],[0,0,32,8]],
  4807: [[16,16,32,32],[16,0,32,16],[0,21,16,32],[0,11,16,21],[0,0,16,11]],
  4808: [[16,0,32,32],[0,24,16,32],[0,16,16,24],[0,8,16,16],[0,0,16,8]],
  4809: [[16,16,32,32],[16,0,32,16],[0,24,16,32],[0,16,16,24],[0,8,16,16],[0,0,16,8]],
  4810: [[16,21,32,32],[16,11,32,21],[16,0,32,11],[0,21,16,32],[0,11,16,21],[0,0,16,11]],
  4811: [[16,21,32,32],[16,11,32,21],[16,0,32,11],[0,24,16,32],[0,16,16,24],[0,8,16,16],[0,0,16,8]],
  4812: [[16,24,32,32],[16,16,32,24],[16,8,32,16],[16,0,32,8],[0,24,16,32],[0,16,16,24],[0,8,16,16],[0,0,16,8]],
  4813: [[16,24,32,32],[16,16,32,24],[16,8,32,16],[16,0,32,8],[8,0,16,32],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4814: [[16,24,32,32],[16,16,32,24],[16,8,32,16],[16,0,32,8],[8,16,16,32],[8,0,16,16],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4815: [[24,24,32,32],[24,16,32,24],[24,8,32,16],[24,0,32,8],[16,16,24,32],[16,0,24,16],[8,16,16,32],[8,0,16,16],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4816: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,32,32]],
  4817: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,32,16],[16,16,32,32]],
  4818: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,32,11],[16,11,32,21],[16,21,32,32]],
  4819: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,32,8],[16,8,32,16],[16,16,32,24],[16,24,32,32]],
  4820: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,24,11],[24,0,32,11],[16,11,32,21],[16,21,24,32],[24,21,32,32]],
  4821: [[0,0,8,11],[8,0,16,11],[0,11,16,21],[0,21,8,32],[8,21,16,32],[16,0,24,16],[24,0,32,8],[24,8,32,16],[16,16,24,32],[24,16,32,24],[24,24,32,32]],
  4822: [[0,0,8,8],[8,0,16,16],[0,8,8,16],[0,16,8,24],[8,16,16,32],[0,24,8,32],[16,0,32,11],[16,11,32,21],[16,21,32,32]],
  4823: [[0,0,8,8],[0,8,8,16],[0,16,8,24],[0,24,8,32],[8,0,16,32],[16,0,32,32]],
  4824: [[0,0,8,8],[0,8,8,16],[0,16,8,24],[0,24,8,32],[8,0,16,32],[16,0,32,16],[16,16,32,32]],
  4825: [[0,0,8,8],[0,8,8,16],[0,16,8,24],[0,24,8,32],[8,0,16,32],[16,0,32,11],[16,11,32,21],[16,21,32,32]],
  4826: [[24,24,32,32],[24,16,32,24],[24,8,32,16],[24,0,32,8],[16,0,24,32],[8,0,16,32],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4827: [[16,0,32,32],[8,16,16,32],[8,0,16,16],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4828: [[16,16,32,32],[16,0,32,16],[8,16,16,32],[8,0,16,16],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4829: [[24,24,32,32],[24,16,32,24],[24,8,32,16],[24,0,32,8],[16,0,24,32],[8,16,16,32],[8,0,16,16],[0,24,8,32],[0,16,8,24],[0,8,8,16],[0,0,8,8]],
  4830: [[21,0,32,32],[11,0,21,32],[0,16,11,32],[0,0,11,16]],
  4831: [[21,0,32,32],[11,0,21,32],[0,21,11,32],[0,11,11,21],[0,0,11,11]],
  4832: [[21,16,32,32],[21,0,32,16],[11,0,21,32],[0,21,11,32],[0,11,11,21],[0,0,11,11]],
  4833: [[0,0,7,7],[7,0,13,16],[13,0,19,16],[19,0,25,16],[25,0,32,7],[0,7,7,13],[25,7,32,13],[0,13,7,19],[25,13,32,19],[0,19,7,25],[25,19,32,25],[0,25,7,32],[7,16,13,32],[13,16,19,32],[19,16,25,32],[25,25,32,32]],
  4834: [[0,0,6,6],[0,6,6,11],[0,11,6,16],[0,16,6,21],[0,21,6,26],[0,26,6,32],[6,0,11,16],[6,16,11,32],[11,0,16,16],[11,16,16,32],[16,0,21,16],[16,16,21,32],[21,0,26,16],[21,16,26,32],[26,0,32,6],[26,6,32,11],[26,11,32,16],[26,16,32,21],[26,21,32,26],[26,26,32,32]],
  4835: [[0,0,4,4],[0,4,4,8],[0,8,4,12],[0,12,4,16],[0,16,4,20],[0,20,4,24],[0,24,4,28],[0,28,4,32],[4,0,8,16],[4,16,8,32],[8,0,12,16],[8,16,12,32],[12,0,16,16],[12,16,16,32],[16,0,20,16],[16,16,20,32],[20,0,24,16],[20,16,24,32],[24,0,28,16],[24,16,28,32],[28,0,32,4],[28,4,32,8],[28,8,32,12],[28,12,32,16],[28,16,32,20],[28,20,32,24],[28,24,32,28],[28,28,32,32]],
};

/** The patterns in the order of the Patterns submenu's grid, left to right and top to bottom (measured). */
const GRID_ORDER = [
  4800, 4803, 4806, 4801, 4802, 4805,
  4830, 4804, 4807, 4831, 4832, 4810,
  4808, 4809, 4811, 4812, 4816, 4823,
  4824, 4817, 4818, 4825, 4819, 4813,
  4820, 4826, 4821, 4827, 4828, 4822,
  4814, 4829, 4815, 4833, 4834, 4835,
];

export const PATTERN_GRID_COLUMNS = 6;
/** LabVIEW's default pattern, 4-2-2-4 (measured: the one outlined in a blank VI's grid; the only one of 12 terminals). */
export const DEFAULT_PATTERN = 4815;
const DEFAULT_PATTERN_NAME = "4-2-2-4";
/** The thumbnail's frame is 0–31: a rectangle's exclusive edge at 32 is drawn on the line at 31. */
const THUMBNAIL_LAST_LINE = 31;

const idOfGridPlace = (index) => `pattern-${String(index + 1).padStart(2, "0")}`;
const asRect = ([left, top, right, bottom]) => ({ x: left, y: top, width: right - left, height: bottom - top });
const asThumbnailCell = ([left, top, right, bottom]) => ({ left, top, right: Math.min(right, THUMBNAIL_LAST_LINE), bottom: Math.min(bottom, THUMBNAIL_LAST_LINE) });

/**
 * Every pattern, in grid order: `{ id, number, name, terminals, cells }`. `id` names its place in the grid (the
 * menu's rows), `terminals` the rectangle of each connector index, `cells` the lines of its thumbnail; `name` is only
 * known for 4-2-2-4.
 */
export const CONNECTOR_PATTERNS = GRID_ORDER.map((number, index) => ({
  id: idOfGridPlace(index),
  number,
  name: number === DEFAULT_PATTERN ? DEFAULT_PATTERN_NAME : null,
  terminals: TERMINAL_RECTS[number].map(asRect),
  cells: TERMINAL_RECTS[number].map(asThumbnailCell),
}));

/** The pattern with this LabVIEW number, or `undefined`. */
export const patternNumbered = (number) => CONNECTOR_PATTERNS.find((pattern) => pattern.number === number);

/** The pattern whose name is the given one (`4-2-2-4`), or `undefined`. */
export const patternNamed = (name) => CONNECTOR_PATTERNS.find((pattern) => pattern.name === name);

/** Row and column (1-based) of a pattern in the grid. */
export const gridPosition = (patternId) => {
  const index = CONNECTOR_PATTERNS.findIndex((pattern) => pattern.id === patternId);
  return { row: Math.floor(index / PATTERN_GRID_COLUMNS) + 1, column: (index % PATTERN_GRID_COLUMNS) + 1 };
};
