// Compiles one OVI's diagram into the module being built (DT-039, DT-040): its nodes in dataflow order, split into
// clumps (clumps.mjs), each node emitted by its entry of the node table (node-table.mjs), the structures with their
// tunnels and shift registers, the panel (panel-io.mjs) and the subOVI calls (subovi-calls.mjs).

import { ejecutable, nodesWithUndefinedInput, orden, requerido, tipos, undefinedArrayNodes } from "../model/graph.mjs";
import { LARGOS } from "./node-kinds.mjs";
import { ARRAY_HEADER_BYTES, arrayElement, SECOND_SIZE_OFFSET } from "./memory-ops.mjs";
import { constantOf, setZeroClusterAddress } from "./constants.mjs";
import { subOVIInstance } from "./subovi-calls.mjs";
import { dimensionsOf, esCluster, flattenArrayValue, inMemory } from "../model/types.mjs";
import { elementValueIn } from "../model/cluster-values.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";
import { bloqueCadena, i32 } from "./linear-memory.mjs";
import { splitIntoClumps, topologicalOrder } from "./clumps.mjs";
import { createSequences } from "./sequences.mjs";
import { createCaseStructure } from "./case-structure.mjs";
import { createLoopStructures } from "./loop-structures.mjs";
import { createNodeEmission } from "./node-emission.mjs";
import { createDebugHooks } from "./debug-hooks.mjs";
import { createPanelRegistry } from "./panel-registry.mjs";

/** The resolved types of an OVI with each terminal's type as it is laid out in memory (`inMemory`). */
function laidOutInMemory(resolved) {
  const mapTypes = (types) => new Map([...types].map(([terminal, type]) => [terminal, inMemory(type)]));
  return { ...resolved, entradas: mapTypes(resolved.entradas), salidas: mapTypes(resolved.salidas) };
}

/**
 * Compiles one OVI into `module`. `asSubOVI` is null for the top-level OVI, whose
 * controls and indicators are the panel's; for a subOVI it maps the name of each
 * connector control and indicator to its slot in the data space, through which
 * the caller passes inputs and reads outputs (DT-045).
 */
