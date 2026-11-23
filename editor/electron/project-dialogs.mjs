// What the main process asks about projects (DT-099 §6), as options for Electron's dialogs. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md Q3 and -s2.md Q6, 2026-11-18-project-explorer-s3.md Q1 and Q3).
// Pure: the dialogs and the disk are the main process's.

import path from "node:path";
import { ALREADY_IN_PROJECT, PROJECT_EXTENSION, isProjectPath } from "../../core/model/project.mjs";
import { OVI_EXTENSION, withoutDoubledExtension } from "../src/common/ovi-paths.mjs";
import { closeAllDialogText } from "./close-flow.mjs";
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

/** Where the project is written: the path chosen, with `.sdproj` added if it does not end so and a doubled one undone (as the OVI's Save As does). */
export function projectSavePathFor(chosen) {
  const path = withoutDoubledExtension(chosen, [PROJECT_EXTENSION]);
  return isProjectPath(path) ? path : `${path}${PROJECT_EXTENSION}`;
}

/**
 * The question for each item with unsaved changes when a project is closed: the project itself or one of its OVIs, which
 * leave memory with it (measured, s2 Q6: "Save changes? (Close Project)", "P1.lvproj has unsaved changes." and that it is
 * about to leave memory; s3 "Extras": with a project OVI, "Untitled 1 has unsaved changes." and the box "Apply same action
 * to the remaining 2 affected items", while checked Save - All, Don't Save - All, Cancel). Without others left there is no
 * box and the buttons are the Close dialog's. Not built: LabVIEW's "List unsaved changes..." link and "Affected items" list.
 */
export const closeProjectDialogText = (name, remaining = 0) => ({ ...closeAllDialogText(name, remaining), title: "Save changes? (Close Project)" });

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

/** Convert to Auto-populating Folder...: the folder picker "Select Folder to Connect", in the project's folder (measured: s5 Q5). */
export const connectFolderDialog = (folder) => ({ title: "Select Folder to Connect", defaultPath: folder, properties: ["openDirectory"] });

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
 * Rename... on an OVI item: the file dialog "Save the VI (main1.vi) As" in the OVI's folder, proposing its name without the
 * extension, with the filter "VIs (*.vi;*.vit;*.vim)" (measured: reports/2026-11-18-project-explorer-s4.md "Rename"),
 * here "Save the OVI (main1.ovi) As" and Solder's extension (DT-071, DT-094). Its New LLB... button is not built.
 */
export const renameOviDialog = (filePath) => {
  const name = path.basename(filePath);
  return { title: `Save the OVI (${name}) As`, defaultPath: path.join(path.dirname(filePath), path.parse(name).name), filters: [{ name: `OVIs (*${OVI_EXTENSION})`, extensions: [OVI_EXTENSION.slice(1)] }] };
};
