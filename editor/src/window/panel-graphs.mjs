// The two shapes of the OVI's graph in the Front Panel's window (DT-106): the panel is edited unfolded, with each element of
// a user's cluster an object of its own, and everything that leaves the window (the other window, the undo history, the
// file, the compiler) sees the graph folded, the elements inside their clusters.
//
// A graph is folded or unfolded once: the result is kept by the identity of the graph it came from, so that the window can
// ask for the folded shape of what it holds on every edit, or the unfolded one of what it receives, at the cost of a
// lookup, and so that a graph received and unfolded gives back, folded, the very graph it came from (the window compares
// graphs by identity to know whether something changed). The window unfolds whatever it takes in and only edits what it
// unfolded, so a graph this object has never seen and is asked to fold is an unfolded one.

import { foldClusters, unfoldClusters } from "../front-panel/cluster-unfolding.mjs";

/** `catalog()`: the catalog of the moment, which derives the type of a cluster from its elements when it is folded. */
export function createPanelGraphs(catalog) {
  /** unfolded graph → the folded graph it stands for. */
  const foldedOf = new WeakMap();
  /** folded graph → the unfolded graph it was unfolded into or folded from. */
  const unfoldedOf = new WeakMap();
  /** The graphs folding left as they were: folded already. */
  const foldedAlready = new WeakSet();

  function remember(unfolded, folded) {
    foldedOf.set(unfolded, folded);
    unfoldedOf.set(folded, unfolded);
  }

  /** The folded shape of `g`. */
  function fold(g) {
    if (unfoldedOf.has(g) || foldedAlready.has(g)) return g;
    if (foldedOf.has(g)) return foldedOf.get(g);
    const folded = foldClusters(g, catalog());
    if (folded === g) foldedAlready.add(g);
    else remember(g, folded);
    return folded;
  }

  /** The unfolded shape of `g`, a folded graph (what the window takes in always is). */
  function unfold(g) {
    if (!unfoldedOf.has(g)) remember(unfoldClusters(g), g);
    return unfoldedOf.get(g);
  }

  return { fold, unfold };
}
