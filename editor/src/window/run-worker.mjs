// The worker where a VI runs (DT-039, decision 3; DT-040): off the page's thread, so
// that the interface does not freeze while the VI works.
//
// It receives:
//   { orden: "run", clave, compilado, valores, separador, charts, poolPorts, depuracion? }
//        the key of the top-level VI (its path), the module, the value of the controls, the decimal
//        separator of the system, the ids of the Waveform Charts and one port to each thread of the
//        window's pool (DT-063 §11): this worker coordinates the Run and the pool runs its clumps. `compilado` carries `debugFlag`
//        and `debugNodes` (DT-047). `depuracion` is `{ plan, config, stepFirst }` when the page wants
//        the debugger of this Run: the plan of the diagram (debug-plan.mjs), what it wants now
//        (debug-controller.mjs `configure`) and whether to stop before the first node (Start Single Stepping).
//        `ioPort`, when the VI talks to instruments, is this Run's port to the editor's I/O process (DT-065 §3).
//   { orden: "control", nodo, valor }      a control changed while the VI runs
//   { orden: "abort" }                     Abort
//   { orden: "respuesta", id, valor }      what the user answered to a dialog: "continuar" or "parar" in the one of
//                                          automatic error handling, nothing in the one of Simple Error Handler
//   { orden: "debug-config", config }      Highlight Execution, Retain Wire Values, probes and breakpoints changed
//   { orden: "debug-pause" }               the Pause button of a VI that runs
//   { orden: "debug-resume", modo }        Continue ("continue"), Step Into ("into"), Step Over ("over") or Step Out ("out")
//   { orden: "io-exited" }                 the I/O process ended: what the Run waits for from an instrument fails
// It sends:
//   { escritos: { nodo: valor }, series: { nodo: [valor…] } }   what reaches the indicators, live; a Waveform Chart gets
//                                          every write, in order (`series`), not only the last one
//   { soltar: nodo }                       a Latch that was read, back to FALSE
//   { dialogo: { id, pregunta, status, code, source } }   an error dialog waiting for an answer (DT-043):
//                                          "error-automatico" (Continue or Stop) or "dialogo-error" (OK)
//   { debug: { ran: nodo, pace, values: [{ node, port, value, at }] } }   a node ran: the values of its outputs and,
//                                          with Highlight Execution, how long the worker holds the VI to show it (ms)
//   { debug: { paused: { node, kind, phase?, wire?, container, name } } }   the VI stopped (kind: "before", "at", "wire",
//                                          "frame" of a structure with its phase, or "diagram" at the end)
//   { debug: { resumed: true } }           the VI goes on
//   { fin: true, error?, abortado? }       the VI has finished
//
// The runtime passes over the panel's memory at the end of each turn of the scheduler, before a
// dialog and when the VI finishes (DT-063 §10), and what it reports is sent then: a loop that writes
// thousands of times a second does not flood the page, and the panel shows the last value, as
// LabVIEW does. A Waveform Chart is not like that: each write is a point of its history, so every one
// its history still holds is sent.

import { createDebugController } from "../debugging/debug-controller.mjs";
import { ejecutar } from "../../../core/runtime/runtime.mjs";
import { createIoClient } from "../../../core/runtime/io-protocol.mjs";

/**
 * What each top-level VI and its subVIs keep from one Run to the next, by the key of the VI
 * (DT-045): a functional global keeps counting while the hierarchy stays loaded. The core
 * discards it by itself when the compiled module changes.
 */
const statesByVI = new Map();

let valores = null;
let parar = null;
let pendientes = {};
/** What was written to each Waveform Chart since the last message, in order. */
let pendingChartWrites = {};
/** The ids of the Waveform Charts of the VI that runs. */
let chartNodeIds = new Set();
/** The most that is kept of a chart between two messages: its history (1024 points by default) cannot use more than the last ones. */
const MAX_BUFFERED_CHART_WRITES = 100000;
/** Solder's VISA for the Run in progress, through its port to the I/O process (io-protocol.mjs), or `null`. */
let instrumentIo = null;
/** The debugger of the Run in progress (debug-controller.mjs), or `null`. */
let debugController = null;
/** Los diálogos que esperan al usuario: su id y cómo seguir. */
const respuestas = new Map();
let siguiente = 0;

