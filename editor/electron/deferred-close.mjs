// Closing an OVI that an open caller still calls (measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-19-subvi-checks-0.14-labview.md §3). With unsaved changes LabVIEW does not offer
// Don't Save while another VI references it: it offers Save, Defer Decision and Cancel, and Defer Decision closes the
// windows but keeps the changes in memory, where the callers go on using them. The question comes back, with Don't Save,
// when the last reference closes: "is about to leave memory".
//
// Pure: the main process gives the open OVIs (`{ entry, calls }`, `calls` being the keys an OVI's hierarchy calls, as its
// page reports them) and the deferred entries, so the rules are tested without Electron.

/** The answers of the Defer dialog. */
export const DEFER_ANSWERS = Object.freeze({ save: "save", defer: "defer", cancel: "cancel" });

/** Its buttons in LabVIEW's order, with the answer each gives; Save is the default. */
export const DEFER_BUTTONS = ["Save", "Defer Decision", "Cancel"];
export const DEFER_BUTTON_ANSWERS = [DEFER_ANSWERS.save, DEFER_ANSWERS.defer, DEFER_ANSWERS.cancel];

/** LabVIEW's texts for an OVI called `name` that stays in memory (measured). */
export const heldInMemoryText = (name) => ({
  title: "Save changes before closing?",
  message: `${name} has unsaved changes.`,
  detail: `${name} has unsaved changes that will remain in memory until all references to it are closed.`,
});

/** Is the OVI at `key` called by an open OVI other than the one with id `exceptId`? */
export const isCalledByAnother = (key, opens, exceptId) => opens.some((open) => open.entry.id !== exceptId && open.calls?.includes(key));

/**
 * May closing `open` defer its question? Only when another open OVI calls it by its key: a subOVI by its path, an untitled
 * type definition by its untitled key, which the objects made with Make Type Def. follow (measured: closing an unsaved
 * control editor offers Defer Decision, reports/2026-11-22-control-editor-window.md). An untitled OVI is called by no one.
 */
export const canDefer = (open, opens, keyOf) => isCalledByAnother(keyOf(open.entry), opens, open.entry.id);

/**
 * The deferred entries that nothing would call once the OVI with id `closingId` closes (all of them for `null`, as Close
 * All and Exit close everything): each is about to leave memory, and is asked about with Don't Save.
 */
export const releasedBy = (deferred, opens, keyOf, closingId) =>
  closingId === null ? [...deferred] : deferred.filter((entry) => !isCalledByAnother(keyOf(entry), opens, closingId));
