// The New dialog (File ▸ New...): the tree of what can be created, the description of the selected item, OK, Cancel and
// Help. LabVIEW's has a tree VI ▸ Blank VI, Malleable VI, Polymorphic VI, then From Template, Project ▸ Empty Project and
// Other Files (labview-captures/reports/2026-11-05-polymorphic-window.md; new2.png). Solder's names say OVI (DT-071).
// Pure: the page only turns clicks into these calls.

import { inicial as windowState } from "../window/window-state.mjs";

export const PREFIX = "dialog.new";

/** What OK creates, by the id of the item: the main process opens the matching window. */
export const CREATIONS = Object.freeze({
  BLANK_OVI: "blank-ovi",
  POLYMORPHIC_OVI: "polymorphic-ovi",
  CUSTOM_CONTROL: "custom-control",
  TYPE_DEFINITION: "type-definition",
});

// Other Files, in LabVIEW's order (DT-107, measured in LabVIEW 2026 Q3). Only Custom Control and Type Definition are done.
const OTHER_FILES = [
  { id: "class", label: "Class", description: "" },
  { id: CREATIONS.CUSTOM_CONTROL, label: "Custom Control", description: "Creates a new custom control: a control of your own look, saved as an .octl file; set its ring to Type Def. to make a type definition." },
  { id: "global-variable", label: "Global Variable", description: "" },
  { id: "interface", label: "Interface", description: "" },
  { id: "library", label: "Library", description: "" },
  { id: "run-time-menu", label: "Run-Time Menu", description: "" },
  { id: CREATIONS.TYPE_DEFINITION, label: "Type Definition", description: "Creates a new type definition: a control saved as an .octl file that every copy of it follows." },
  { id: "xcontrol", label: "XControl", description: "" },
];

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
  { id: "other-files", label: "Other Files", children: OTHER_FILES },
]);

/** Shared Variable is the first row of Other Files only when the dialog was opened from a project (DT-107). */
const SHARED_VARIABLE = { id: "shared-variable", label: "Shared Variable", description: "" };

/** The tree as a state shows it: with a project, Other Files starts with Shared Variable. */
export const treeOf = (state) =>
  TREE.map((folder) => (folder.id === "other-files" && state.projectName != null ? { ...folder, children: [SHARED_VARIABLE, ...folder.children] } : folder));

const leaves = () => [SHARED_VARIABLE, ...TREE.flatMap((folder) => folder.children)];
export const itemById = (id) => leaves().find((item) => item.id === id) ?? TREE.find((folder) => folder.id === id);

/** The id of the inventory entry of an item. */
export const entryId = (itemId) => `${PREFIX}.${itemId}`;

/**
 * The dialog opens on Blank OVI (LabVIEW's first selection was not measured). `projectName` is the Project Explorer it was
 * opened from, or null; Add to project is ticked then and greyed and unticked otherwise (DT-107).
 */
export const initialState = (projectName = null) => ({ selected: CREATIONS.BLANK_OVI, projectName, addToProject: projectName !== null, ...windowState() });

/** Clicking Add to project ticks or unticks it; with no project it is greyed and does nothing. */
export const toggleAddToProject = (state) => (state.projectName === null ? state : { ...state, addToProject: !state.addToProject });

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
