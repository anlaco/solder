// What the editor remembers about debugging, and how it changes (pure functions: the
// window only translates events into these calls, so the rules are tested without a
// browser). Measurements: labview-captures/debugging/REPORT.md.
//
// The state is plain JSON, because the two windows of a VI keep a copy each and the
// diagram sends its copy to the panel over the BroadcastChannel (editor-window.mjs):
//   highlight  { on, speed }              Highlight Execution and its speed
//   retain     boolean                    Retain Wire Values
//   items      [{ number, kind, wire?, node?, enabled }]   probes and breakpoints, numbered together
//   nextNumber the number the next probe or breakpoint gets
//   debugWindow { open, selected, showValues, keepOnTop, wrap, hideProbeDisplay }
//   run        { values, lit, litWires, paused, startedAt }   what the Run in progress shows
// Probes and breakpoints belong to the open VI, not to the file: they are not saved.

import { DEFAULT_SPEED, SPEEDS, SPEED_LABELS } from "./debug-controller.mjs";

export { SPEEDS, SPEED_LABELS };

export const initialRun = () => ({ values: {}, lit: [], litWires: {}, paused: null, startedAt: null });

export const initial = () => ({
  highlight: { on: false, speed: DEFAULT_SPEED },
  retain: false,
  items: [],
  nextNumber: 1,
  debugWindow: { open: false, selected: [], showValues: true, keepOnTop: true, wrap: false, hideProbeDisplay: false },
  run: initialRun(),
});

// ——— The toolbar buttons ———

/** Press and hold on Highlight Execution for this long opens its speed menu (REPORT.md §1: about 1.5 s). */
export const SPEED_MENU_HOLD_MS = 1500;

export const toggleHighlight = (state) => ({ ...state, highlight: { ...state.highlight, on: !state.highlight.on } });
export const setHighlightSpeed = (state, speed) => (SPEEDS.includes(speed) ? { ...state, highlight: { on: true, speed } } : state);
export const toggleRetain = (state) => ({ ...state, retain: !state.retain });

/** The VI's phase as the toolbar sees it. */
export const phaseOf = ({ running, run }) => (!running ? "edit" : run.paused ? "paused" : "running");

const ALLOW_DEBUGGING_OFF = "Allow debugging is off (VI Properties ▸ Execution)";

/**
 * Each debugging button of the toolbar: whether it is enabled, its tooltip and the variant of its
 * glyph (REPORT.md §6, with the tooltips of 11-17 and 75). Unverified: the tooltips of the step
 * buttons while the VI runs, "Step out of <VI>" at the top level, and those of a subVI node.
 *
 * `info`: { phase, broken, allowDebugging, highlight, retain, viName, nodeName, nodeIsSubVI, container }
 * where `container` is "loop", "structure" or null for the node the VI is stopped at.
 */
export function toolbarState(info) {
  const { phase, broken, allowDebugging, highlight, retain, viName, nodeName, nodeIsSubVI, container } = info;
  const unavailable = (label) => ({ enabled: false, tooltip: `${label}: ${ALLOW_DEBUGGING_OFF}` });
  const paused = phase === "paused";
  const stepping = (label) => (allowDebugging ? { enabled: !broken && phase !== "running", tooltip: label } : unavailable(label));

  const highlightButton = allowDebugging
    ? { enabled: true, tooltip: `Highlight Execution: ${SPEED_LABELS[highlight.speed]}`, glyph: highlight.on ? "highlight-execution-on" : "highlight-execution" }
    : { ...unavailable("Highlight Execution"), glyph: "highlight-execution" };
  const retainButton = allowDebugging
    ? { enabled: true, tooltip: "Retain Wire Values", glyph: retain ? "retain-wire-values-on" : "retain-wire-values" }
    : { ...unavailable("Retain Wire Values"), glyph: "retain-wire-values" };
  const overLabel = paused ? `Step over ${nodeName}` : "Start Single Stepping";
  const stepOutLabel = container === "loop" ? "Finish Iteration" : container ? "Finish Structure" : `Step out of ${viName}`;

  return {
    run: { enabled: true, tooltip: phase === "running" || paused ? "Running" : broken ? "List Errors" : "Run", glyph: phase !== "edit" ? "run-en-marcha" : broken ? "run-roto" : "run" },
    "abort-execution": { enabled: phase !== "edit", tooltip: phase === "edit" ? "Abort Execution" : `Abort execution of "${viName}"` },
    pause: allowDebugging
      ? { enabled: true, tooltip: paused ? "Continue" : "Pause", glyph: paused ? "pause-continue" : "pause" }
      : { ...unavailable("Pause"), glyph: "pause" },
    "highlight-execution": highlightButton,
    "retain-wire-values": retainButton,
    "step-into": paused
      ? { enabled: allowDebugging && !nodeIsSubVI, tooltip: nodeIsSubVI ? `Step into ${nodeName}: the subVI is not stepped into yet` : overLabel, glyph: "step-into-enabled" }
      : stepping("Start Single Stepping"),
    "step-over": paused ? { enabled: allowDebugging, tooltip: overLabel, glyph: "step-over-enabled" } : stepping("Start Single Stepping"),
    "step-out": paused ? { enabled: allowDebugging, tooltip: stepOutLabel, glyph: "step-out-enabled" } : { enabled: false, tooltip: allowDebugging ? "Step Out" : `Step Out: ${ALLOW_DEBUGGING_OFF}` },
  };
}

