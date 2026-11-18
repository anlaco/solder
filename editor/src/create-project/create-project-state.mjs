// The Create Project dialog (File ▸ Create Project..., DT-099 §6): the tree of kinds on the left, the list of starting points
// on the right, Finish, Cancel and Help, and the Open Items question that Finish with a project asks. Measured in LabVIEW
// 2026 Q3 (labview-captures/reports/2026-11-18-project-explorer-s3.md Q1 and Q2). Pure: the page only turns clicks into
// these calls, so the rows, the selection and the question are tested without a browser.

import { inicial as windowState } from "../window/window-state.mjs";

export const PREFIX = "dialog.create-project";
export const OPEN_ITEMS_PREFIX = "dialog.open-items";

/** What Finish creates, by the id of the row: the main process opens the matching window. */
export const CREATIONS = Object.freeze({ BLANK_PROJECT: "blank-project", BLANK_OVI: "blank-ovi" });

/** The words above the list (measured). */
export const BANNER = "Choose a starting point for the project:";

/**
 * The left tree, in LabVIEW's order: All is selected; Desktop and Real-Time are indented under Sample Projects; no
 * row has an expander (s3 Q2). Only All is built: what the others filter was not measured.
 */
export const TREE = Object.freeze([
  { id: "all", label: "All", depth: 0 },
  { id: "templates", label: "Templates", depth: 0 },
  { id: "sample-projects", label: "Sample Projects", depth: 0 },
  { id: "desktop", label: "Desktop", depth: 1 },
  { id: "real-time", label: "Real-Time", depth: 1 },
]);

/**
 * The 17 rows of the list, in LabVIEW's order, with their measured categories (s3 Q2's table). Solder's own descriptions
 * (rule 3).
 * Only the two with `creation` are built: there are no templates or sample projects yet, which the greyed rows say.
 */
export const LIST = Object.freeze([
  { id: "blank-project", name: "Blank Project", category: "Templates", description: "A project with nothing in it but its target, My Computer.", creation: CREATIONS.BLANK_PROJECT },
  { id: "blank-ovi", name: "Blank OVI", category: "Templates", description: "A new, empty OVI that belongs to no project.", creation: CREATIONS.BLANK_OVI },
  { id: "my-first-daq-measurement", name: "My First DAQ Measurement", category: "Sample Projects", description: "A first acquisition from a DAQ device, ready to run." },
  { id: "simple-state-machine", name: "Simple State Machine", category: "Templates", description: "An OVI that steps through named states in a loop." },
  { id: "simple-state-machine-utf-8", name: "Simple State Machine (UTF-8)", category: "Templates", description: "The same state machine, with its text kept in UTF-8." },
  { id: "channeled-message-handler", name: "Channeled Message Handler", category: "Templates", description: "Loops that talk to each other through channels." },
  { id: "queued-message-handler", name: "Queued Message Handler", category: "Templates", description: "An event loop that feeds a queue and a loop that reads it." },
  { id: "queued-message-handler-utf-8", name: "Queued Message Handler (UTF-8)", category: "Templates", description: "The same handler, with its text kept in UTF-8." },
  { id: "actor-framework", name: "Actor Framework", category: "Templates", description: "A set of classes for programs made of actors that send messages." },
  { id: "finite-measurement", name: "Finite Measurement", category: "Sample Projects", description: "Acquires a set number of samples and shows them." },
  { id: "continuous-measurement-and-logging", name: "Continuous Measurement and Logging", category: "Sample Projects", description: "Acquires without end and writes what it reads to a file." },
  { id: "feedback-evaporative-cooler", name: "Feedback Evaporative Cooler", category: "Sample Projects", description: "A control loop that keeps a temperature, simulated." },
  { id: "instrument-driver-project", name: "Instrument Driver Project", category: "Templates", description: "The files of a driver for an instrument, ready to fill in." },
  { id: "continuous-measurement-and-logging-ni-daqmx", name: "Continuous Measurement and Logging (NI-DAQmx)", category: "Sample Projects", description: "Continuous acquisition and logging with the DAQmx functions." },
  { id: "finite-measurement-ni-daqmx", name: "Finite Measurement (NI-DAQmx)", category: "Sample Projects", description: "A finite acquisition with the DAQmx functions." },
  { id: "real-time-control-ni-daqmx", name: "Solder Real-Time Control (NI-DAQmx)", category: "Sample Projects", description: "A control loop for a real-time target, with the DAQmx functions." },
  { id: "real-time-waveform-acquisition-ni-daqmx", name: "Solder Real-Time Waveform Acquisition and Logging (NI-DAQmx)", category: "Sample Projects", description: "Waveform acquisition and logging on a real-time target." },
]);

