// What the Getting Started window shows and how it changes. Pure: the page only turns DOM events into these calls,
// so the carousel, the collapse button and the filter are tested without a browser.

import { CAROUSEL_PAGE_COUNT, RECENT_FILTERS, filterRecentFiles } from "./start-state.mjs";

/** The state of the page; `saved` is what the main process remembers (`{ recentFiles, carouselPage, version }`). */
export const pageState = (saved) => ({
  recentFiles: saved.recentFiles ?? [],
  carouselPage: (saved.carouselPage ?? 0) % CAROUSEL_PAGE_COUNT,
  version: saved.version ?? "",
  collapsed: false,
  filter: RECENT_FILTERS[0],
  filterOpen: false,
  // What window-state.mjs keeps for every window: the open menu of the bar and the open explanation of a greyed item.
  abierta: null,
  paleta: null,
  menuBarra: null,
});

/** The pager's ‹ and ›: `step` is -1 or +1, and both wrap, so › on 8 / 8 goes to 1 / 8. */
export const stepCarousel = (state, step) => ({
  ...state,
  carouselPage: (state.carouselPage + step + CAROUSEL_PAGE_COUNT) % CAROUSEL_PAGE_COUNT,
});

/** The ">>" button hides the carousel and turns into "<<"; the window keeps its size. */
export const toggleCollapsed = (state) => ({ ...state, collapsed: !state.collapsed });

export const toggleFilterList = (state) => ({ ...state, filterOpen: !state.filterOpen });

export const chooseFilter = (state, filter) =>
  RECENT_FILTERS.includes(filter) ? { ...state, filter, filterOpen: false } : state;

/** The files the list shows under the current filter. */
export const visibleFiles = (state) => filterRecentFiles(state.recentFiles, state.filter);

/** The list shows only the name of a file; the whole path is its tooltip. */
export const fileName = (filePath) => filePath.split(/[\\/]/).pop();

/** "0.3.0-alpha" is an Alpha, "1.2.0-beta.2" a Beta, and a version without suffix a Release. */
export function releaseChannel(version) {
  const suffix = /-([A-Za-z]+)/.exec(version)?.[1];
  return suffix ? suffix[0].toUpperCase() + suffix.slice(1).toLowerCase() : "Release";
}

/** The version without its channel suffix: "0.3.0-alpha" is shown as "0.3.0", followed by "Alpha". */
export const releaseNumber = (version) => version.replace(/-.*$/, "");

/** The page the pager shows, counted from 1 as in "7 / 8". */
export const pagerText = (state) => `${state.carouselPage + 1} / ${CAROUSEL_PAGE_COUNT}`;

/** The rows of File ▸ Recent Files, named like the list: the file name, with the path as its tooltip. */
export const recentFileRows = (recentFiles) =>
  recentFiles.map((filePath, index) => ({ id: `window.getting-started.menu.file.recent-files.file-${index}`, etiqueta: fileName(filePath), estado: "built", filePath }));

/** What each built row of the menu bar does, by the last segment of its id; the page runs it through window.solder. */
export const MENU_COMMANDS = { "new-vi": "newVI", open: "open", exit: "exit" };
