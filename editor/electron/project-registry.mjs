// The projects that are open in the editor (DT-099 §6): each has its own Project Explorer window, its own file and its own
// unsaved changes. Pure, as ovi-registry.mjs is for OVIs: no windows and no disk, so the numbering and the asterisk are
// tested without Electron.
//
// What the window says about a project is text, as it would be saved (without the window's place, which is never a change,
// as for an OVI, DT-078). A project whose text differs from the text it was last saved with has unsaved changes; one that
// was never saved has them always, which is why a new project's title has the asterisk (measured: "Untitled Project 1 *").

import { basename } from "node:path";
import { readProject, withoutWindow, writeProject } from "../../core/model/project.mjs";
import { untitledProjectName } from "./project-window.mjs";

/** A project's text as the registry compares it: the file's text without the window's place. */
export const projectBody = (project) => writeProject(withoutWindow(project));

/** What a Save writes: the project's body with the window's `place` (x, y, width, height, and its comment if it had one) in it (DT-099 §4). */
export const projectFileText = (body, place) => writeProject({ ...readProject(body), window: place });

export function createProjectRegistry() {
  const entries = new Map();
  let lastId = 0;
  // LabVIEW's counter of untitled projects only goes up: a closed number is not used again (measured: with 3 closed the
  // next is 4, reports/2026-11-18-project-explorer-s3.md Q1).
  let lastUntitled = 0;
  let lastActivation = 0;

  return {
    /**
     * Opens a project. `path` is its file, none for a new one; `text` is the project's text as `projectBody` gives it and
     * `place` the window place the file kept, if any. A path that is already open gives that project back, so the caller
     * brings its window to the front instead of opening a second one (measured in LabVIEW: s3 Q3 left it unsaid; the
     * OVIs do the same).
     */
    open({ path = null, text, place = null }) {
      const existing = path && [...entries.values()].find((entry) => entry.path === path);
      if (existing) return { entry: existing, alreadyOpen: true };
      const entry = { id: String(++lastId), path, untitledNumber: path ? null : ++lastUntitled, saved: path ? text : null, current: text, place, activation: ++lastActivation };
      entries.set(entry.id, entry);
      return { entry, alreadyOpen: false };
    },
    get: (id) => entries.get(id),
    list: () => [...entries.values()],
    close: (id) => entries.delete(id),
    findByPath: (path) => [...entries.values()].find((entry) => entry.path === path),
    /** The window was brought to the front: it is now the most recently activated. */
    activate(id) {
      const entry = entries.get(id);
      if (entry) entry.activation = ++lastActivation;
    },
  };
}

/** The name the title and the dialogs give a project: its file name, or "Untitled Project N". */
export const projectName = (entry) => (entry.path ? basename(entry.path) : untitledProjectName(entry.untitledNumber));

/** A project that was never saved has changes by definition (`saved` is null, which no text equals); a saved one has them when its text is not the saved one. */
export const isModified = (entry) => entry.current !== entry.saved;

/** The window reports the project as it is now. */
export function recordChange(entry, text) {
  entry.current = text;
}

/** The project was written to `path` as `entry.current`: it is saved there, with no changes pending. */
export function recordSave(entry, path) {
  Object.assign(entry, { path, untitledNumber: null, saved: entry.current });
}
