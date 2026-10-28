/**
 * A wire as LabVIEW draws it: one source and a tree of segments out to its sinks (DT-068). Solder keeps one route
 * per sink; the tree is the union of the routes that leave the same source, and its junctions are where two of them
 * part. Nothing about the tree is stored, so a junction always lies on the wire, however nodes and segments move
 * (measured in LabVIEW 2026 Q3, labview-captures/reports/2026-10-28-wire-junctions-a.md and -b.md).
 *
 * A route is the list of points `ruta` gives: orthogonal segments from the source to the sink.
 */

const samePoint = ([x1, y1], [x2, y2]) => x1 === x2 && y1 === y2;

/** The segments of a route that have a length, each as its start, its unit direction and its length. */
function segmentsOf(route) {
  const segments = [];
  for (let k = 0; k < route.length - 1; k++) {
    const [[x1, y1], [x2, y2]] = [route[k], route[k + 1]];
    const length = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    if (length) segments.push({ start: [x1, y1], direction: [Math.sign(x2 - x1), Math.sign(y2 - y1)], length });
  }
  return segments;
}

/**
 * Where two routes from the same source part: walking both from the source, the last point they have in common.
 * Null when they never coincide, or when one is the other (nothing parts).
 */
export function partingPoint(routeA, routeB) {
  if (!routeA.length || !routeB.length || !samePoint(routeA[0], routeB[0])) return null;
  const [a, b] = [segmentsOf(routeA), segmentsOf(routeB)];
  let [i, j] = [0, 0];
  let [leftA, leftB] = [a[0]?.length ?? 0, b[0]?.length ?? 0];
  let point = [...routeA[0]];
  while (i < a.length && j < b.length) {
    if (!samePoint(a[i].direction, b[j].direction)) return point;
    const step = Math.min(leftA, leftB);
    point = [point[0] + a[i].direction[0] * step, point[1] + a[i].direction[1] * step];
    leftA -= step;
    leftB -= step;
    if (!leftA && ++i < a.length) leftA = a[i].length;
    if (!leftB && ++j < b.length) leftB = b[j].length;
  }
  return i < a.length || j < b.length ? point : null;
}

/**
 * The junction dots of one source's wire: every point where two of its routes part. A route that parts from another
 * at the source terminal itself has no dot there, as a terminal is not a junction.
 */
export function junctionPoints(routes) {
  const points = new Map();
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const point = partingPoint(routes[i], routes[j]);
      if (point && !samePoint(point, routes[i][0])) points.set(`${point[0]},${point[1]}`, point);
    }
  }
  return [...points.values()];
}

/**
 * How many of the first segments (as `ruta` numbers them) two routes from the same source share: each starts at the
 * same point and runs the same way, even if one of them goes further. Dragging one of these moves both routes.
 */
export function sharedSegmentCount(routeA, routeB) {
  let count = 0;
  while (count < routeA.length - 1 && count < routeB.length - 1) {
    const [startA, endA, startB, endB] = [routeA[count], routeA[count + 1], routeB[count], routeB[count + 1]];
    if (!samePoint(startA, startB)) break;
    const directionA = [Math.sign(endA[0] - startA[0]), Math.sign(endA[1] - startA[1])];
    const directionB = [Math.sign(endB[0] - startB[0]), Math.sign(endB[1] - startB[1])];
    if (!samePoint(directionA, directionB)) break;
    count++;
  }
  return count;
}
