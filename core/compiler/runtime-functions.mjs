// The functions every compiled module carries before its OVIs' (DT-042, DT-063): the linear memory's (linear-memory.mjs)
// and the scheduler's (pool-scheduler.mjs), after the host imports, and how the compiler names and calls them. The
// shared memory itself is imported from the host.

import { MEMORY_FUNCTION_NAMES, funcionesMemoria } from "./linear-memory.mjs";
import { NUMERIC_FUNCTIONS, NUMERIC_FUNCTION_NAMES } from "./numeric-functions.mjs";
import { SCHEDULER_FUNCTION_NAMES, SCHEDULER_PARK_PRIMITIVES, schedulerFunctions } from "./pool-scheduler.mjs";
import { HOST_IMPORTS, PARKING_IMPORT_INDICES, importIndex } from "./host-imports.mjs";
import { ins } from "./instructions.mjs";

// The memory of a Run, created by the host and shared by its threads (DT-063 §1). A shared memory
// must declare a maximum; this is wasm32's whole address space, the limit an OVI already had, and it
// costs only address space until the OVI grows into it.
export const SHARED_MEMORY_IMPORT = { modulo: "env", nombre: "memory" };
export const MAXIMUM_PAGES = 65536;
export const PAGE_BYTES = 65536;
export const pagesFor = (bytes) => Math.max(1, Math.ceil(bytes / PAGE_BYTES));
export const MEMORY_FUNCTIONS = funcionesMemoria((n) => HOST_IMPORTS.length + MEMORY_FUNCTION_NAMES.indexOf(n));

// The globals of each thread (each instance of the module has its own): whether its clump is
// parking, the answer it resumes with (stackless.mjs), and the clump and thread it runs.
export const THREAD_GLOBALS = { parking: 0, resumeValue: 1, currentClump: 2, currentThread: 3 };
// A clump takes nothing and gives nothing: its type is the first of every module.
export const CLUMP_TYPE = 0;
export const FIRST_SCHEDULER_FUNCTION = HOST_IMPORTS.length + MEMORY_FUNCTIONS.length;
const FIRST_NUMERIC_FUNCTION = FIRST_SCHEDULER_FUNCTION + SCHEDULER_FUNCTION_NAMES.length;
/** The index of a function by name: an import, a memory function, one of the scheduler's or a numeric one. */
export const runtimeFunctionIndex = (name) => {
  if (MEMORY_FUNCTION_NAMES.includes(name)) return HOST_IMPORTS.length + MEMORY_FUNCTION_NAMES.indexOf(name);
  if (SCHEDULER_FUNCTION_NAMES.includes(name)) return FIRST_SCHEDULER_FUNCTION + SCHEDULER_FUNCTION_NAMES.indexOf(name);
  if (NUMERIC_FUNCTION_NAMES.includes(name)) return FIRST_NUMERIC_FUNCTION + NUMERIC_FUNCTION_NAMES.indexOf(name);
  const index = importIndex(name);
  if (index < 0) throw new Error(`No runtime function is called "${name}".`);
  return index;
};
export const SCHEDULER = schedulerFunctions({ functionIndex: runtimeFunctionIndex, globals: THREAD_GLOBALS, clumpType: CLUMP_TYPE });
/** The functions every module has before its OVIs': the memory's, the scheduler's and the numeric ones. */
export const RUNTIME_FUNCTIONS = [...MEMORY_FUNCTIONS, ...SCHEDULER, ...NUMERIC_FUNCTIONS];
/** The call that turns the NaN on the stack into +∞ (numeric-functions.mjs). */
export const NOT_A_NUMBER_TO_INFINITY = ins("call", FIRST_NUMERIC_FUNCTION + NUMERIC_FUNCTION_NAMES.indexOf("not_a_number_to_infinity"));
export const FIRST_COMPILED_FUNCTION = HOST_IMPORTS.length + RUNTIME_FUNCTIONS.length;
export const callScheduler = (name) => ins("call", runtimeFunctionIndex(name));
/** What may park a clump: the imports that wait for the outside and the scheduler's park primitives. */
export const PARK_PRIMITIVES = new Set([...PARKING_IMPORT_INDICES, ...SCHEDULER_PARK_PRIMITIVES.map(runtimeFunctionIndex)]);
export const callMemory = (n) => ({ op: "call", arg: HOST_IMPORTS.length + MEMORY_FUNCTION_NAMES.indexOf(n) });
