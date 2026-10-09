// What a window remembers about its last paste, to shift the next one: pasting
// again without moving the pointer puts each copy 8 px down and to the right of
// the previous one (labview-captures/create-paste/paste-second-offset-8-8.png).

/** How far each repeated paste moves, down and to the right. */
export const REPEATED_PASTE_STEP = 8;

/** How many pastes in a row have been done at this pointer position: 0 for the first. */
export function repeatCount(memory, pointer) {
  const repeated = !!memory && memory.pointer.x === pointer.x && memory.pointer.y === pointer.y;
  return repeated ? memory.count + 1 : 0;
}

/** The memory to keep after a paste at `pointer` that was number `count`. */
export const remember = (pointer, count) => ({ pointer: { x: pointer.x, y: pointer.y }, count });
