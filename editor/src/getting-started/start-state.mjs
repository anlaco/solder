// What the Getting Started window remembers between starts
// (labview-captures/reports/2026-10-15-getting-started.md): the files opened
// or saved last, newest first, and the carousel page, which moves on by one
// every time the window is shown.
//
// Pure, shared by the main process and the page: the main process reads and writes the state as JSON in the user's
// data folder, so the rules are tested without Electron or the disk.

import { OLD_VI_EXTENSION, VI_EXTENSION } from "../common/vi-paths.mjs";

/** How many files the list keeps; LabVIEW's limit was not measured. */
export const MAX_RECENT_FILES = 30;

/** The pages of the carousel; LabVIEW has eight, Solder writes its own (CLAUDE.md rule 3). */
export const CAROUSEL_PAGE_COUNT = 8;

/** The filter of the Open Existing list, in LabVIEW's order. */
export const RECENT_FILTERS = ["All Recent Files", "Recent Projects", "Recent VIs", "Other Recent Files"];

const VI_EXTENSIONS = [VI_EXTENSION, OLD_VI_EXTENSION];
const PROJECT_EXTENSIONS = [".sdproj"];

export const emptyStartState = () => ({ recentFiles: [], carouselPage: 0 });

/** Reads the saved JSON, or starts empty when there is none or it cannot be read. */
export function parseStartState(text) {
  try {
    const saved = JSON.parse(text);
    return {
      recentFiles: Array.isArray(saved.recentFiles) ? saved.recentFiles.filter((file) => typeof file === "string").slice(0, MAX_RECENT_FILES) : [],
      carouselPage: Number.isInteger(saved.carouselPage) ? saved.carouselPage % CAROUSEL_PAGE_COUNT : 0,
    };
  } catch {
    return emptyStartState();
  }
}

/** `filePath` was opened or saved: it goes to the top of the list, once. */
export const rememberFile = (state, filePath) => ({
  ...state,
  recentFiles: [filePath, ...state.recentFiles.filter((file) => file !== filePath)].slice(0, MAX_RECENT_FILES),
});

/** The window is being shown: the carousel moves on one page, wrapping from the last to the first. */
export const nextCarouselPage = (state) => ({ ...state, carouselPage: (state.carouselPage + 1) % CAROUSEL_PAGE_COUNT });

const hasExtension = (filePath, extensions) => extensions.some((extension) => filePath.toLowerCase().endsWith(extension));

/** The files the Open Existing list shows under `filter`, one of `RECENT_FILTERS`. */
export function filterRecentFiles(files, filter) {
  if (filter === "Recent VIs") return files.filter((file) => hasExtension(file, VI_EXTENSIONS));
  if (filter === "Recent Projects") return files.filter((file) => hasExtension(file, PROJECT_EXTENSIONS));
  if (filter === "Other Recent Files") return files.filter((file) => !hasExtension(file, [...VI_EXTENSIONS, ...PROJECT_EXTENSIONS]));
  return files;
}
