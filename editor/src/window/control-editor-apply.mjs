// File ▸ Apply Changes of the control editor (DT-104 stage b), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-23-typedef-instances.md Q6): greyed at open, right after Apply, after a change of
// default values only and after Save; enabled once the ring or the object changes in anything else, before and after a
// Save, which does not apply. The row's state is a function of the edited object and the one last applied.

import { hasChangesToApply } from "../../../core/model/type-definition-follow.mjs";

/** The id of the control editor's File menu and of its Apply Changes row. */
export const CONTROL_FILE_MENU = "window.control-editor.menu.file";
export const APPLY_ROW = `${CONTROL_FILE_MENU}.apply-changes`;

/**
 * What the editor remembers to answer: the `.octl` text last applied (the file's at open), and whether the text it holds
 * now has something to apply over it. `hasChanges` is asked at every paint, so its answer is kept for the same graph and kind.
 */
export function createApplyTracker(appliedText) {
  let applied = appliedText;
  let cached = null;
  return {
    /** The text `.octl` now applied: Apply Changes was chosen with it. */
    applied(text) {
      applied = text;
      cached = null;
    },
    /** Whether the editor's object (the graph `g` of ring `kind`, as `currentText()` writes it) has anything to apply. */
    hasChanges(catalog, g, kind, currentText) {
      if (applied === null || applied === undefined) return false;
      if (cached?.g !== g || cached.kind !== kind) cached = { g, kind, answer: hasChangesToApply(catalog, applied, currentText()) };
      return cached.answer;
    },
  };
}

/** The variant of the control editor's File menu: Apply Changes greyed while there is nothing to apply. */
export const applyMenuVariant = (menuId, hasChanges) => (menuId === CONTROL_FILE_MENU && !hasChanges ? { desactivados: new Set([APPLY_ROW]) } : {});