/** Saca un diálogo en la página y espera lo que conteste; antes, lo escrito hasta ahora, para que el panel lo enseñe. */
function preguntar(pregunta, error) {
  vaciar();
  return new Promise((ok) => {
    const id = ++siguiente;
    respuestas.set(id, ok);
    postMessage({ dialogo: { id, pregunta, status: error.status, code: error.code, source: error.source } });
  });
}

/** Notes a write to a chart, without keeping more than any history can hold. */
function noteChartWrite(nodo, valor) {
  const serie = (pendingChartWrites[nodo] ??= []);
  serie.push(valor);
  if (serie.length > MAX_BUFFERED_CHART_WRITES) serie.splice(0, serie.length - MAX_BUFFERED_CHART_WRITES);
}

/** The debugger of a Run: what the page sent, wired to the messages of this worker. */
function startDebugger({ compilado, depuracion }) {
  const controller = createDebugController({
    debugNodes: compilado.debugNodes ?? [],
    plan: depuracion.plan,
    send: (message) => {
      // What the VI wrote so far goes first, so that the panel and the diagram agree.
      vaciar();
      postMessage(message);
    },
  });
  controller.configure(depuracion.config);
  if (depuracion.stepFirst) controller.startStepping();
  return controller;
}

function vaciar() {
  const hayEscritos = Object.keys(pendientes).length > 0;
  const haySeries = Object.keys(pendingChartWrites).length > 0;
  if (!hayEscritos && !haySeries) return;
  postMessage({ ...(hayEscritos ? { escritos: pendientes } : {}), ...(haySeries ? { series: pendingChartWrites } : {}) });
  pendientes = {};
  pendingChartWrites = {};
}

onmessage = async ({ data }) => {
  if (data.orden === "control") {
    if (valores) valores[data.nodo] = data.valor;
    return;
  }
  if (data.orden === "respuesta") {
    respuestas.get(data.id)?.(data.valor);
    return respuestas.delete(data.id);
  }
  if (data.orden === "debug-config") return debugController?.configure(data.config);
  if (data.orden === "debug-pause") return debugController?.requestPause();
  if (data.orden === "debug-resume") return debugController?.resume(data.modo);
  if (data.orden === "abort") {
    parar?.abort();
    debugController?.release();
    // Un diálogo abierto no puede dejar el VI esperando: Abort lo contesta.
    for (const ok of respuestas.values()) ok("parar");
    return respuestas.clear();
  }
  if (data.orden === "io-exited") return instrumentIo?.fail("The instrument I/O process stopped.");
  if (data.orden !== "run") return;
  valores = { ...data.valores };
  chartNodeIds = new Set(data.charts);
  parar = new AbortController();
  if (!statesByVI.has(data.clave)) statesByVI.set(data.clave, {});
  const opciones = {
    estado: statesByVI.get(data.clave),
    senal: parar.signal,
    separador: data.separador,
    alErrorAutomatico: (e) => preguntar("error-automatico", e),
    alDialogoError: (e) => preguntar("dialogo-error", e),
    alEscribir: (nodo, v) => {
      if (chartNodeIds.has(nodo)) noteChartWrite(nodo, v);
      else pendientes[nodo] = v;
    },
    alAcabarTurno: vaciar,
    alSoltar: (nodo) => postMessage({ soltar: nodo }),
    poolPorts: data.poolPorts,
  };
  // Solder's VISA, through this Run's port to the editor's I/O process (DT-065 §3).
  instrumentIo = data.ioPort ? createIoClient(data.ioPort) : null;
  if (instrumentIo) opciones.io = instrumentIo;
  debugController = data.depuracion ? startDebugger(data) : null;
  if (debugController) opciones.depurador = debugController.hooks;
  try {
    await ejecutar(data.compilado, valores, opciones);
    debugController?.flush();
    vaciar();
    await debugController?.finishDiagram();
    postMessage({ fin: true });
  } catch (e) {
    vaciar();
    postMessage(e.abortado ? { fin: true, abortado: true } : { fin: true, error: e.message });
  } finally {
    debugController?.flush();
    debugController?.release();
    debugController = null;
    valores = null;
    parar = null;
    instrumentIo?.disconnect();
    instrumentIo = null;
  }
};
