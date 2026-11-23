// What the OVIs that follow a type definition see of its open control editor (DT-104 stage b), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-23-typedef-instances.md Q6): not every unsaved edit of the editor but its published
// text, the one at the last Apply Changes or Save (or the file's at open, or the Make Type Def. text of an untitled
// one). Save does not apply: the instances recheck, and the ones that differ break until Apply.
//
// Pure: it keeps the two texts on the registry's entry (ovi-registry.mjs); the main process announces the change.

import { ENTRY_KINDS } from "./ovi-registry.mjs";

const isControl = (entry) => entry.kind === ENTRY_KINDS.CONTROL;

/**
 * The text of an entry as its callers read it: an OVI's, with its unsaved edits (issue #20); a control's, as published,
 * since its edits are not seen by the instances until they are applied or saved.
 */
export const textSeenByCallers = (entry) => (isControl(entry) ? (entry.published ?? entry.saved ?? entry.current) : entry.current);

/** Whether a change of the entry's text changes what its callers see: an OVI's edit does, a control's never (it is published). */
export const editChangesCallers = (entry) => !isControl(entry);

/** File ▸ Apply Changes: the control's current text is published and is the one last applied. */
export function applyControl(entry, text) {
  entry.current = text;
  entry.published = text;
  entry.applied = text;
}

/** Save: the text written is published, but not applied (the instances that differ break until Apply, measured). */
export function publishSavedControl(entry, text) {
  entry.published = text;
}

/** The `.octl` text last applied, for the editor to know whether Apply Changes has anything to do: what was opened until the first Apply. */
export const appliedTextOf = (entry) => entry.applied ?? entry.saved ?? entry.initialText;
