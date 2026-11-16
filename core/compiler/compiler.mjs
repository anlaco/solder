// Compiles an OVI's diagram into a WebAssembly module (DT-039).
//
// The diagram is split into clumps, as LabVIEW does (DT-040): each node that
// takes time (Wait (ms)…) gets its own, and the instant ones are grouped by the
// time-taking nodes they depend on. Each clump is a function (`c0`, `c1`…), and
// the module's own scheduler (pool-scheduler.mjs, DT-063 §9) runs them by
// dataflow: each one once the ones it receives data from have finished, and in
// parallel those that do not depend on each other. Values passed from one clump
// to another travel through cells of the data space, which every thread shares;
// inside a clump, through locals.
//
// The panel is in the shared memory too (panel-memory.mjs, DT-063 §10): the
// diagram reads each control from its record and writes each indicator into its
// own, and the host fills the first and walks the second. The module imports
// only the clocks, the dialogs, the debugger and the functions written in
// JavaScript: it touches nothing it is not given.
//
// Types are the ones resolved by core/model/graph.mjs, with their coercions:
// each value is converted from the wire's type to the type of the terminal it
// enters, like LabVIEW's coercion dot. Whatever the compiler cannot emit yet is
// returned as an error, with its node; nothing is emitted halfway.

import { orden, tipos } from "../model/graph.mjs";
import { HOST_IMPORTS } from "./host-imports.mjs";
import { CLUMP_TYPE, FIRST_COMPILED_FUNCTION, MAXIMUM_PAGES, pagesFor, PARK_PRIMITIVES, RUNTIME_FUNCTIONS, runtimeFunctionIndex, SHARED_MEMORY_IMPORT, THREAD_GLOBALS } from "./runtime-functions.mjs";
import { fullClusterLayout } from "./panel-data.mjs";
import { ERROR, VISA_RESOURCE_LAYOUT } from "../model/types.mjs";
import { codificar } from "./wasm-encoder.mjs";
import { ins } from "./instructions.mjs";
import { CELDAS, CIMA, EXPORTADAS, i32 } from "./linear-memory.mjs";
import { makeStackless } from "./stackless.mjs";
import { SCHEDULER_EXPORTS, schedulerData } from "./pool-scheduler.mjs";
import { compileOVI } from "./compile-ovi.mjs";

const TOP_LEVEL_CHAIN_INDEX = 0;

/**
 * Compila un OVI. Devuelve `{ bytes, modulo, controles, indicadores, clumps }`,
 * con los controles y los indicadores en el orden de sus índices y, por cada
 * clump (la función exportada `c<i>`), de cuáles depende y si tarda; o
 * `{ errores }`: los motivos por los que no se puede, cada uno con su nodo si lo
 * tiene. With a catalog from a hierarchy (`conSubOVIs`), its subOVIs are compiled
 * into the same module (DT-045).
 */
export function compilar(g, cat, { name } = {}) {
  const module = newModule();
  module.callChain.push({ name: name ?? null, callerCell: null });
  const vi = compileOVI(g, cat, module, null, "", TOP_LEVEL_CHAIN_INDEX);
  if (vi.errores) return { errores: vi.errores };
  return assemble(module, vi);
}

/**
 * What the OVIs of one module share: the data space and its static data, the
 * globals, the subplans run by the host, the nodes that may raise the automatic
 * error dialog and the functions of synchronous subOVIs, called directly.
 */
function newModule() {
  const module = {
    space: 0, // bytes of the data space already reserved
    globales: [],
    constantes: [], // { celda, bytes }
    datosFijos: [], // { desde, bytes }: escalares de las constantes de cluster
    planes: [], // los subplanes: por cada uno, sus clumps
    automaticos: [], // los nodos que pueden sacar el diálogo, por índice
    directFunctions: [], // the single clump of each synchronous subOVI instance
    debugNodes: [], // DT-047: the nodes that report to the debugger, by index: { vi, nodo, outputs }
    instances: new Map(), // instance key → compiled subOVI instance
    propertyNodes: [], // DT-072: what the host needs to run each Property Node, by index
    callLibraries: [], // DT-080: what the host needs to make each Call Library Function Node's call, by index
    controlReferences: [], // DT-072 §2: the panel control each control reference names; a refnum is its index + 1
    // The OVIs an error source names (spec/04 Rule 21k): by chain index, the OVI's name and the cell
    // where each call to it writes the chain index of its caller; the top-level OVI has no cell.
    callChain: [],
  };
  // El data space (DT-042): una celda por búfer; las constantes, aparte.
  module.bufer = (tam, al = 8) => {
    module.space = (module.space + al - 1) & ~(al - 1);
    const d = CELDAS + module.space;
    module.space += tam;
    return d;
  };
  // DT-047: the host writes 1 here while debugging; the hooks read it after each node.
  module.debugFlag = module.bufer(4, 4);
  return module;
}

/**
 * What a Run needs of a compiled OVI, to send it to a worker: everything but the module's tree.
 * Only the tree is left out, so a field the runtime reads is never lost on the way (the call
 * chain of an error source was, once; the parked frames must go too, DT-063 §8).
 */
export const runnableOVI = ({ modulo: _moduleTree, ...runnable }) => runnable;

