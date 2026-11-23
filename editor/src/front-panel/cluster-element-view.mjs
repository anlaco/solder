// How an element of a user's cluster is drawn while the panel is unfolded (DT-106): as the panel object it is, over its
// cluster, clipped by the cluster's interior. Measured in LabVIEW 2026 Q3 (reports/2026-11-23-cluster-elements.md Q4): an
// element dragged over the cluster's edge shows only the part inside, and its handles are still drawn outside.
//
// The clip is a CSS `clip-path` on the element's own box (so the part outside takes no press either, and the cluster under
// it does): each side that crosses the interior's edge is cut there, and the others are left as they are, with room for
// whatever a style draws outside the box.

/** How far past a side that is not cut a style may still draw (shadows, bevels). */
const OVERFLOW_ROOM = 100;

const px = (amount) => `${Number(amount.toFixed(2))}px`;

/** How far the box goes past one side of the interior, or the room a side that is within it keeps. */
const cutOf = (excess) => (excess > 0 ? px(excess) : px(-OVERFLOW_ROOM));

/** The `clip-path` that keeps of `box` what lies in `interior` (both `{ x, y, ancho, alto }` on the panel), or undefined when all of it does. */
export function clipPathOf(box, interior) {
  const top = interior.y - box.y;
  const left = interior.x - box.x;
  const bottom = box.y + box.alto - (interior.y + interior.alto);
  const right = box.x + box.ancho - (interior.x + interior.ancho);
  if (top <= 0 && left <= 0 && bottom <= 0 && right <= 0) return undefined;
  return `inset(${cutOf(top)} ${cutOf(right)} ${cutOf(bottom)} ${cutOf(left)})`;
}

/** A selected element's handles, outside the clipped box so that the clip does not cut them (they stay drawn, measured), at the box's corner. */
export const handlesHost = (box, handles) => (handles ? `<div class="sd-element-handles" style="left:${px(box.x)};top:${px(box.y)}">${handles}</div>` : "");
