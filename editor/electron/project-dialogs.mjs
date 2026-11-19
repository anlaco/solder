// What the main process asks about projects (DT-099 §6), as options for Electron's dialogs. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md Q3 and -s2.md Q6, 2026-11-18-project-explorer-s3.md Q1 and Q3).
// Pure: the dialogs and the disk are the main process's.

import path from "node:path";
import { ALREADY_IN_PROJECT, PROJECT_EXTENSION, isProjectPath } from "../../core/model/project.mjs";
import { closeDialogText } from "./close-flow.mjs";
import { untitledProjectName } from "./project-window.mjs";

/** The filter of both dialogs: LabVIEW's "Projects (*.lvproj)" with Solder's extension (measured: s1 Q3, s3 Q3). */
export const PROJECT_FILTERS = Object.freeze([{ name: `Projects (*${PROJECT_EXTENSION})`, extensions: [PROJECT_EXTENSION.slice(1)] }]);

/** File ▸ Open Project...: titled "Select the Project to Open", in the folder last used (measured). */
export const openProjectDialog = (folder) => ({ title: "Select the Project to Open", defaultPath: folder, properties: ["openFile"], filters: PROJECT_FILTERS });

/** The first Save of a project that has no file: "Name the Project (Untitled Project 2)", proposing "Untitled Project 2" in the last folder (measured). */
export const saveProjectDialog = ({ untitledNumber, folder }) => {
  const name = untitledProjectName(untitledNumber);
  return { title: `Name the Project (${name})`, defaultPath: path.join(folder, name), filters: PROJECT_FILTERS };
};

/** Where the project is written: the path chosen, with `.sdproj` added if it does not end so (as the OVI's Save As does). */
export const projectSavePathFor = (chosen) => (isProjectPath(chosen) ? chosen : `${chosen}${PROJECT_EXTENSION}`);

/**
 * The question when a project with unsaved changes is closed (measured, s2 Q6: "Save changes? (Close Project)", "P1.lvproj
 * has unsaved changes." and that it is about to leave memory). Its buttons are the Close dialog's: Save, Don't Save, Cancel.
 * The "List unsaved changes..." link of LabVIEW's is not built.
 */
export const closeProjectDialogText = (name) => ({ ...closeDialogText(name), title: "Save changes? (Close Project)" });

/**
 * Whether Create Project asks about the OVIs that are open (measured, s3 Q1: "when a VI is open outside any project";
 * not shown when only project VIs are open). `oviEntries` are the open OVIs, each with the project it belongs to if any.
 * An OVI cannot belong to a project yet (stage a3 brings that), so every open one counts.
 */
export const hasOVIsOutsideProjects = (oviEntries) => oviEntries.some((entry) => !entry.project);

/** Add ▸ File...: "Select a File to Insert", button "Add File", several files at once (measured: s4 Add ▸ File...). */
export const addFileDialog = (folder) => ({ title: "Select a File to Insert", buttonLabel: "Add File", defaultPath: folder, properties: ["openFile", "multiSelections"] });

/**
 * Add ▸ Folder (Snapshot)... and Add ▸ Folder (Auto-populating)...: the folder picker "Select a Folder to Insert", the
 * title of both (measured: 2026-11-17 s2 Q3).
 */
export const addFolderDialog = (folder) => ({ title: "Select a Folder to Insert", defaultPath: folder, properties: ["openDirectory"] });

/** The reason LabVIEW gives for a file that is already an item (measured: s2 Q3, "(Hex 0xDAC2) An item with this path already exists in the project."). */
export const UNABLE_TO_ADD_REASON = `(Hex 0xDAC2) ${ALREADY_IN_PROJECT}`;

/**
 * "Unable to Add Items": the items that were refused with their paths, and the reason (measured: s2 Q3 gives the list, the
 * path and the reason, with OK and Help; the wording around them and the Help button are not built). `items` are `{ name, path }`.
 */
export const unableToAddDialogText = (items) => ({
  title: "Unable to Add Items",
  message: "The following items could not be added to the project.",
  detail: `${items.map((item) => `${item.name}\n${item.path}`).join("\n\n")}\n\n${UNABLE_TO_ADD_REASON}`,
});

/**
 * Save Project while new OVIs of the project were never saved (measured: reports/2026-11-19-project-new-vi.md Q5): a box
 * with no title, Yes (the default) and Cancel; Yes saves each new OVI, asking where, and then the project.
 */
export const NEW_FILES_BUTTONS = ["Yes", "Cancel"];
export const newUnsavedFilesText = (projectName) => ({
  title: "",
  message: `"${projectName}" refers to new, unsaved files. You must save these files in order to save "${projectName}".`,
  detail: "Do you want to save the new, unsaved files?",
});
