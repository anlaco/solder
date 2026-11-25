// The control editors a user opens to make a new control (DT-107): an empty one from a project's New ▸ Type
// Definition or from File ▸ New... ▸ Other Files, and an unlinked copy of one panel object from Customize Control...
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-25-project-new-type-definition.md,
// -new-custom-control.md, -empty-and-multi-control.md, -placing-a-control.md). Pure: what such an entry holds and how its
// title and its asterisk behave; main.mjs opens its window.

import { kindOfText, typeDefinitionText } from "../../core/model/type-definition.mjs";

/**
 * The control editor's window, without its 33 px title bar as the other windows are given. Every editor is 1092 × 697
 * (a new one, a customized copy, an `.octl` opened from a file or the project, measured), except the one of a definition
 * made by Make Type Def., 616 × 413 (reports/2026-11-22-control-editor-window.md). Open Type Def. on a saved file was not
 * measured and opens it as a file.
 */
const TITLE_BAR_HEIGHT = 33;
export const CONTROL_EDITOR_WINDOW_SIZE = { width: 1092, height: 697 - TITLE_BAR_HEIGHT };
export const MADE_TYPE_DEFINITION_WINDOW_SIZE = { width: 616, height: 413 - TITLE_BAR_HEIGHT };

/**
 * Control editors cascade +49, +30 from one to the next (measured: reports/2026-11-17-typedef-editor-entry.md Q3 and
 * 2026-11-25-new-custom-control.md Q4); where the first one opens, `origin`, was not measured. After `CASCADE_LENGTH`
 * windows the cascade starts again, so that it stays on the screen (unmeasured).
 */
const CONTROL_EDITOR_CASCADE = { x: 49, y: 30 };
const CASCADE_LENGTH = 8;
export const controlEditorPosition = (origin, openEditors) => ({
  x: origin.x + CONTROL_EDITOR_CASCADE.x * (openEditors % CASCADE_LENGTH),
  y: origin.y + CONTROL_EDITOR_CASCADE.y * (openEditors % CASCADE_LENGTH),
});

/** What a new control editor is made from, by the way in. */
export const NEW_CONTROL_WAYS = Object.freeze({
  // My Computer's or a virtual folder's New ▸ Type Definition: ring Type Def., titled "Control N Control" until it holds an object (Q1, Q2).
  PROJECT_TYPE_DEFINITION: "project-type-definition",
  // File ▸ New... ▸ Other Files ▸ Custom Control: ring Control (new-custom-control.md Q1).
  CUSTOM_CONTROL: "custom-control",
  // File ▸ New... ▸ Other Files ▸ Type Definition: ring Type Def., titled so (empty-and-multi-control.md Q4).
  TYPE_DEFINITION: "type-definition",
});

const RING_OF_WAY = { [NEW_CONTROL_WAYS.PROJECT_TYPE_DEFINITION]: "type-def", [NEW_CONTROL_WAYS.CUSTOM_CONTROL]: "control", [NEW_CONTROL_WAYS.TYPE_DEFINITION]: "type-def" };

/**
 * What a new, empty control editor's entry starts with: its `.octl` text (no object, the ring's kind), the kind its title
 * says, and `cleanUntilEdited`, since an empty new one carries no asterisk and closes with no question (Q1, Q2 of
 * new-custom-control.md). The project's New ▸ Type Definition's title says "Control" until its first object
 * (`titleFollowsFirstObject`).
 */
export function newControlEntry(way) {
  const ring = RING_OF_WAY[way];
  if (!ring) throw new Error(`no new control is made by "${way}"`);
  const followsFirstObject = way === NEW_CONTROL_WAYS.PROJECT_TYPE_DEFINITION;
  return { text: typeDefinitionText(ring, []), controlKind: followsFirstObject ? "control" : ring, cleanUntilEdited: true, ...(followsFirstObject && { titleFollowsFirstObject: true }) };
}

/**
 * What Customize Control... opens: an unlinked copy of `object` (as the `.octl` holds one) with the ring at Control, its
 * title saying so, modified at once ("Control 5 Control *", Q3 of new-custom-control.md).
 */
export const customizedControlEntry = (object) => ({ text: typeDefinitionText("control", [object]), controlKind: "control" });

/** Whether an `.octl`'s text holds any object: what ends a project's new type definition's "Control" title. */
function holdsObjects(text) {
  try {
    return (JSON.parse(text)?.objects?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * The entry after its page reported `text`: a project's new type definition takes its ring's kind into its title once
 * it holds an object ("Control 1 Type Def … *", Q2), and from then on keeps the kind as any control editor does.
 * Returns whether the title changed.
 */
export function followFirstObject(entry, text) {
  if (!entry.titleFollowsFirstObject || !holdsObjects(text)) return false;
  delete entry.titleFollowsFirstObject;
  entry.controlKind = kindOfText(text) ?? entry.controlKind;
  return true;
}

/**
 * The file dialog of Controls palette ▸ Select a Control... (measured: reports/2026-11-25-placing-a-control.md Q1): LabVIEW's
 * title and filter, with this program's file for a control.
 */
export const SELECT_CONTROL_DIALOG = Object.freeze({ title: "Select the Control to Open", properties: ["openFile"], filters: [{ name: "Front Panel Controls", extensions: ["octl"] }] });
