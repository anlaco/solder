// One thread of a Run's pool (DT-063 §1, §9, §11): it instantiates the Run's module over the Run's
// shared memory and runs `run_thread` blocking until the Run is over. It never receives a message in
// the middle of a Run: Abort and the panel are in the memory. What only the coordinator may do —show a
// dialog and wait for the user— it asks the coordinator for, after parking the clump that called.
//
// The same code serves a worker of the editor and one of Node: each gives `servePoolThread` a way
// to hear the ports the coordinator connects to it, once per Run.

import { NO_DEBUG_VALUE, createHostFunctions, debugValueReader, millisecondTimerOf, sharedClock } from "./runtime.mjs";
import { SHARED_MEMORY_IMPORT } from "../compiler/compiler.mjs";
import { VISA_FUNCTION_NAMES } from "./instrument-io.mjs";

const BLOCKING = 1;

/**
 * Serves the Runs whose ports arrive through `onPort(listener)`. A port gets one message,
 * `{ start: { module, memory, thread, compilado, separador } }`, and answers
 * `{ externalWait: { name, clump, args } }` for each external wait of a clump on this thread, then
 * `{ status }` when the Run is over for this thread, or `{ error }` if a clump failed here.
 */
export function servePoolThread(onPort) {
  onPort((port) => {
    port.onmessage = ({ data }) => {
      if (!data.start) return;
      port.onmessage = null;
      port.postMessage(runThread(data.start, port));
      port.close();
    };
  });
}

function runThread({ module, memory, thread, compilado, separador }, port) {
  let exports = null;
  const host = createHostFunctions({ compilado, separador, memory, exports: () => exports });
  const { cad, arr, math } = host;
  // An external wait (a dialog, the debugger, an instrument) parks the clump that asked for it; the
  // coordinator answers it and wakes the clump with the answer.
  const askCoordinator = (name) => (...args) => {
    const clump = exports.park_external();
    port.postMessage({ externalWait: { name, clump, args } });
    return 0;
  };
  const tiempo = {
    reloj: millisecondTimerOf(sharedClock),
    ahora: sharedClock,
    reloj_real: sharedClock,
    error_automatico: askCoordinator("error_automatico"),
    dialogo_error: askCoordinator("dialogo_error"),
  };
  // Debugging turned on in the middle of a Run (DT-047): each output's value is read here, before the
  // clump changes it, and sent; at each node the clump parks until the coordinator's debugger lets it go.
  const readDebugValue = debugValueReader(compilado, host);
  const sendDebugValue = (nodo, salida, valor) => {
    const value = readDebugValue(nodo, salida, valor);
    if (value !== NO_DEBUG_VALUE) port.postMessage({ debugValue: [nodo, salida, value] });
  };
  const dep = { valor_i32: sendDebugValue, valor_i64: sendDebugValue, valor_f32: sendDebugValue, valor_f64: sendDebugValue, nodo: askCoordinator("debugger_node") };
  const io = Object.fromEntries(VISA_FUNCTION_NAMES.map((name) => [name, askCoordinator(name)]));
  const sharedMemory = { [SHARED_MEMORY_IMPORT.modulo]: { [SHARED_MEMORY_IMPORT.nombre]: memory } };
  try {
    exports = new WebAssembly.Instance(module, { ...sharedMemory, tiempo, cad, arr, math, dep, io }).exports;
    return { status: exports.run_thread(thread, BLOCKING) };
  } catch (error) {
    return { error: { message: error.message, abortado: !!error.abortado } };
  }
}
