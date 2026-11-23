// The right-click menu of an element of a user's cluster on the unfolded Front Panel (DT-106) is its control's own
// (measured: reports/2026-11-16-cluster-panel.md §4 lists the String element's rows; the Numeric's and Boolean's are the
// same plus theirs). The rows that work through the object's terminal on the diagram stay greyed, since an element has
// none (DT-095 §1): Create ▸ (Local Variable, Reference, Property Node, Invoke Node, which link by the terminal's name),
// and Replace ▸, which swaps the object where it stands. The rows that are not built say so as for every control.

const ROWS_WITHOUT_A_TERMINAL = ["create", "replace"];

const menuNode = (d) => d.menu && d.g.nodos.find((node) => node.id === d.menu.nodo);

/** The variants of the open menu when it is an element's: its rows with no terminal to work through are greyed. */
export function elementMenuVariants(d) {
  if (menuNode(d)?.inside === undefined) return {};
  return { desactivados: new Set(ROWS_WITHOUT_A_TERMINAL.map((row) => `${d.menu.raiz}.${row}`)) };
}