/** The module with the top-level OVI `vi`, its subOVIs, the memory functions and the scheduler, ready to instantiate. */
function assemble(module, vi) {
  const { clumps, controles, indicadores } = vi;
  const { globales, constantes, datosFijos, planes, automaticos, directFunctions } = module;

  const tiposF = [];
  const tipo = (params, results) => {
    const clave = JSON.stringify([params, results]);
    let i = tiposF.findIndex((t) => JSON.stringify([t.params, t.results]) === clave);
    if (i < 0) i = tiposF.push({ params, results }) - 1;
    return i;
  };
  if (tipo([], []) !== CLUMP_TYPE) throw new Error("The type of a clump must be the module's first.");
  if (globales.length) throw new Error("The globals of a module are only its threads'.");
  globales.push(...Object.keys(THREAD_GLOBALS).map(() => "i32"));
  // Every clump that may park saves its state and returns instead (DT-063 §8): its frame is in the
  // data space, so it is reserved before the static zone is placed behind it.
  const bodies = [...directFunctions, ...clumps, ...planes.flat()].map((k) => ({ params: [], results: [], locales: k.locales, cuerpo: k.cuerpo }));
  const allFunctions = [...RUNTIME_FUNCTIONS, ...bodies];
  const { functions: stackless, frames } = makeStackless(allFunctions, {
    importCount: HOST_IMPORTS.length,
    parkPrimitives: PARK_PRIMITIVES,
    typeOfCall: (index) => (index < HOST_IMPORTS.length ? HOST_IMPORTS[index] : allFunctions[index - HOST_IMPORTS.length]),
    allocateFrame: (bytes) => module.bufer(bytes, 8),
    parkingGlobal: THREAD_GLOBALS.parking,
    resumeValueGlobal: THREAD_GLOBALS.resumeValue,
    debugFlagAddress: module.debugFlag,
  });
  // The scheduler's tables (DT-063 §9): every clump by id —the top-level OVI's, then each plan's— with
  // its group and the clumps it waits for; group 0 is the top-level OVI, group p + 1 is plan p.
  const groups = [clumps, ...planes];
  let firstOfGroup = 0;
  const schedulerGroups = groups.map((members) => {
    const group = { first: firstOfGroup, count: members.length };
    firstOfGroup += members.length;
    return group;
  });
  const schedulerClumps = groups.flatMap((members, group) => members.map((k) => ({ group, deps: [...k.deps].map((index) => schedulerGroups[group].first + index) })));
  const schedulerTables = schedulerData({ clumps: schedulerClumps, groups: schedulerGroups, reserve: (bytes) => module.bufer(bytes, 8) });
  // La zona estática, detrás del data space; el montón, detrás (alineado a 8).
  const datos = [];
  let libre = CELDAS + ((module.space + 7) & ~7);
  for (const { celda, bytes } of constantes) {
    datos.push({ desde: libre, bytes }, { desde: celda, bytes: i32(libre) });
    libre = (libre + bytes.length + 3) & ~3;
  }
  datos.push(...datosFijos, ...schedulerTables);
  const heapStart = (libre + 7) & ~7;
  datos.push({ desde: CIMA, bytes: i32(heapStart) });
  const firstClumpFunction = FIRST_COMPILED_FUNCTION + directFunctions.length;
  // The memory is the host's, shared by every thread of the Run, so the data is passive and this
  // function writes it, once per Run, before any clump (DT-063 §1).
  const initialize = {
    params: [],
    results: [],
    locales: [],
    cuerpo: datos.flatMap(({ desde, bytes }, segment) => [ins("i32.const", desde), ins("i32.const", 0), ins("i32.const", bytes.length), ins("memory.init", segment)]),
  };
  const modulo = {
    tipos: tiposF,
    importaciones: HOST_IMPORTS.map((im) => ({ modulo: im.modulo, nombre: im.nombre, tipo: tipo(im.params, im.results) })),
    funciones: [...stackless, initialize].map((f) => ({ tipo: tipo(f.params, f.results), locales: f.locales, cuerpo: f.cuerpo })),
    globales,
    globalesExportadas: [{ nombre: "parking", global: THREAD_GLOBALS.parking }, { nombre: "resumeValue", global: THREAD_GLOBALS.resumeValue }],
    // call_indirect reaches clump `id` at position `id`.
    tabla: schedulerClumps.map((_, id) => firstClumpFunction + id),
    memoria: { paginas: pagesFor(heapStart), maximo: MAXIMUM_PAGES, compartida: true, importada: SHARED_MEMORY_IMPORT },
    datos,
    datosPasivos: true,
    exportaciones: [
      { nombre: "initialize", funcion: HOST_IMPORTS.length + stackless.length },
      ...[...EXPORTADAS, ...SCHEDULER_EXPORTS].map((nombre) => ({ nombre, funcion: runtimeFunctionIndex(nombre) })),
      ...[...clumps.map((_, i) => `c${i}`), ...planes.flatMap((sub, p) => sub.map((_, i) => `p${p}c${i}`))].map((nombre, i) => ({ nombre, funcion: firstClumpFunction + i })),
    ],
  };
  const plan = (lista) => lista.map((k) => ({ deps: [...k.deps], largo: k.largo }));
  return { bytes: codificar(modulo), memoryPages: modulo.memoria.paginas, modulo, controles, indicadores, clumps: plan(clumps), planes: planes.map(plan), automaticos, disposicionError: fullClusterLayout(ERROR), disposicionVisa: fullClusterLayout(VISA_RESOURCE_LAYOUT), usesInstrumentIo: !!module.usesInstrumentIo, debugFlag: module.debugFlag, debugNodes: module.debugNodes, callChain: module.callChain, propertyNodes: module.propertyNodes, callLibraries: module.callLibraries, controlReferences: module.controlReferences, frames };
}
