// The OVIs that are open in the editor (DT-045 consequence b): each has its own
// Front Panel and Block Diagram, its own file and its own unsaved changes.
//
// Pure: no windows and no disk, so the rules are tested without Electron. The
// main process (main.mjs) keeps one entry per open OVI and the windows that
// belong to it.
//
// What the windows say about an OVI is text, as it would be saved. An OVI whose
// text differs from the text it was last saved with has unsaved changes: the
// title carries an asterisk and, before losing them, the editor asks (spec/05
// rule 41). The first text the windows report for an OVI just opened or created
// is its saved version.

import { basename } from "node:path";
import { withoutWindows } from "./saved-windows.mjs";

/** The two windows of an OVI, in the order they are opened. */
export const WINDOW_KINDS = ["front-panel", "block-diagram"];

/**
 * What an open entry is: an OVI with its two windows, or a polymorphic OVI (DT-074) with the one window that edits its
 * `.sdp`. Both are numbered "Untitled N" from the same count, as LabVIEW does (measured: a Polymorphic VI opened after
 * Untitled 1 is "Untitled 2 Polymorphic OVI").
 */
export const ENTRY_KINDS = Object.freeze({ OVI: "ovi", POLYMORPHIC: "polymorphic" });
export const POLYMORPHIC_WINDOW_KIND = "polymorphic";
const WINDOW_TITLES = { "front-panel": "Front Panel", "block-diagram": "Block Diagram", [POLYMORPHIC_WINDOW_KIND]: "Polymorphic OVI" };

/** The windows an entry has, in the order they are opened. */
export const windowKindsOf = (entry) => (entry.kind === ENTRY_KINDS.POLYMORPHIC ? [POLYMORPHIC_WINDOW_KIND] : WINDOW_KINDS);

/** The window that stands for the entry: closing it closes the entry, and dialogs about the entry open over it. */
export const primaryWindowKind = (entry) => windowKindsOf(entry)[0];

export function createRegistry() {
  const entries = new Map();
  let lastId = 0;
  let lastUntitled = 0;

  return {
    /**
     * Opens an OVI. With a path that is already open it gives that OVI back, so
     * the caller brings its windows to the front instead of opening a second
     * copy. `initialText` is what the windows load; none for a new OVI. `kind` is an `ENTRY_KINDS`.
     */
    open({ path = null, initialText = null, kind = ENTRY_KINDS.OVI } = {}) {
      const existing = path && [...entries.values()].find((entry) => entry.path === path);
      if (existing) return { entry: existing, alreadyOpen: true };
      const entry = { id: String(++lastId), kind, path, untitledNumber: path ? null : ++lastUntitled, initialText, saved: null, current: null };
      entries.set(entry.id, entry);
      return { entry, alreadyOpen: false };
    },
    get: (id) => entries.get(id),
    list: () => [...entries.values()],
    close: (id) => entries.delete(id),
    findByPath: (path) => [...entries.values()].find((entry) => entry.path === path),
  };
}

/** Where the windows are is saved with the OVI but is never an unsaved change (DT-078). */
export const isDirty = (entry) => entry.saved !== null && withoutWindows(entry.current) !== withoutWindows(entry.saved);

/** The name LabVIEW gives the VI in its titles and dialogs: its file name, or «Untitled N». */
export const oviName = (entry) => (entry.path ? basename(entry.path) : `Untitled ${entry.untitledNumber}`);

/** The title of one of the windows of an OVI, with the asterisk of unsaved changes. */
export const windowTitle = (entry, kind) => `${oviName(entry)} ${WINDOW_TITLES[kind]}${isDirty(entry) ? " *" : ""}`;

/** The windows report the OVI as it is now. The first report is its saved version. */
export function recordChange(entry, text) {
  entry.current = text;
  if (entry.saved === null) entry.saved = text;
}

/** The OVI has been written to `path` with `text`: it is saved there, with no changes pending. */
export function recordSave(entry, path, text) {
  Object.assign(entry, { path, saved: text, current: text });
}
