// The icons of the Project Explorer, drawn anew as 16 x 16 SVG (CLAUDE.md rule 3: no NI bitmap is copied). The colours
// are classes of project-explorer.css, which take them from the theme's tokens.

import { ROW_KINDS } from "./project-explorer-state.mjs";
import { ROW_ICONS } from "./disk-rows.mjs";

const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;

// Shapes shared by several icons.
const PAGE = `<path class="pe-paper pe-line" d="M3.5 1.5h6l3 3v10h-9z"/><path class="pe-line pe-fold" d="M9.5 1.5v3h3"/>`;
const FOLDER = `<path class="pe-folder pe-line" d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"/>`;
const DISK = `<path class="pe-blue pe-line" d="M2.5 2.5h9l2 2v9h-11z"/><rect class="pe-paper pe-line" x="4.5" y="2.5" width="6" height="4"/><rect class="pe-line pe-fold" x="5" y="9" width="6" height="4"/>`;
const SCISSORS = `<circle class="pe-line" cx="4.5" cy="12" r="2"/><circle class="pe-line" cx="11.5" cy="12" r="2"/><path class="pe-line" d="M5.5 10.3 11 2.5M10.5 10.3 5 2.5"/>`;
const PLUS = `<path class="pe-green-line" d="M12 1.5v5M9.5 4h5"/>`;

/** The toolbar's icons by the last segment of the button's inventory id. */
export const TOOLBAR_ICONS = Object.freeze({
  new: svg(`${PAGE}${PLUS}`),
  open: svg(FOLDER),
  "save-all": svg(`<path class="pe-blue pe-line" d="M5.5 1.5h8l1 1v8h-1"/>${DISK}`),
  cut: svg(SCISSORS),
  copy: svg(`<path class="pe-paper pe-line" d="M2.5 1.5h6v9h-6z"/><path class="pe-paper pe-line" d="M7.5 5.5h6v9h-6z"/>`),
  paste: svg(`<path class="pe-folder pe-line" d="M2.5 3.5h9v11h-9z"/><rect class="pe-paper pe-line" x="4.5" y="1.5" width="5" height="3"/><path class="pe-paper pe-line" d="M7 8h6.5v6.5H7z"/>`),
  "remove-from-project": svg(`${PAGE}<path class="pe-red-line" d="M9 9l5 5M14 9l-5 5"/>`),
  "open-project": svg(`${FOLDER}<circle class="pe-blue pe-line" cx="11.5" cy="4" r="2.5"/>`),
  "save-project": svg(DISK),
  "filter-project-view": svg(`<path class="pe-blue pe-line" d="M1.5 2.5h13L9.5 8.5v5l-3 1.5v-6.5z"/>`),
  "project-properties": svg(`${PAGE}<path class="pe-line" d="M5.5 8h5M5.5 10.5h5"/>`),
  "resolve-conflicts": svg(`<path class="pe-line" d="M2 5h9M8.5 2.5 11 5 8.5 7.5M14 11H5M7.5 8.5 5 11l2.5 2.5"/>`),
  "run-unit-tests": svg(`<path class="pe-green pe-line" d="M3.5 2.5l9 5.5-9 5.5z"/>`),
  results: svg(`${PAGE}<path class="pe-green-line" d="M5.5 10l2 2 3.5-4"/>`),
  "build-selected": svg(`<path class="pe-folder pe-line" d="M2.5 6.5l5.5-4 5.5 4v7h-11z"/><path class="pe-line" d="M6.5 13.5v-4h3v4"/>`),
});

const OVI_ICON = svg(`${PAGE}<path class="pe-blue pe-line" d="M5.5 8h5M5.5 11h3"/>`);
const TYPE_DEFINITION_ICON = svg(`${PAGE}<rect class="pe-folder pe-line" x="5.5" y="7.5" width="5" height="5"/>`);
// A folder inside an auto-populating one has the same icon (measured: s5 Q1).
const AUTO_POPULATING_ICON = svg(`<path class="pe-blue pe-line" d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"/><circle class="pe-folder pe-line" cx="12" cy="4" r="2.3"/>`);

/** The tree's icons by the kind of row. */
export const TREE_ICONS = Object.freeze({
  [ROW_KINDS.PROJECT]: svg(`<path class="pe-paper pe-line" d="M2.5 1.5h11v13h-11z"/><path class="pe-blue pe-line" d="M4.5 4.5h7M4.5 7.5h7M4.5 10.5h4"/>`),
  [ROW_KINDS.TARGET]: svg(`<rect class="pe-paper pe-line" x="1.5" y="2.5" width="13" height="8"/><path class="pe-line" d="M5.5 13.5h5M8 10.5v3"/>`),
  [ROW_KINDS.OVI]: OVI_ICON,
  [ROW_KINDS.DOCUMENT]: svg(`${PAGE}<path class="pe-line" d="M5.5 7.5h5M5.5 9.5h5M5.5 11.5h5"/>`),
  [ROW_KINDS.FOLDER]: svg(`<path class="pe-grey pe-line" d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"/>`),
  [ROW_KINDS.AUTO_POPULATING_FOLDER]: AUTO_POPULATING_ICON,
  [ROW_KINDS.DEPENDENCIES]: svg(`<path class="pe-paper pe-line" d="M1.5 2.5h5v4h-5zM9.5 9.5h5v4h-5z"/><path class="pe-line" d="M4 6.5v5h5.5"/>`),
  [ROW_KINDS.DEPENDENCY_LIBRARY]: svg(`<path class="pe-grey pe-line" d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z"/><path class="pe-line" d="M4.5 8.5v3M7 8.5v3M9.5 8.5v3"/>`),
  [ROW_KINDS.DEPENDENCY_OVI]: OVI_ICON,
  [ROW_KINDS.DEPENDENCY_TYPE_DEFINITION]: TYPE_DEFINITION_ICON,
  [ROW_KINDS.AUTO_POPULATING_SUBFOLDER]: AUTO_POPULATING_ICON,
  [ROW_ICONS.TYPE_DEFINITION]: TYPE_DEFINITION_ICON,
  [ROW_KINDS.BUILD]: svg(`<path class="pe-folder pe-line" d="M2 12.5l6-6 2 2-6 6z"/><path class="pe-grey pe-line" d="M9 2.5l4.5 4.5-2 2L7 4.5z"/>`),
});