// ——— Probes and breakpoints ———

const nextItem = (state, item) => ({ ...state, items: [...state.items, { number: state.nextNumber, enabled: true, ...item }], nextNumber: state.nextNumber + 1 });

export const probesOf = (state) => state.items.filter((item) => item.kind === "probe");
export const breakpointsOf = (state) => state.items.filter((item) => item.kind === "breakpoint");

/** A probe is added to a wire; it becomes the selected row of the Debug Window, which opens (REPORT.md §3). */
export function addProbe(state, wireId) {
  const added = nextItem(state, { kind: "probe", wire: wireId });
  const number = added.nextNumber - 1;
  return { ...added, debugWindow: { ...added.debugWindow, open: true, selected: [number] } };
}

/** The breakpoint of a node (`{ node }`) or a wire (`{ wire }`), if it has one. */
export const breakpointOn = (state, target) => breakpointsOf(state).find((item) => ("node" in target ? item.node === target.node : item.wire === target.wire));

export const addBreakpoint = (state, target) => (breakpointOn(state, target) ? state : nextItem(state, { kind: "breakpoint", ...target }));

export function removeBreakpoint(state, target) {
  const found = breakpointOn(state, target);
  return found ? removeItems(state, [found.number]) : state;
}

export function toggleBreakpointEnabled(state, target) {
  const found = breakpointOn(state, target);
  return found ? { ...state, items: state.items.map((item) => (item === found ? { ...item, enabled: !item.enabled } : item)) } : state;
}

/** Remove Selected Probes and Breakpoints of the Debug Window. */
export function removeItems(state, numbers) {
  const wanted = new Set(numbers);
  return { ...state, items: state.items.filter((item) => !wanted.has(item.number)), debugWindow: { ...state.debugWindow, selected: state.debugWindow.selected.filter((number) => !wanted.has(number)) } };
}

/** Enable / Disable of the Debug Window: every selected breakpoint toggles (probes have no such state). */
export function toggleSelectedEnabled(state) {
  const selected = new Set(state.debugWindow.selected);
  return { ...state, items: state.items.map((item) => (selected.has(item.number) && item.kind === "breakpoint" ? { ...item, enabled: !item.enabled } : item)) };
}

/** Closing the Debug Window removes the probes (REPORT.md §3, 63 and 64); breakpoints stay. */
export function closeDebugWindow(state) {
  const probes = probesOf(state).map((probe) => probe.number);
  const withoutProbes = removeItems(state, probes);
  return { ...withoutProbes, debugWindow: { ...withoutProbes.debugWindow, open: false, selected: [] } };
}

export const openDebugWindow = (state) => ({ ...state, debugWindow: { ...state.debugWindow, open: true } });

/** The row clicked in the Debug Window; Ctrl keeps the others selected. */
export function selectItem(state, number, additive = false) {
  const { selected } = state.debugWindow;
  const next = additive ? (selected.includes(number) ? selected.filter((other) => other !== number) : [...selected, number]) : [number];
  return { ...state, debugWindow: { ...state.debugWindow, selected: next } };
}

const OPTION_KEYS = { "show-values-on-wires": "showValues", "keep-window-on-top": "keepOnTop", "wrap-text": "wrap", "hide-probe-display": "hideProbeDisplay" };
/** One of the checked items of the Debug Options menu. */
export function toggleOption(state, optionId) {
  const key = OPTION_KEYS[optionId];
  return key ? { ...state, debugWindow: { ...state.debugWindow, [key]: !state.debugWindow[key] } } : state;
}

/** What the VI no longer has leaves with it: probes on a deleted wire, breakpoints on a deleted node or wire. */
export function pruneToGraph(state, graph) {
  const wires = new Set(graph.cables.map((wire) => wire.id));
  const nodes = new Set(graph.nodos.map((node) => node.id));
  const alive = (item) => (item.wire ? wires.has(item.wire) : nodes.has(item.node));
  if (state.items.every(alive)) return state;
  return removeItems(state, state.items.filter((item) => !alive(item)).map((item) => item.number));
}

