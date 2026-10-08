// The VIs that are open in the editor (DT-045 consequence b): each has its own
// Front Panel and Block Diagram, its own file and its own unsaved changes.
//
// Pure: no windows and no disk, so the rules are tested without Electron. The
// main process (main.mjs) keeps one entry per open VI and the windows that
// belong to it.
//
// What the windows say about a VI is text, as it would be saved. A VI whose
// text differs from the text it was last saved with has unsaved changes: the
// title carries an asterisk and, before losing them, the editor asks (spec/05
// rule 41). The first text the windows report for a VI just opened or created
// is its saved version.

import { basename } from "node:path";

/** The two windows of a VI, in the order they are opened. */
export const WINDOW_KINDS = ["front-panel", "block-diagram"];
const WINDOW_TITLES = { "front-panel": "Front Panel", "block-diagram": "Block Diagram" };

export function createRegistry() {
  const entries = new Map();
  let lastId = 0;
  let lastUntitled = 0;

  return {
    /**
     * Opens a VI. With a path that is already open it gives that VI back, so
     * the caller brings its windows to the front instead of opening a second
     * copy. `initialText` is what the windows load; none for a new VI.
     */
    open({ path = null, initialText = null } = {}) {
      const existing = path && [...entries.values()].find((entry) => entry.path === path);
      if (existing) return { entry: existing, alreadyOpen: true };
      const entry = { id: String(++lastId), path, untitledNumber: path ? null : ++lastUntitled, initialText, saved: null, current: null };
      entries.set(entry.id, entry);
      return { entry, alreadyOpen: false };
    },
    get: (id) => entries.get(id),
    list: () => [...entries.values()],
    close: (id) => entries.delete(id),
    findByPath: (path) => [...entries.values()].find((entry) => entry.path === path),
  };
}

export const isDirty = (entry) => entry.saved !== null && entry.current !== entry.saved;

/** The name LabVIEW gives the VI in its titles and dialogs: its file name, or «Untitled N». */
export const viName = (entry) => (entry.path ? basename(entry.path) : `Untitled ${entry.untitledNumber}`);

/** The title of one of the windows of a VI, with the asterisk of unsaved changes. */
export const windowTitle = (entry, kind) => `${viName(entry)} ${WINDOW_TITLES[kind]}${isDirty(entry) ? " *" : ""}`;

/** The windows report the VI as it is now. The first report is its saved version. */
export function recordChange(entry, text) {
  entry.current = text;
  if (entry.saved === null) entry.saved = text;
}

/** The VI has been written to `path` with `text`: it is saved there, with no changes pending. */
export function recordSave(entry, path, text) {
  Object.assign(entry, { path, saved: text, current: text });
}
