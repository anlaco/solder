// How one node is emitted into its clump: its emitting context, the cells that carry a value to another clump, and the error chain through a node.
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { importIndex } from "./host-imports.mjs";
import { FILE_FUNCTIONS, PANEL_CONTROLS, RESOURCE_NAME_PANEL_OBJECTS, VISA_FUNCTIONS, daqTaskCoercion, escalar } from "./node-kinds.mjs";
import { callMemory } from "./runtime-functions.mjs";
import { arrayElement, dimensionSize, elementCount, isByReference, reserveArray } from "./memory-ops.mjs";
import { panelDataOf, taskPanelData } from "./panel-data.mjs";
import { ERROR_FIELDS, constantOf } from "./constants.mjs";
import { callSubOVI, storeInSlot, subOVIControl } from "./subovi-calls.mjs";
import { mechanicalAction, writeIndicator } from "./panel-io.mjs";
import { PATH, dimensionsOf, esArray } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { convertValue, wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";
import { DEFAULT_CHART_HISTORY } from "./panel-memory.mjs";
import { NODE_EMITTERS } from "./node-table.mjs";

export function createNodeEmission(ovi) {
  const { cat, module, asSubOVI, chainIndex, g, logicalTypes, resueltos, calls, porId, llegaA, clumpDe, nuevaCelda, cadena, arrayConstante, clusterConstante, autoErrores, valor, controles, errores, automaticos, bufer } = ovi;
  const debugHook = (...args) => ovi.debugHook(...args);
  const panelRecordOf = (...args) => ovi.panelRecordOf(...args);
  const registerCallLibrary = (...args) => ovi.registerCallLibrary(...args);
  const registerControlReference = (...args) => ovi.registerControlReference(...args);
  const registerIndicator = (...args) => ovi.registerIndicator(...args);
  const registerPropertyNode = (...args) => ovi.registerPropertyNode(...args);

  // The outputs another clump reads need a crossing cell.
  const cruzan = new Set(g.cables.filter((c) => clumpDe(c.de.nodo) !== clumpDe(c.a.nodo)).map((c) => `${c.de.nodo}.${c.de.puerto}`));

  /** Lo que hace falta para emitir un nodo en el clump `k`. */
  function contexto(id, k) {
    const n = porId.get(id);
    const { in: entradas, out: salidas } = cat.puertos(n);
    const tIn = (i) => resueltos.entradas.get(`${id}.${entradas[i].name}`);
    const tOut = (j) => resueltos.salidas.get(`${id}.${salidas[j].name}`);
    const logicalTIn = (i) => logicalTypes.entradas.get(`${id}.${entradas[i].name}`);
    const logicalTOut = (j) => logicalTypes.salidas.get(`${id}.${salidas[j].name}`);
    const nuevoLocal = (vt) => k.locales.push(vt) - 1;
    const entrada = (i) => {
      const c = llegaA.get(`${id}.${entradas[i].name}`);
      if (!c) return constantOf(tIn(i), entradas[i].default ?? 0);
      const t = resueltos.salidas.get(`${c.de.nodo}.${c.de.puerto}`);
      const v = valor.get(`${c.de.nodo}.${c.de.puerto}`);
      // El nodo de origen ya dio un error: no hay valor, y el OVI no se emitirá.
      if (!v) return [];
      const leer = v.clump === k ? [ins("local.get", v.local)] : readAcrossFunctions(v, t);
      // Un array con otro tipo de arrayElement se convierte entero en un búfer propio:
      // el punto de coerción de LabVIEW (DT-042).
      if (esArray(t) && esArray(tIn(i)) && JSON.stringify(t.array) !== JSON.stringify(tIn(i).array)) return convertirArray(t, tIn(i), leer);
      const daqCoercion = daqTaskCoercion(logicalTypes.salidas.get(`${c.de.nodo}.${c.de.puerto}`), logicalTIn(i), leer);
      return daqCoercion ?? [...leer, ...convertValue(t, tIn(i))];
    };
    /** Copia el array que deja `origen` a una celda nueva, convirtiendo cada arrayElement de `desde.array` a `hacia.array`. */
    const convertirArray = (desde, hacia, origen) => {
      const [ed, eh] = [desde.array, hacia.array];
      const conv = convertValue(ed, eh);
      if (isByReference(ed) || isByReference(eh) || conv === null) throw new Error(`An array of ${JSON.stringify(ed)} cannot be converted into one of ${JSON.stringify(eh)}.`);
      const [elD, elH] = [arrayElement(ed), arrayElement(eh)];
      const celda = nuevaCelda();
      const [h, n, o, d, j] = Array.from({ length: 5 }, () => nuevoLocal("i32"));
      const g = (l) => ins("local.get", l);
      // The converted array keeps the sizes of the original, whatever its dimensions.
      const tamanos = Array.from({ length: dimensionsOf(desde) }, () => nuevoLocal("i32"));
      return [
        ...origen, ins("local.set", h), ...elementCount(desde, h, nuevoLocal), ins("local.set", n), g(h), callMemory("datos8"), ins("local.set", o),
        ...tamanos.flatMap((tamano, dimension) => [...dimensionSize(h, dimension, nuevoLocal), ins("local.set", tamano)]),
        ...reserveArray(hacia, celda, tamanos, nuevoLocal), ins("local.set", d),
        ins("i32.const", 0), ins("local.set", j), ins("block"), ins("loop"), g(j), g(n), ins("i32.ge_s"), ins("br_if", 1),
        g(d), g(j), ins("i32.const", elH.tam), ins("i32.mul"), ins("i32.add"),
        g(o), g(j), ins("i32.const", elD.tam), ins("i32.mul"), ins("i32.add"), ins(elD.carga), ...conv, ins(elH.guarda),
        g(j), ins("i32.const", 1), ins("i32.add"), ins("local.set", j), ins("br", 0), ins("end"), ins("end"),
        ins("i32.const", celda),
      ];
    };
    const cableada = (i) => llegaA.has(`${id}.${entradas[i].name}`);
    return { n, entradas, salidas, tIn, tOut, logicalTIn, logicalTOut, nuevoLocal, entrada, cableada, nombre: n.label?.text ?? n.name };
  }

  /**
   * A cell of the data space for a value that crosses from one clump to another. It is memory and
   * not a WebAssembly global because every thread of the pool has globals of its own but shares
   * the memory (DT-063 §1): the clump that reads the value may run on another thread.
   */
  const crossingCell = (wasmType) => {
    const bytes = wasmType === "i64" || wasmType === "f64" ? 8 : 4;
    return bufer(bytes, bytes);
  };
  /**
   * Reads the value `v`, of type `t`, from a function other than the one that produced it —a clump of a subplan, or
   * the loop that calls it—: it goes through a cell of the data space. It is stored at the end of what its function
   * has emitted so far, which comes before the call to the subplan that reads it. Every reader stores it again unless
   * it was stored where it was produced: the first reader may be inside a frame of a Case, and a store emitted there
   * never runs for a reader in another frame.
   */
  function readAcrossFunctions(v, t) {
    v.wasmType ??= wasmTypeOf(t);
    v.cell ??= crossingCell(v.wasmType);
    if (!v.storedWhereProduced) v.clump.cuerpo.push(...storeCrossing(v));
    return loadCrossing(v);
  }
  const storeCrossing = (v) => [ins("i32.const", v.cell), ins("local.get", v.local), ins(`${v.wasmType}.store`)];
  const loadCrossing = (v) => [ins("i32.const", v.cell), ins(`${v.wasmType}.load`)];

  /** The value of an output is in the local `l`; if another clump reads it, also in a crossing cell. */
  function dejar(k, id, puerto, l, vt) {
    const v = { local: l, clump: k, wasmType: vt };
    if (cruzan.has(`${id}.${puerto}`)) {
      v.cell = crossingCell(vt);
      v.storedWhereProduced = true;
      k.cuerpo.push(...storeCrossing(v));
    }
    valor.set(`${id}.${puerto}`, v);
  }

  function emitirNodo(id, k) {
    const { n, entradas, salidas, tIn, tOut, logicalTIn, logicalTOut, nuevoLocal, entrada, cableada, nombre } = contexto(id, k);
    const tiposNodo = [...entradas.map((_, i) => tIn(i)), ...salidas.map((_, j) => tOut(j))];
    if (tiposNodo.some((t) => !escalar(t))) return errores.push({ nodo: id, motivo: `"${nombre}" carries a type the compiler cannot emit yet.` });
    // Un indicador sin cable no se escribe: conserva su valor, como en LabVIEW.
    if (["indicator", "bool-indicator", "str-indicator", "cluster-indicator", "arr-indicator", "visa-indicator", "path-indicator", "refnum-indicator", "daq-name-indicator", "waveform-chart", "waveform-graph", "xy-graph"].includes(n.tipo)) {
      if (!llegaA.has(`${id}.value`)) return;
      // In a subOVI, a connector indicator leaves its value in its slot for the caller; any other one, nowhere.
      if (asSubOVI) {
        const slot = asSubOVI.get(n.name);
        if (slot) k.cuerpo.push(...storeInSlot(tIn(0), slot, entrada(0), nuevoLocal));
        return;
      }
      const historyLength = n.tipo === "waveform-chart" ? (n.config?.historyLength ?? DEFAULT_CHART_HISTORY) : null;
      const { record, slot } = registerIndicator(id, tIn(0), logicalTIn(0), historyLength);
      k.cuerpo.push(...writeIndicator(record, slot, tIn(0), entrada(0), nuevoLocal, historyLength), ...debugHook(id, []));
      return;
    }
    // VISA and the file functions are served by the same I/O (the editor's I/O process).
    // VISA's Property Node too (DT-072 §5).
    if (VISA_FUNCTIONS.has(n.tipo) || FILE_FUNCTIONS.has(n.tipo) || (n.tipo === "property-node" && n.config?.class === "Instr") || n.tipo === "call-library") module.usesInstrumentIo = true;
    const emitir = n.tipo === "subvi" ? (e) => callSubOVI(e, calls.get(id)) : asSubOVI && PANEL_CONTROLS.includes(n.tipo) ? (e) => subOVIControl(e, asSubOVI.get(n.name)) : NODE_EMITTERS[n.tipo];
    if (!emitir) return errores.push({ nodo: id, motivo: `The compiler cannot emit "${nombre}" (${n.tipo}) yet.` });
    const e = { nodo: n, cat, tIn, tOut, logicalTIn, logicalTOut, entrada, cableada, temporal: nuevoLocal, indice: controles.length, celda: nuevaCelda, cadena, bufer, clusterConstante, arrayConstante, chainIndex, registerPropertyNode, registerCallLibrary, registerControlReference };
    if (!asSubOVI && PANEL_CONTROLS.includes(n.tipo)) {
      e.controlRecord = panelRecordOf(id, tOut(0)).record;
      controles.push({ nodo: id, name: n.name, tipo: tOut(0), mecanica: mechanicalAction(cat, n), record: e.controlRecord, ...panelDataOf(tOut(0), logicalTOut(0)), ...(RESOURCE_NAME_PANEL_OBJECTS.has(n.tipo) && { resourceName: true }), ...(logicalTOut(0) === PATH && { path: true }), ...taskPanelData(logicalTOut(0)) });
    }
    try {
      const b = cat.bloque(n.tipo);
      const ie = entradas.findIndex((p) => p.name === "error-in");
      const oe = salidas.findIndex((p) => p.name === "error-out");
      if (b["pasa-error"] && ie >= 0 && oe >= 0) k.cuerpo.push(...pasaError(e, salidas, ie, oe, emitir(e)));
      else k.cuerpo.push(...emitir(e));
    } catch (fallo) {
      return errores.push({ nodo: id, motivo: fallo.message });
    }
    const locs = salidas.map((_, j) => nuevoLocal(wasmTypeOf(tOut(j))));
    for (let j = locs.length - 1; j >= 0; j--) k.cuerpo.push(ins("local.set", locs[j]));
    salidas.forEach((p, j) => dejar(k, id, p.name, locs[j], wasmTypeOf(tOut(j))));
    k.cuerpo.push(...debugHook(id, salidas.map((p, j) => ({ port: p.name, type: tOut(j), local: locs[j] }))));
    // Manejo automático de errores (DT-043): un «error out» sin cablear que lleva un error para el OVI y lo cuenta.
    const oe = salidas.findIndex((p) => p.name === "error-out");
    if (oe >= 0 && autoErrores && n.tipo !== "simple-error-handler" && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) {
      k.cuerpo.push(ins("local.get", locs[oe]), ins("i32.load", ERROR_FIELDS.status), ins("if"),
        ins("i32.const", automaticos.push(id) - 1), ins("local.get", locs[oe]), ins("call", importIndex("error_automatico")), ins("drop"), ins("end"));
    }
  }

  /**
   * El envoltorio de una función con «error in» y «error out» (DT-043, medido en
   * LabVIEW): con status TRUE a la entrada no trabaja, sus salidas dan el valor
   * por defecto y «error out» es el mismo cluster; si no, trabaja (`trabajo`
   * deja sus salidas en la pila, «error out» incluido).
   */
  function pasaError(e, salidas, ie, oe, trabajo) {
    const locs = salidas.map((_, j) => e.temporal(wasmTypeOf(e.tOut(j))));
    const x = e.temporal("i32");
    const c = [...e.entrada(ie), ins("local.tee", x), ins("i32.load", ERROR_FIELDS.status), ins("if")];
    salidas.forEach((_, j) => c.push(...(j === oe ? [ins("local.get", x)] : constantOf(e.tOut(j), 0)), ins("local.set", locs[j])));
    c.push(ins("else"), ...trabajo);
    for (let j = locs.length - 1; j >= 0; j--) c.push(ins("local.set", locs[j]));
    c.push(ins("end"), ...locs.map((l) => ins("local.get", l)));
    return c;
  }

  return { cruzan, contexto, crossingCell, storeCrossing, loadCrossing, dejar, emitirNodo, pasaError };
}
