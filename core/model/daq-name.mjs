// DAQ's names (DT-076 §5): one type with a kind, as LabVIEW's single DAQmxName class, `{ "daq-name": "task" }`. The
// kinds are LabVIEW's and do not connect to each other (measured on 2026-11-06,
// labview-captures/reports/2026-11-06-daqmx-types.md). A pure module, shared by the model, the compiler and the editor.

/** The kinds, in the order of LabVIEW's DAQmx Name Controls palette (measured). */
export const DAQ_NAME_KINDS = Object.freeze(["task", "global-channel", "physical-channel", "terminal", "scale", "device", "switch"]);

/** The type of a DAQ name of `kind`. */
export const daqName = (kind) => ({ "daq-name": kind });

/** A DAQ task: the kind every DAQ function takes as `task in`. */
export const DAQ_TASK = Object.freeze(daqName("task"));

export const isDaqName = (type) => !!type && typeof type === "object" && typeof type["daq-name"] === "string";

export const isDaqTask = (type) => isDaqName(type) && type["daq-name"] === "task";

/**
 * How a task lives in Solder's memory (DT-087, amendment of 2026-11-13 §7): a copy of its name and of the number LabVIEW
 * shows beside it, and the address of its record in the I/O process, 0 for an empty task. LabVIEW keeps only the
 * record's address, but WebAssembly cannot read the I/O process's memory.
 */
export const DAQ_TASK_LAYOUT = Object.freeze({
  cluster: [
    { name: "name", type: "string" },
    { name: "number", type: "u32" },
    { name: "record", type: "u64" },
  ],
});

/** A task in memory, or a string for the other kinds, which are only their text (measured: they read as strings). */
export const daqNameInMemory = (type) => (isDaqTask(type) ? DAQ_TASK_LAYOUT : "string");

/**
 * The name of each kind when a broken wire is explained: LabVIEW's label of its constant ("DAQmx Task Name", measured),
 * with DAQ for DAQmx, as Solder names it (DT-076 §1). The texts of a broken wire's explanation are unverified.
 */
const KIND_NAMES = Object.freeze({
  task: "DAQ Task Name",
  "global-channel": "DAQ Global Channel",
  "physical-channel": "DAQ Physical Channel",
  terminal: "DAQ Terminal",
  scale: "DAQ Scale Name",
  device: "DAQ Device Name",
  switch: "DAQ Switch",
});

export const daqNameText = (type) => KIND_NAMES[type["daq-name"]] ?? `DAQ ${type["daq-name"]}`;

/**
 * Whether a value of `from` goes into a terminal of `to`, when one of them is a DAQ name: every kind coerces to a string
 * and a string to every kind, with a coercion dot; two different kinds break the wire (measured).
 */
export function daqNameConversion(from, to) {
  if (isDaqName(from) && to === "string") return "coercion";
  if (from === "string" && isDaqName(to)) return "coercion";
  return null;
}
