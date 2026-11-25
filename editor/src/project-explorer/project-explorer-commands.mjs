// What the Project Explorer's page does when a command edits the tree (DT-099 stage b): it asks the main process for the
// files and folders to add (native dialogs), applies the edit with project-explorer-edit.mjs, paints and tells the main
// process the project's new text, from which the title's asterisk and the close question follow. The edits themselves
// are pure and tested; this is the glue to the page, which `deps` lends: `getState()`, `show(state)` (set and paint),
// `update(state)` (set without painting, for the typing in a text box), `explainHole(id)`, `solder` (the preload's API)
// and `readDisk()`, which reads again what the tree shows from the files.

import * as Edit from "./project-explorer-edit.mjs";
import * as State from "./project-explorer-state.mjs";

export function createTreeCommands({ getState, show, update, explainHole, solder, readDisk }) {
  /** Paints the next state and, when the project changed, tells the main process its text and reads its Dependencies again. */
  function edited(next) {
    const projectChanged = next.project !== getState().project;
    show(next);
    if (!projectChanged) return;
    solder?.project.changed(Edit.projectText(next.project));
    readDisk?.();
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

  /** Convert to Auto-populating Folder...: "Select Folder to Connect"; Cancel leaves the folder as it was (measured: s5 Q5). */
  async function convertToAutoPopulating() {
    const storedPath = await solder?.project.chooseFolderToConnect();
    if (storedPath) edited(Edit.convertToAutoPopulating(getState(), storedPath));
  }

  const stopAutoPopulating = () => edited(Edit.stopAutoPopulating(getState()));

  /**
   * What the main process read from the disk: the rows follow, and a folder gone from the disk turns its item into a
   * virtual folder, an edit of the project. A name being edited in place is not painted over: the rows follow at the next paint.
   */
  function diskRead(disk) {
    const next = Edit.withGoneFoldersVirtual(State.withDisk(getState(), disk));
    if (next.project !== getState().project) return edited(next);
    (getState().edit ? update : show)(next);
  }

  /** New ▸ OVI on the selected row (My Computer or a virtual folder), or File ▸ New OVI (`key` the project's row: My Computer). */
  async function newOviInto(key = getState().selected) {
    const created = await solder?.project.newOvi();
    if (created) edited(Edit.addNewOvi(getState(), key, created.name, created.entryId));
  }

  /** New ▸ Type Definition on the selected row (My Computer or a virtual folder): an empty control editor and its item (DT-107). */
  async function newTypeDefinitionInto(key = getState().selected) {
    const created = await solder?.project.newTypeDefinition();
    if (created) edited(Edit.addNewControl(getState(), key, created.name, created.entryId));
  }

  /** A double click on a row, or an OVI's Open: the main process opens the OVI in this project (project-explorer-edit.mjs `openRequestOf`). */
  function openItem(key = getState().selected) {
    const request = Edit.openRequestOf(getState(), key);
    if (request) solder?.project.openItem(request);
  }

  /**
   * F2 and Rename...: a virtual folder is edited in place, an OVI saved in a file is renamed on disk through "Save the OVI
   * (…) As", a document does nothing (measured: s4 "Rename"); the project's own Rename is not built and says why.
   */
  async function rename() {
    const kind = State.selectedKind(getState());
    if (kind === State.ROW_KINDS.FOLDER) return show(Edit.startEdit(getState()));
    if (kind === State.ROW_KINDS.OVI) return renameOvi(getState().selected);
    if (State.RENAME_HOLE_OF_KIND[kind]) explainHole(State.RENAME_HOLE_OF_KIND[kind]);
  }

  async function renameOvi(key) {
    const storedPath = Edit.renameRequestOf(getState(), key);
    const renamedTo = storedPath && (await solder?.project.renameOvi(storedPath));
    if (renamedTo) edited(Edit.oviItemRenamed(getState(), key, renamedTo));
  }

  return {
    addFile,
    addSnapshotFolder,
    addAutoPopulatingFolder,
    convertToAutoPopulating,
    stopAutoPopulating,
    diskRead,
    newVirtualFolder,
    newOviInto,
    newOvi: () => newOviInto(State.ROOT_KEY),
    newTypeDefinitionInto,
    // A new control made outside the explorer (File ▸ New... Add to project, Customize Control...) goes where File ▸ New OVI puts a new OVI.
    newControl: ({ entryId, name }) => edited(Edit.addNewControl(getState(), State.ROOT_KEY, name, entryId)),
    newOviSaved: ({ entryId, storedPath }) => edited(Edit.newOviSaved(getState(), entryId, storedPath)),
    newOviClosed: (entryId) => edited(Edit.newOviClosed(getState(), entryId)),
    openItem,
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
