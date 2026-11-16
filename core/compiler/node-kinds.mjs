// What the compiler knows about kinds of node and type: which nodes take time and run alone in a clump, which panel
// objects are controls, which types it can carry on a wire, and the coercion between a DAQ task and a string.

import { DAQ_TASK_LAYOUT, isDaqTask } from "../model/daq-name.mjs";
import { dimensionsOf, esArray, esCluster, esNumerico } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { MAX_COMPILED_DIMENSIONS } from "./memory-ops.mjs";
import { clusterLayout } from "./wasm-types.mjs";

/** The VISA functions (DT-066): each waits for an instrument, and a Run that has one needs the I/O. */
export const VISA_FUNCTIONS = new Set(["visa-open", "visa-write", "visa-read", "visa-close"]);
/** The file functions (DT-067): each waits for the disk, served by the same I/O as VISA. */
export const FILE_FUNCTIONS = new Set(["open-create-replace-file", "close-file", "write-to-text-file", "read-from-text-file", "get-file-size", "delete", "write-delimited-spreadsheet-vi", "read-delimited-spreadsheet-vi", "file-dialog"]);
/** The nodes that take time: each runs in its own clump and yields while it waits. */
export const LARGOS = new Set(["wait-ms", "wait-until-next-ms-multiple", "time-delay", "simple-error-handler", "property-node", "call-library", ...VISA_FUNCTIONS, ...FILE_FUNCTIONS]);


export const PANEL_CONTROLS = ["control", "bool-control", "str-control", "cluster-control", "arr-control", "visa-control", "path-control", "refnum-control", "daq-name-control"];

/**
 * The panel objects whose value the editor holds as a VISA resource name's text alone (DT-066): the runtime
 * gives it a session of 0, which the first VISA function that uses it opens from the name.
 */
export const RESOURCE_NAME_PANEL_OBJECTS = new Set(["visa-control", "visa-indicator"]);

/**
 * Los tipos que el compilador sabe llevar hoy por un cable: numéricos,
 * booleanos, cadenas, clusters de ellos y arrays de una o dos dimensiones de ellos.
 */
export const escalar = (t) =>
  t === "boolean" || t === "string" || esNumerico(t) || (esCluster(t) && t.cluster.every((f) => escalar(f.type))) || (esArray(t) && dimensionsOf(t) <= MAX_COMPILED_DIMENSIONS && escalar(t.array));

/** Where a task's name lies in its memory (DT-087 §7). */
export const daqTaskNameOffset = () => clusterLayout(DAQ_TASK_LAYOUT).campos.find((field) => field.nombre === "name").off;

/**
 * The coercion dot between a DAQ task and a string (measured, reports/2026-11-06-daqmx-types.md), or null for any other
 * pair: a task gives its name, the string field of its cluster. A string into a task, which LabVIEW looks up among the
 * tasks saved in MAX, is not built: no terminal takes a task yet but the DAQ plugin's.
 */
export function daqTaskCoercion(from, to, read) {
  if (isDaqTask(from) && to === "string") return [...read, ins("i32.const", daqTaskNameOffset()), ins("i32.add")];
  if (from === "string" && isDaqTask(to)) throw new Error("A string wired to a DAQ task cannot run yet: Solder has no saved tasks to look it up in.");
  return null;
}
