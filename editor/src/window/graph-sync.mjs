// Keeping the two windows of a VI on the same graph.
//
// Each window holds its own copy and, when it changes, sends it to the other one
// over a BroadcastChannel (editor-window.mjs). Two messages that cross on their
// way —each window changed its copy before the other's arrived— used to swap
// the copies for good: every window ended up holding the other's older version,
// and saving from one window or the other saved a different VI.
//
// So that does not happen every copy carries a stamp: a revision number and the
// window that made it. A window takes an incoming copy only when its stamp is
// newer than the one it holds; an older one is not taken and is answered with
// the newer copy, so the sender catches up. When two windows change at the same
// time they stamp the same revision, and the window name decides which copy wins
// (the same in both windows), so both end up on it.

/** The stamp of a graph nobody has changed yet. */
export const initialStamp = () => ({ revision: 0, origin: "" });

/** The stamp of the copy a window makes by changing the one it holds, `origin` being the window's name. */
export const afterLocalChange = (held, origin) => ({ revision: held.revision + 1, origin });

/** Positive when stamp `a` is newer than `b`, negative when it is older and zero when they are the same. */
export function compareStamps(a, b) {
  if (a.revision !== b.revision) return a.revision - b.revision;
  if (a.origin === b.origin) return 0;
  return a.origin > b.origin ? 1 : -1;
}

/**
 * What a window holding the copy stamped `held` does with an incoming copy
 * stamped `incoming`: "newer" (take it), "stale" (keep its own and answer with
 * it) or "same" (nothing to do).
 */
export function judgeIncoming(held, incoming) {
  const order = compareStamps(incoming, held);
  if (order > 0) return "newer";
  return order < 0 ? "stale" : "same";
}
