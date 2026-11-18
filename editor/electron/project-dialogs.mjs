// What the main process asks about projects (DT-099 §6), as options for Electron's dialogs. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md Q3 and -s2.md Q6, 2026-11-18-project-explorer-s3.md Q1 and Q3).
// Pure: the dialogs and the disk are the main process's.

import path from "node:path";
import { PROJECT_EXTENSION, isProjectPath } from "../../core/model/project.mjs";
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
