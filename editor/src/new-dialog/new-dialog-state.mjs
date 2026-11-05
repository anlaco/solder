// The New dialog (File ▸ New...): the tree of what can be created, the description of the selected item, OK, Cancel and
// Help. LabVIEW's has a tree VI ▸ Blank VI, Malleable VI, Polymorphic VI, then From Template, Project ▸ Empty Project and
// Other Files (labview-captures/reports/2026-11-05-polymorphic-window.md; new2.png). Solder's names say OVI (DT-071).
// Pure: the page only turns clicks into these calls.

import { inicial as windowState } from "../window/window-state.mjs";

export const PREFIX = "dialog.new";

/** What OK creates, by the id of the item: the main process opens the matching window. */
export const CREATIONS = Object.freeze({ BLANK_OVI: "blank-ovi", POLYMORPHIC_OVI: "polymorphic-ovi" });

/** The tree, in LabVIEW's order. `description` is Solder's own text (rule 3: NI's help texts are not copied). */
export const TREE = Object.freeze([
  {
    id: "ovi",
    label: "OVI",
    children: [
      { id: CREATIONS.BLANK_OVI, label: "Blank OVI", description: "Creates a new, empty OVI." },
      { id: "malleable-ovi", label: "Malleable OVI", description: "" },
      { id: CREATIONS.POLYMORPHIC_OVI, label: "Polymorphic OVI", description: "Creates a new polymorphic OVI: a list of OVIs, its instances, from which a subOVI node picks one by the types wired to it or by hand." },
    ],
  },
  { id: "from-template", label: "From Template", children: [] },
  { id: "project", label: "Project", children: [{ id: "empty-project", label: "Empty Project", description: "" }] },
  { id: "other-files", label: "Other Files", children: [] },
]);

const leaves = () => TREE.flatMap((folder) => folder.children);
export const itemById = (id) => leaves().find((item) => item.id === id) ?? TREE.find((folder) => folder.id === id);

/** The id of the inventory entry of an item. */
export const entryId = (itemId) => `${PREFIX}.${itemId}`;

/** The dialog opens on Blank OVI (LabVIEW's first selection was not measured). */
export const initialState = () => ({ selected: CREATIONS.BLANK_OVI, ...windowState() });

/**
 * Selects an item of the tree. A folder is not an item to create, and an item that is not done does not take the
 * selection: the click explains why (rule 53).
 */
export function select(state, inventory, itemId, anchor) {
  const item = leaves().find((candidate) => candidate.id === itemId);
  if (!item) return state;
  const entry = inventory.resolver(entryId(itemId));
  if (entry?.estado !== "built") return { ...state, abierta: { id: entryId(itemId), x: anchor.x, y: anchor.y } };
  return { ...state, selected: itemId, abierta: null };
}

/** What OK creates, or null when nothing done is selected. */
export const acceptedCreation = (state) => (Object.values(CREATIONS).includes(state.selected) ? state.selected : null);

/** The description of the selected item. */
export const descriptionOf = (state) => itemById(state.selected)?.description ?? "";
