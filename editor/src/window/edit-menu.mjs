// The Edit menu of the Front Panel and the Block Diagram: which rows are
// greyed out and which change their name with what is selected, as measured in
// labview-captures/create-paste/ (edit-menu-diagram-nothing-selected.png,
// edit-menu-diagram-with-selection.png and edit-menu-panel-with-control-selected.png).
//
// A pure module: the window passes what it knows and gets what to paint.

/** The commands of the menu that do something, by the last segment of their id. */
export const EDIT_COMMANDS = ["undo", "redo", "cut", "copy", "paste", "delete", "select-all", "remove-breakpoints-from-hierarchy"];

/** The id of the Edit menu of a window ("front-panel" or "block-diagram"). */
export const editMenuId = (windowName) => `window.${windowName}.menu.edit`;

/**
 * The rows of the menu the state of the window greys out: Undo and Redo with
 * no step to go to; Cut, Copy and Delete with nothing selected (Delete also
 * works on a selected wire); Paste with an empty clipboard (unverified: the
 * captures were taken with something copied). On the diagram, the rows that act
 * "from Selection" say "Remove Broken Wires" and "Clean Up Diagram" with nothing
 * selected.
 *   canUndo, canRedo      the history has a step to go to
 *   canCopy               a node or a panel object is selected
 *   hasSelection          anything at all is selected
 *   clipboardFilled       something was copied
 */
export function editMenuVariants(windowName, { canUndo, canRedo, canCopy, hasSelection, clipboardFilled }) {
  const row = (name) => `${editMenuId(windowName)}.${name}`;
  const desactivados = new Set();
  if (!canUndo) desactivados.add(row("undo"));
  if (!canRedo) desactivados.add(row("redo"));
  if (!canCopy) {
    desactivados.add(row("cut"));
    desactivados.add(row("copy"));
  }
  if (!hasSelection) desactivados.add(row("delete"));
  if (!clipboardFilled) desactivados.add(row("paste"));
  const rotulos = new Map();
  if (windowName === "block-diagram" && !hasSelection) {
    rotulos.set(row("remove-broken-wires-from-selection"), "Remove Broken Wires");
    rotulos.set(row("clean-up-selection"), "Clean Up Diagram");
  }
  return { desactivados, rotulos };
}