export function compileOVI(withDecorations, cat, module, asSubOVI, instanceKey, chainIndex) {
  // Free labels and other decorations (DT-085) are presentation: they have no ports and nothing to emit.
  const g = { ...withDecorations, nodos: withDecorations.nodos.filter((n) => !cat.bloque(n.tipo).decoracion) };
  // A path is laid out as a string's handle, so the functions that take a path or a string, and the
  // panel, look at the types as the graph has them.
  const logicalTypes = tipos(g, cat);
  const resueltos = laidOutInMemory(logicalTypes);
  if (!ejecutable(g, cat, resueltos)) {
    const errores = [...resueltos.cables.entries()].filter(([, c]) => c.roto).map(([id, c]) => ({ cable: id, motivo: c.roto }));
    const llegan = new Set(g.cables.map((c) => `${c.a.nodo}.${c.a.puerto}`));
    for (const n of g.nodos) {
      if (cat.bloque(n.tipo).panel) continue;
      for (const p of cat.puertos(n).in) {
        if (requerido(g, n, p) && !llegan.has(`${n.id}.${p.name}`)) errores.push({ nodo: n.id, motivo: `"${n.label?.text ?? n.name}" is missing a wire on its input "${p.label ?? p.name}".` });
      }
    }
    // DT-060: an array with no element has no type to emit, nor has whatever receives it.
    for (const n of undefinedArrayNodes(g)) errores.push({ nodo: n.id, motivo: `"${n.label?.text ?? n.name}" is an array with no element: its type is undefined.` });
    for (const id of nodesWithUndefinedInput(g, resueltos)) {
      const n = g.nodos.find((node) => node.id === id);
      errores.push({ nodo: id, motivo: `"${n.label?.text ?? n.name}" receives an array with no element: its type is undefined.` });
    }
    return { errores };
  }
  // The subOVIs first, each into its own instance, before this OVI claims the zero zone (DT-045).
  const calls = new Map(); // subvi node id → compiled instance
  for (const n of g.nodos.filter((x) => x.tipo === "subvi")) {
    // A polymorphic OVI is called as the instance the node has chosen (DT-074 §2).
    const callee = cat.calleeOf ? cat.calleeOf(n) : cat.findSubOVI?.(n.config?.vi);
    if (!callee) return { errores: [{ nodo: n.id, motivo: `The subOVI "${n.config?.vi}" is not loaded.` }] };
    const instance = subOVIInstance(callee, n, module, instanceKey, compileOVI);
    if (instance.errores) return { errores: instance.errores };
    calls.set(n.id, instance);
  }
  const { orden: ids } = orden(g);
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const llegaA = new Map(g.cables.map((c) => [`${c.a.nodo}.${c.a.puerto}`, c]));
  const esEstructura = (id) => !!cat.bloque(porId.get(id).tipo).estructura;
  // Un bucle tarda; un Case, sólo si algo suyo tarda (si no, es instantáneo y va
  // en el clump de lo que le rodea, como cualquier nodo).
  // Cada marco de una Flat Sequence es, para el flujo de datos, un arrayElement
  // propio (`secuencia#k`), encadenado al anterior: en LabVIEW lo que sale de un
  // marco sale al acabar ese marco, no la secuencia (comprobado en 2026 Q3,
  // labview-captures/structures/secuencia-*.png). La Stacked es un solo nodo.
  const deMarco = (item) => (typeof item === "string" && item.includes("#") ? item.split("#") : null);
  const esFlat = (id) => porId.get(id)?.tipo === "flat-sequence";
  const esLargo = (id) => {
    const m = deMarco(id);
    if (m) return g.nodos.some((k) => k.dentro === m[0] && k.marco === Number(m[1]) && esLargo(k.id));
    const n = porId.get(id);
    if (LARGOS.has(n.tipo) || n.tipo === "while-loop" || n.tipo === "for-loop") return true;
    if (n.tipo === "subvi") return calls.get(n.id).plan !== null;
    // Un «error out» sin cablear puede sacar el diálogo del manejo automático, que espera al usuario.
    if (g.vi?.["automatic-error-handling"] !== false && n.tipo !== "simple-error-handler" && cat.puertos(n).out.some((p) => p.name === "error-out") && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) return true;
    return esEstructura(id) && g.nodos.some((k) => k.dentro === id && esLargo(k.id));
  };
  /** El marco de una Flat al que pertenece un hijo suyo: el suyo, el del primero que lee un túnel de entrada o el del que alimenta uno de salida. */
  const marcoEnFlat = (d, seq) => {
    if (d.marco !== undefined) return d.marco;
    const hijo = (x) => {
      let n = porId.get(x);
      while (n && n.dentro !== seq) n = porId.get(n.dentro);
      return n;
    };
    if (d.tipo === "tunnel-in") {
      const ks = g.cables.filter((c) => c.de.nodo === d.id).map((c) => hijo(c.a.nodo)?.marco).filter((k) => k !== undefined);
      return ks.length ? Math.min(...ks) : 0;
    }
    const c = llegaA.get(`${d.id}.x`);
    const k = c && hijo(c.de.nodo)?.marco;
    return k ?? porId.get(seq).config.marcos.length - 1;
  };
  // El representante de un nodo en un ámbito: él mismo, la estructura de ese
  // ámbito que lo contiene o, en una Flat, el marco; `raiz`, en el del OVI.
  const representante = (id, ambito) => {
    let n = porId.get(id);
    let hijo = null;
    while (n && n.dentro !== ambito) {
      hijo = n;
      n = porId.get(n.dentro);
    }
    if (n && esFlat(n.id) && hijo) {
      while (hijo.dentro !== n.id) hijo = porId.get(hijo.dentro);
      return `${n.id}#${marcoEnFlat(hijo, n.id)}`;
    }
    return n?.id;
  };
  const raiz = (id) => representante(id, undefined);
  /** Una lista de un ámbito con cada Flat cambiada por sus marcos, y las cadenas que los ordenan. */
  const conMarcos = (lista) => {
    const r = [];
    const cadenas = [];
    for (const id of lista) {
      if (!esFlat(id)) {
        r.push(id);
        continue;
      }
      const n = porId.get(id).config.marcos.length;
      for (let k = 0; k < n; k++) {
        r.push(`${id}#${k}`);
        if (k) cadenas.push([`${id}#${k - 1}`, `${id}#${k}`]);
      }
    }
    return { lista: r, cadenas };
  };
  // El diagrama del OVI en orden, con cada estructura como un bloque: va después
  // de lo que entra por sus túneles y antes de lo que lee sus salidas.
  const deArriba = conMarcos(ids.filter((id) => !porId.get(id).dentro));
  const arriba = topologicalOrder(g, deArriba.lista, raiz, deArriba.cadenas);
  const { clumpDe: clumpRaiz, clumps } = splitIntoClumps(g, arriba, raiz, esLargo, deArriba.cadenas);
  const clumpDe = (id) => clumpRaiz.get(raiz(id));
  const { constantes, datosFijos, planes, automaticos, bufer } = module;
  const nuevaCelda = () => bufer(4, 4);
  // El cluster «cero»: tan grande como el mayor cluster del OVI; no se escribe nunca.
  const tamMax = Math.max(0, ...[...resueltos.entradas.values(), ...resueltos.salidas.values()].filter(esCluster).map((t) => clusterLayout(t).tam));
  setZeroClusterAddress(bufer(Math.max(tamMax, 8)));
  const cadena = (texto) => {
    const celda = nuevaCelda();
    constantes.push({ celda, bytes: bloqueCadena(texto) });
    return celda;
  };
  /**
   * Una constantOf de array: su bloque [n][relleno][elementos] en el data space,
   * ya escrito al instanciar, y la celda que lo apunta. Sus cadenas, en la zona
   * estática; sus clusters, con clusterConstante.
   */
  const arrayConstante = (t, valoresAnidados) => {
    const el = arrayElement(t.array);
    const celda = nuevaCelda();
    const { sizes, elements: valores } = flattenArrayValue(valoresAnidados, dimensionsOf(t), undefined);
    if (!valores.length) return celda;
    const b = bufer(ARRAY_HEADER_BYTES + valores.length * el.tam);
    sizes.forEach((size, dimension) => datosFijos.push({ desde: b + dimension * SECOND_SIZE_OFFSET, bytes: i32(size) }));
    datosFijos.push({ desde: celda, bytes: i32(b) });
    valores.forEach((v, i) => {
      const dir = b + ARRAY_HEADER_BYTES + i * el.tam;
      if (t.array === "string") constantes.push({ celda: dir, bytes: bloqueCadena(String(v ?? "")) });
      else if (esCluster(t.array)) clusterConstante(t.array, v, dir);
      else {
        const bytes = new Uint8Array(el.tam);
        const dv = new DataView(bytes.buffer);
        const x = t.array === "boolean" ? (v ? 1 : 0) : Number(v ?? 0);
        ({ 1: () => dv.setInt8(0, x), 2: () => dv.setInt16(0, x, true), 4: () => (el.carga === "f32.load" ? dv.setFloat32(0, x, true) : dv.setInt32(0, x, true)), 8: () => (el.carga === "f64.load" ? dv.setFloat64(0, x, true) : dv.setBigInt64(0, BigInt(Math.trunc(x)), true)) })[el.tam]();
        datosFijos.push({ desde: dir, bytes });
      }
    });
    return celda;
  };
  /** Una constantOf de cluster: su bloque en el data space, ya escrito al instanciar; sus cadenas, en la zona estática. */
  const clusterConstante = (t, v, dir = null) => {
    const d = clusterLayout(t);
    const b = dir ?? bufer(d.tam);
    d.campos.forEach((c, index) => {
      const x = elementValueIn(v, index, c.nombre);
      if (esCluster(c.tipo)) clusterConstante(c.tipo, x, b + c.off);
      else if (c.tipo === "string") constantes.push({ celda: b + c.off, bytes: bloqueCadena(String(x ?? "")) });
      else {
        const vt = wasmTypeOf(c.tipo);
        const bytes = new Uint8Array(vt === "f64" || vt === "i64" ? 8 : 4);
        const dv = new DataView(bytes.buffer);
        if (vt === "f64") dv.setFloat64(0, Number(x ?? 0), true);
        else if (vt === "f32") dv.setFloat32(0, Number(x ?? 0), true);
        else if (vt === "i64") dv.setBigInt64(0, BigInt(Math.trunc(Number(x ?? 0))), true);
        else dv.setInt32(0, c.tipo === "boolean" ? (x ? 1 : 0) : Number(x ?? 0) | 0, true);
        datosFijos.push({ desde: b + c.off, bytes });
      }
    });
    return b;
  };
  // Manejo automático de errores, activo de fábrica (OVI Properties ▸ Execution).
  const autoErrores = g.vi?.["automatic-error-handling"] !== false;
  const valor = new Map(); // `${nodo}.${puerto}` → { local, wasmType, clump, cell }
  const controles = [];
  const indicadores = [];
  const errores = [];

  const ovi = { withDecorations, cat, module, asSubOVI, instanceKey, chainIndex, g, logicalTypes, resueltos, calls, porId, llegaA, esEstructura, deMarco, esFlat, esLargo, marcoEnFlat, representante, raiz, conMarcos, deArriba, arriba, clumpDe, nuevaCelda, tamMax, cadena, arrayConstante, clusterConstante, autoErrores, valor, controles, indicadores, errores, constantes, datosFijos, planes, automaticos, bufer, ids, clumpRaiz, clumps };
  Object.assign(ovi, createPanelRegistry(ovi));
  Object.assign(ovi, createDebugHooks(ovi));
  Object.assign(ovi, createNodeEmission(ovi));
  Object.assign(ovi, createLoopStructures(ovi));
  Object.assign(ovi, createCaseStructure(ovi));
  Object.assign(ovi, createSequences(ovi));
  for (const id of arriba) ovi.emitirEn(id, clumps[clumpRaiz.get(id)]);
  if (errores.length) return { errores };
  return { clumps, controles, indicadores };
}
