// How a broken wire is drawn (DT-046), measured at 1:1 in LabVIEW 2026 Q3
// (labview-captures/broken-wires/REPORT.md §5, pixel dumps of 19-delete-loop.png,
// 42-all-three.png and 55-state.png). Pure geometry and SVG, no DOM.
//
// A broken wire is drawn the same whatever breaks it (a loose end, types that do
// not match): black dashes along its whole path, ONE red cross near the middle of
// the path with the dashes running under it, and two solid arrowheads flanking
// the cross, each in the colour of the type at its end (black where the end is
// loose). Nothing is drawn at a loose end: the dashes just stop.

import * as Gr from "../../../core/model/graph.mjs";

/** Dash and gap of the broken wire, in px (REPORT §5: 4 on, 4 off, 1 px thick, horizontal and vertical alike). */
export const DASH_LENGTH = 4;
export const WIRE_COLOR = "#000000";

/** The red cross: 10 × 10 px, red fill and black outline (REPORT §5: fill #CC0000, 32 red pixels). */
export const CROSS_SIZE = 10;
export const CROSS_FILL = "#cc0000";
/** Thickness of the arms of the cross, chosen so that the fill is about the 32 red pixels measured. */
const CROSS_ARM = 3.4;

/** Arrowhead: 5 px along the wire, 9 px across it (REPORT §5: a solid triangle of 25 px). */
export const HEAD_LENGTH = 5;
export const HEAD_WIDTH = 9;
/** The colour of an end with nothing on it (REPORT §5: black when that end is loose). */
export const LOOSE_END_COLOR = "#000000";
/** Space between the upstream arrowhead and the cross; the other side touches it (REPORT §5: gap 2 px on one side, 0 on the other). */
const GAP_UPSTREAM = 2;
const GAP_DOWNSTREAM = 0;

const round = (value) => Number(value.toFixed(2));

/** The point of the diagram where an end of a wire is: the loose point, or the terminal it is wired to. */
export const endPoint = (end, terminals) => (Gr.esSuelto(end) ? { x: end.suelto[0], y: end.suelto[1] } : terminals.get(`${end.nodo}.${end.puerto}`));

/**
 * The point at half the length of the path, and the unit vector of the wire
 * there (from source to sink). Measured by eye in three cases only (REPORT §5:
 * "approximate"), so the half of the total length is what is drawn.
 */
export function pathMiddle(route) {
  const segments = [];
  for (let k = 0; k < route.length - 1; k++) {
    const [[x1, y1], [x2, y2]] = [route[k], route[k + 1]];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > 0) segments.push({ x1, y1, x2, y2, length });
  }
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!segments.length) return { x: route[0][0], y: route[0][1], direction: { x: 1, y: 0 } };
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        x: segment.x1 + (segment.x2 - segment.x1) * ratio,
        y: segment.y1 + (segment.y2 - segment.y1) * ratio,
        direction: { x: Math.sign(segment.x2 - segment.x1), y: Math.sign(segment.y2 - segment.y1) },
      };
    }
    remaining -= segment.length;
  }
  const last = segments.at(-1);
  return { x: last.x2, y: last.y2, direction: { x: Math.sign(last.x2 - last.x1), y: Math.sign(last.y2 - last.y1) } };
}

const pointsAttribute = (points) => points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

/** The outline of an X of CROSS_SIZE centred on (x, y). */
function crossPolygon(x, y) {
  // The 1 px outline is drawn centred on the edge, so the polygon is half a pixel inside the 10 × 10 box.
  const half = CROSS_SIZE / 2 - 0.5;
  const arm = CROSS_ARM / 2;
  const notch = CROSS_ARM * 0.5;
  const outline = [
    [-half, -half], [-arm, -half], [0, -notch], [arm, -half], [half, -half],
    [half, -arm], [notch, 0], [half, arm], [half, half],
    [arm, half], [0, notch], [-arm, half], [-half, half],
    [-half, arm], [-notch, 0], [-half, -arm],
  ];
  return outline.map(([dx, dy]) => [x + dx, y + dy]);
}

/** A solid triangle centred on (x, y) whose tip points along `direction` (a unit vector on an axis). */
function arrowhead(x, y, direction, color) {
  const across = { x: -direction.y, y: direction.x };
  const [halfLength, halfWidth] = [HEAD_LENGTH / 2, HEAD_WIDTH / 2];
  const tip = [x + direction.x * halfLength, y + direction.y * halfLength];
  const baseCentre = [x - direction.x * halfLength, y - direction.y * halfLength];
  const corners = [-halfWidth, halfWidth].map((side) => [baseCentre[0] + across.x * side, baseCentre[1] + across.y * side]);
  return `<polygon class="cable-flecha" points="${pointsAttribute([tip, ...corners])}" fill="${color}"/>`;
}

/**
 * The marks of a broken wire on its `route`: the dashes, then the cross and the two arrowheads.
 * `sourceColor` and `sinkColor` are the type colours of the two ends, or `null` for a loose end.
 * Upstream head: the source's colour pointing downstream, or black pointing back to the loose source.
 * Downstream head: the sink's colour, or black for a loose sink, always pointing downstream.
 */
export function brokenWireMarks(route, { sourceColor, sinkColor }) {
  const dashes = `<polyline points="${pointsAttribute(route)}" class="cable-roto" stroke="${WIRE_COLOR}" stroke-width="1" stroke-dasharray="${DASH_LENGTH} ${DASH_LENGTH}"/>`;
  const { x, y, direction } = pathMiddle(route);
  const half = CROSS_SIZE / 2;
  const upstreamOffset = half + GAP_UPSTREAM + HEAD_LENGTH / 2;
  const downstreamOffset = half + GAP_DOWNSTREAM + HEAD_LENGTH / 2;
  const backwards = { x: -direction.x, y: -direction.y };
  const upstream = arrowhead(x - direction.x * upstreamOffset, y - direction.y * upstreamOffset, sourceColor ? direction : backwards, sourceColor ?? LOOSE_END_COLOR);
  const downstream = arrowhead(x + direction.x * downstreamOffset, y + direction.y * downstreamOffset, direction, sinkColor ?? LOOSE_END_COLOR);
  const cross = `<polygon class="cable-cruz" points="${pointsAttribute(crossPolygon(x, y))}" fill="${CROSS_FILL}" stroke="#000000" stroke-width="1"/>`;
  return { dashes, marks: `<g class="cable-roto-marcas">${upstream}${downstream}${cross}</g>` };
}