// ——— What the controller of the worker is told ———

/** Whether the compiled VI has to report anything now: Highlight Execution, probes, breakpoints or Retain Wire Values. */
export const needsReports = (state) => state.highlight.on || state.retain || state.items.length > 0;

/** `configure` of debug-controller.mjs, from the state and the graph (a wire breakpoint needs the node the wire starts at). */
export function controllerConfig(state, graph) {
  const nodeBreakpoints = {};
  const wireBreakpoints = [];
  for (const item of breakpointsOf(state)) {
    if (item.node) nodeBreakpoints[item.node] = item.enabled;
    else {
      const wire = graph.cables.find((candidate) => candidate.id === item.wire);
      if (wire) wireBreakpoints.push({ wire: item.wire, from: wire.de.nodo, enabled: item.enabled });
    }
  }
  return { active: needsReports(state), highlight: state.highlight, retain: state.retain, nodeBreakpoints, wireBreakpoints };
}

// ——— A Run in progress ———

/** The values a probe shows outlive the Run in its window; the rest of the wire values only if Retain Wire Values is on. */
function keptValues(state, graph) {
  if (state.retain) return state.run.values;
  const kept = {};
  for (const probe of probesOf(state)) {
    const wire = graph.cables.find((candidate) => candidate.id === probe.wire);
    const key = wire && `${wire.de.nodo}.${wire.de.puerto}`;
    if (key && key in state.run.values) kept[key] = state.run.values[key];
  }
  return kept;
}

/** A Run starts: nothing is lit yet and only the retained values remain. */
export function startRun(state, graph, now) {
  return { ...state, run: { ...initialRun(), values: keptValues(state, graph), startedAt: now } };
}

/** A Run ends: everything returns to normal (REPORT.md §1, 35-after-abort.png). */
export function endRun(state, graph) {
  return { ...state, run: { ...initialRun(), values: keptValues(state, graph) } };
}

/** What the run worker said (`{ debug: ... }` of run-worker.mjs), applied to the state. `now` is the clock of the page. */
export function applyDebugEvent(state, event, graph, now) {
  const run = state.run;
  if (event.paused) return { ...state, run: { ...run, paused: event.paused } };
  if (event.resumed) return { ...state, run: { ...run, paused: null } };
  const values = { ...run.values };
  for (const { node, port, value, at } of event.values ?? []) values[`${node}.${port}`] = { value, at };
  // Values alone (a Run without Highlight Execution reports them in batches).
  if (!event.ran) return { ...state, run: { ...run, values } };
  // A node that runs again starts a new iteration: everything dims and its wires and tags go (REPORT.md §1).
  const newIteration = run.lit.includes(event.ran);
  const lit = newIteration ? [event.ran] : [...run.lit, event.ran];
  const litWires = newIteration ? {} : { ...run.litWires };
  for (const wire of graph.cables) if (wire.de.nodo === event.ran) litWires[wire.id] = { at: now, pace: event.pace };
  return { ...state, run: { ...run, values, lit, litWires } };
}

// ——— Showing values ———

/** The text of a value in a tag or in the Debug Window: Booleans as T and F (REPORT.md §1); aggregates are unverified. */
export function formatValue(value, separator = ".") {
  if (typeof value === "boolean") return value ? "T" : "F";
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : String(value).replace(".", separator);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item, separator)).join(", ")}]`;
  if (value && typeof value === "object") return `{${Object.values(value).map((item) => formatValue(item, separator)).join(", ")}}`;
  return String(value ?? "");
}

/**
 * The text of a value tag on a wire (Highlight Execution and the probe's label): an array shows its
 * element count as "#4", while the Debug Window lists its values
 * (labview-captures/reports/2026-10-16-border-probes.md §1, §2).
 */
export const formatTag = (value, separator = ".") => (Array.isArray(value) ? `#${value.length}` : formatValue(value, separator));

/** The "Last Update" column: local time as h:mm:ss,mmm with the decimal separator of the system (REPORT.md §3). */
export function formatClock(milliseconds, separator = ".") {
  const time = new Date(milliseconds);
  const two = (number) => String(number).padStart(2, "0");
  return `${time.getHours()}:${two(time.getMinutes())}:${two(time.getSeconds())}${separator}${String(time.getMilliseconds()).padStart(3, "0")}`;
}

/** The value last seen on a wire, from what its source node reported. */
export function wireValue(state, graph, wireId) {
  const wire = graph.cables.find((candidate) => candidate.id === wireId);
  return wire ? state.run.values[`${wire.de.nodo}.${wire.de.puerto}`] : undefined;
}