/** The inventory id of a tree row, of a list row and of one of the dialog's own parts. */
export const treeEntryId = (id) => `${PREFIX}.tree.${id}`;
export const listEntryId = (id) => `${PREFIX}.list.${id}`;
export const partId = (name) => `${PREFIX}.${name}`;

/** The dialog opens on Blank Project, every time (measured: s3 Q2). */
export const initialState = () => ({ selected: CREATIONS.BLANK_PROJECT, treeSelected: "all", openItems: false, ...windowState() });

const listRow = (id) => LIST.find((row) => row.id === id);

/**
 * Selects a row of the list. A row that is not built does not take the selection: the click says why (rule 53), and Finish
 * still creates what was selected.
 */
export function select(state, id, anchor) {
  const row = listRow(id);
  if (!row) return state;
  if (!row.creation) return { ...state, abierta: { id: listEntryId(id), x: anchor.x, y: anchor.y } };
  return { ...state, selected: id, abierta: null };
}

/** A click on a row of the left tree: All is the selection already; the others explain why they are not built. */
export function selectTree(state, id, anchor) {
  if (!TREE.some((row) => row.id === id) || id === state.treeSelected) return state;
  return { ...state, abierta: { id: treeEntryId(id), x: anchor.x, y: anchor.y } };
}

/** What Finish creates: the creation of the selected row. */
export const selectedCreation = (state) => listRow(state.selected)?.creation ?? null;

/**
 * Finish. A blank OVI is created at once. A project asks the Open Items question first when OVIs are open outside any
 * project (measured: s3 Q1); the page learns that from the main process. Returns `{ state }` to go on in the dialog or
 * `{ create }` for what the main process must open.
 */
export function finish(state, { oviOpen }) {
  const creation = selectedCreation(state);
  if (!creation) return { state };
  if (creation === CREATIONS.BLANK_PROJECT && oviOpen) return { state: { ...state, openItems: true, abierta: null } };
  return { state, create: creation };
}

/** The Open Items dialog's own text (measured: s3 Q1; the VIs of LabVIEW's text are OVIs here). */
export const OPEN_ITEMS = Object.freeze({
  title: "Open Items",
  message: "You have one or more OVIs open in the main application instance. Do you want to add the open OVI(s) to the new project?",
  checkbox: "Do not show this dialog again.",
  buttons: Object.freeze([{ id: "add", label: "Add" }, { id: "dont-add", label: "Don't Add" }, { id: "cancel", label: "Cancel" }]),
});

/**
 * A button of the Open Items dialog. Don't Add creates the project; Cancel gives the creation up and closes everything (what
 * the Create Project dialog does then was not measured). Add is a hole: what it does in LabVIEW was not measured, so it
 * explains itself instead of acting.
 */
export function pressOpenItemsButton(state, id, anchor) {
  if (id === "dont-add") return { state, create: selectedCreation(state) };
  if (id === "cancel") return { state, cancelled: true };
  return { state: { ...state, abierta: { id: `${OPEN_ITEMS_PREFIX}.${id}`, x: anchor.x, y: anchor.y } } };
}
