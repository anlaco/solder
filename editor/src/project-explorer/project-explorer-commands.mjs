// What the Project Explorer's page does when a command edits the tree (DT-099 stage b): it asks the main process for the
// files and folders to add (native dialogs), applies the edit with project-explorer-edit.mjs, paints and tells the main
// process the project's new text, from which the title's asterisk and the close question follow. The edits themselves
// are pure and tested; this is the glue to the page, which `deps` lends: `getState()`, `show(state)` (set and paint),
// `update(state)` (set without painting, for the typing in a text box), `explainHole(id)` and `solder` (the preload's API).

import * as Edit from "./project-explorer-edit.mjs";
import * as State from "./project-explorer-state.mjs";

export function createTreeCommands({ getState, show, update, explainHole, solder }) {
  /** Paints the next state and, when the project changed, tells the main process its text. */
  function edited(next) {
    const projectChanged = next.project !== getState().project;
    show(next);
    if (projectChanged) solder?.project.changed(Edit.projectText(next.project));
  }

  /** Puts the result of an add into the window and says which files LabVIEW refuses ("Unable to Add Items"). */
  function added({ state, refused }) {
    edited(state);
    if (refused.length) solder?.project.unableToAdd(refused);
  }

  async function addFile() {
    const key = getState().selected;
    const storedPaths = await solder?.project.chooseFiles();
    if (storedPaths?.length) added(Edit.addFiles(getState(), key, storedPaths));
  }

  async function addSnapshotFolder() {
    const key = getState().selected;
    const snapshot = await solder?.project.chooseSnapshotFolder();
    if (snapshot) added(Edit.addSnapshotFolder(getState(), key, snapshot.folderName, snapshot.storedPaths));
  }

  async function addAutoPopulatingFolder() {
    const key = getState().selected;
    const storedPath = await solder?.project.chooseAutoPopulatingFolder();
    if (storedPath) edited(Edit.addAutoPopulatingFolder(getState(), key, storedPath));
  }

  const newVirtualFolder = () => edited(Edit.newVirtualFolder(getState(), getState().selected));

  /** F2 and Rename...: a virtual folder is edited in place, an OVI explains that it is not built, a document does nothing (measured: s4 "Rename"). */
  function rename() {
    const kind = State.selectedKind(getState());
    if (kind === State.ROW_KINDS.FOLDER) return show(Edit.startEdit(getState()));
    if (State.RENAME_HOLE_OF_KIND[kind]) explainHole(State.RENAME_HOLE_OF_KIND[kind]);
  }

  return {
    addFile,
    addSnapshotFolder,
    addAutoPopulatingFolder,
    newVirtualFolder,
    rename,
    removeFromProject: () => show(Edit.askRemove(getState())),
    confirmRemove: () => edited(Edit.confirmRemove(getState())),
    cancelDialog: () => show(Edit.cancelDialog(getState())),
    typeEdit: (text) => update(Edit.typeEdit(getState(), text)),
    commitEdit: () => edited(Edit.commitEdit(getState())),
    cancelEdit: () => show(Edit.cancelEdit(getState())),
    drop: (fromKey, targetKey) => edited(Edit.dropOnto(getState(), fromKey, targetKey)),
  };
}
