// Where a project's items are, as paths (DT-099 §3): an item stores the path of its file or folder relative to the folder
// of the `.sdproj`, as LabVIEW's `.lvproj` does (measured: s1 report) and as a subOVI is stored relative to its caller
// (editor/src/common/ovi-paths.mjs, which does the work). A project that was never saved has no folder to be relative to,
// so it stores absolute paths and rebases them when it is first saved. Pure, on strings: the dialogs and the disk are the
// main process's.

import { readProject } from "../../core/model/project.mjs";
import { directoryOf, pathKey, rebaseStoredPath, relativeBetween } from "../src/common/ovi-paths.mjs";
import { projectBody } from "./project-registry.mjs";

/** The path to store for the file or folder the user chose at `absolutePath`, in a project saved at `projectPath` (or never saved: null). */
export const storedProjectPath = (projectPath, absolutePath) => (projectPath ? relativeBetween(directoryOf(pathKey(projectPath)), pathKey(absolutePath)) : pathKey(absolutePath));

/**
 * The text of a project (as `projectBody` writes it) with every stored path rebased from where the project was (`fromPath`,
 * null when it was never saved) to where it is now saved (`toPath`): the same files and folders, written relative to the
 * new folder.
 */
export function rebaseProjectBody(body, fromPath, toPath) {
  if (fromPath && pathKey(fromPath) === pathKey(toPath)) return body;
  const project = readProject(body);
  rebaseItems(project.items, fromPath && pathKey(fromPath), pathKey(toPath));
  return projectBody(project);
}

/** Every item with a path, a file or an auto-populating folder, at any depth. */
function rebaseItems(items, fromKey, toKey) {
  for (const item of items) {
    if (item.path !== undefined) item.path = rebaseStoredPath(item.path, fromKey, toKey);
    if (item.items) rebaseItems(item.items, fromKey, toKey);
  }
}

/**
 * What Add ▸ Folder (Snapshot)... adds: a virtual folder named after the folder, with the files `fileNames` of its top
 * level only. LabVIEW's snapshot of a folder with nested folders was not measured, so those are not taken.
 */
export function snapshotOfFolder(projectPath, folderPath, fileNames) {
  const folder = pathKey(folderPath).replace(/\/+$/, "");
  return { folderName: folder.split("/").pop(), storedPaths: fileNames.map((name) => storedProjectPath(projectPath, `${folder}/${name}`)) };
}
