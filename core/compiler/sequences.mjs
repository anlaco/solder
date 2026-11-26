// The bodies of the structures, the Flat and Stacked Sequences, and the dispatch of a node or a structure into its clump.
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { orden } from "../model/graph.mjs";
import { callScheduler } from "./runtime-functions.mjs";
import { ins } from "./instructions.mjs";
import { wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";
import { splitIntoClumps, topologicalOrder } from "./clumps.mjs";
import { FEEDBACK_STORE } from "../model/feedback-node.mjs";

export function createSequences(ovi) {
  const { g, porId, esEstructura, deMarco, esLargo, marcoEnFlat, representante, conMarcos, clumpDe, valor, planes, ids, clumps } = ovi;
  const borderHook = (...args) => ovi.borderHook(...args);
  const contexto = (...args) => ovi.contexto(...args);
  const dejar = (...args) => ovi.dejar(...args);
  const emitirCase = (...args) => ovi.emitirCase(...args);
  const emitirEstructura = (...args) => ovi.emitirEstructura(...args);
  const emitirNodo = (...args) => ovi.emitirNodo(...args);
  const frameHook = (...args) => ovi.frameHook(...args);

  /**
   * El cuerpo de una estructura (o de un marco). Con menos de dos nodos largos,
   * en línea y en orden. Con más, como LabVIEW los corre a la vez —dos Wait en
   * el mismo bucle se solapan—, se parte en clumps (un subplan): cada uno es una
   * función, y la estructura llama a `correr_plan`, que los corre por flujo de
   * datos y espera a todos (DT-041).
   */
  function emitirCuerpo(cuerpo, sid, k) {
    const rep = (id) => representante(id, sid);
    const { lista, cadenas } = conMarcos(cuerpo);
    const orden = topologicalOrder(g, lista, rep, cadenas);
    if (orden.filter(esLargo).length < 2) {
      for (const id of orden) emitirEn(id, k);
      return;
    }
    const { clumpDe: deSub, clumps: sub } = splitIntoClumps(g, orden, rep, esLargo, cadenas);
    const p = planes.push(sub) - 1;
    for (const id of orden) emitirEn(id, sub[deSub.get(id)]);
    k.cuerpo.push(ins("i32.const", p), callScheduler("run_plan"), ins("drop"));
  }

  /**
   * Un marco de una Flat Sequence: los túneles de entrada que lee primero, su
   * cuerpo y los túneles de salida que alimenta, que dan su valor al acabar el
   * marco. Lo que pasa de un marco a otro, si van en clumps distintos, viaja por
   * una celda del data space (DT-041, DT-063 §1).
   */
  function emitirMarcoFlat(seq, m, k) {
    const deAqui = ids.filter((id) => porId.get(id).dentro === seq);
    const c = k.cuerpo;
    const lastFrame = m === porId.get(seq).config.marcos.length - 1;
    c.push(...frameHook(seq, m === 0 ? "start" : "between"));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l), ...borderHook(id, "y", l, k));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), seq, k);
    c.push(...frameHook(seq, lastFrame ? "last-frame-end" : "frame-end", m));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
      c.push(...borderHook(id, "y", l, k));
    }
  }

  /**
   * Una Stacked Sequence, en línea: los túneles de entrada se leen una vez;
   * cada marco corre entero, en orden, y sus datos llegan a los marcos de
   * después como locales; los túneles de salida dan su valor cuando acaba el
   * último marco, porque la secuencia es un nodo (de la ayuda de NI: es lo que
   * la distingue de la Flat).
   */
  function emitirSecuencia(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = k.locales.push(wasmTypeOf(x.tOut(0))) - 1;
      c.push(...x.entrada(0), ins("local.set", l), ...borderHook(id, "y", l, k));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    (s.config?.marcos ?? []).forEach((_, m) => emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out")) {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
      c.push(...borderHook(id, "y", l, k));
    }
  }

  const emitirEn = (id, k) => {
    const m = deMarco(id);
    if (m) return emitirMarcoFlat(m[0], Number(m[1]), k);
    const tipo = porId.get(id).tipo;
    if (tipo === FEEDBACK_STORE) return ovi.emitFeedbackStore(id, k);
    if (tipo === "case-structure") return emitirCase(id, k);
    if (tipo === "flat-sequence" || tipo === "stacked-sequence") return emitirSecuencia(id, k);
    return esEstructura(id) ? emitirEstructura(id, k) : emitirNodo(id, k);
  };

  return { emitirCuerpo, emitirMarcoFlat, emitirSecuencia, emitirEn };
}
