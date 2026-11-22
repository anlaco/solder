// The window list of the Window menu in the Project Explorer (DT-099 §6; measured in LabVIEW 2026 Q3, reports/2026-11-18-project-explorer-s3.md
// Q6), drawn as every Window menu draws it (common/window-list-menu.mjs).

import { listedIndexOf, listedRowPrefix, listedWindowsVariant } from "../common/window-list-menu.mjs";
import { PREFIX } from "./project-explorer-state.mjs";

export const WINDOW_MENU = `${PREFIX}.menu.window`;
export const LISTED_ROW_PREFIX = listedRowPrefix(WINDOW_MENU);
export { listedIndexOf };

/** What `menuContextual` needs to draw the explorer's Window menu with the listed windows. */
export const windowMenuVariant = (inventory, rows) => listedWindowsVariant(inventory, WINDOW_MENU, rows);
