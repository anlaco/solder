// OVIs made inside a project and not saved yet (My Computer ▸ New ▸ OVI, a virtual folder's New ▸ OVI and the Project
// Explorer's File ▸ New OVI). Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-19-project-new-vi.md): the
// new VI is an item at once, named "Untitled N" with no extension and sorted by name; saving it turns the item into the
// file ("third.vi"); closing it unsaved takes the item out; and Save Project first saves every new VI. Pure.
//
// Such an item is `{ name, kind: "ovi", unsavedOvi }`, `unsavedOvi` being the id of the editor's open entry; a new control's
// (DT-107) also has `unsavedControl: true`.

import { ITEM_KINDS, fileNameOf, inFileOrder } from "./project.mjs";

/** The item of a new OVI called `name` (the editor's "Untitled N"), open as the entry `entryId`. */
export const newOviItem = (name, entryId) => ({ name, kind: ITEM_KINDS.OVI, unsavedOvi: entryId });

/**
 * The item of a new control called `name` (the editor's "Control N", DT-107): the same as a new OVI's, marked so its row
 * shows the type definition's icon until it is saved as an `.octl`.
 */
export const newControlItem = (name, entryId) => ({ ...newOviItem(name, entryId), unsavedControl: true });

/** The ids of the open entries of every new OVI of the project, at any depth. */
export function unsavedOviIds(project) {
  const ids = [];
  const walk = (items) => {
    for (const item of items ?? []) {
      if (item.unsavedOvi !== undefined) ids.push(item.unsavedOvi);
      walk(item.items);
    }
  };
  walk(project.items);
  return ids;
}

/** The project with the item of the new OVI `entryId` replaced by `replacement(item)`, or taken out for null, each level kept in order. */
function withNewOviItem(project, entryId, replacement) {
  let found = false;
  const mapItems = (items) => {
    const mapped = items.flatMap((item) => {
      if (item.unsavedOvi === entryId) {
        found = true;
        const replaced = replacement(item);
        return replaced ? [replaced] : [];
      }
      return item.items ? [{ ...item, items: mapItems(item.items) }] : [item];
    });
    return found ? inFileOrder(mapped) : mapped;
  };
  const items = project.items.map((item) => (item.items ? { ...item, items: mapItems(item.items) } : item));
  return found ? { ...project, items } : project;
}

/** The new OVI `entryId` was saved at `storedPath`: its item is that file now, named by it, in its place in the order. */
export const withNewOviSaved = (project, entryId, storedPath) => withNewOviItem(project, entryId, ({ unsavedOvi: _entry, unsavedControl: _control, ...item }) => ({ ...item, name: fileNameOf(storedPath), path: storedPath }));

/** The new OVI `entryId` left memory unsaved: its item leaves the project. */
export const withoutNewOvi = (project, entryId) => withNewOviItem(project, entryId, () => null);
