// The structures that are not a Case or a sequence: the While Loop and the For Loop, with their tunnels and shift registers.
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { orden } from "../model/graph.mjs";
import { callMemory, callScheduler } from "./runtime-functions.mjs";
import { arrayElement, copyValue, dimensionSize, loadElement, storeElement } from "./memory-ops.mjs";
import { constantOf } from "./constants.mjs";
import { gatherRowsInto2dArray, loopRowOfIteration } from "./array-rows.mjs";
import { esArray, esCluster } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";
import { topologicalOrder } from "./clumps.mjs";

export function createLoopStructures(ovi) {
  const { g, porId, llegaA, representante, nuevaCelda, cadena, valor, bufer, ids, clumps } = ovi;
  const borderHook = (...args) => ovi.borderHook(...args);
  const contexto = (...args) => ovi.contexto(...args);
  const debugHook = (...args) => ovi.debugHook(...args);
  const dejar = (...args) => ovi.dejar(...args);
  const emitirCuerpo = (...args) => ovi.emitirCuerpo(...args);
  const frameHook = (...args) => ovi.frameHook(...args);

  /**
   * Un While o un For, en línea en la función de su clump (DT-041): los túneles
   * de entrada se leen una vez; cada vuelta corre el cuerpo en orden
   * topológico, guarda lo de los shift registers y los túneles de salida, mira
   * la condición y cede si se le acaba el presupuesto; al acabar, los túneles
   * de salida dan el valor de la última vuelta. Un For con N ≤ 0 no corre: sus
   * túneles dan el valor por defecto y sus shift registers el inicial.
   */
  function emitirEstructura(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const BORDE = new Set(["tunnel-in", "tunnel-out", "shift-register-left", "shift-register-right", "loop-iteration", "loop-condition", "loop-count"]);
    // El cuerpo, en orden con cada estructura de dentro como un bloque; el borde, aparte.
    const hijos = [...deAqui.filter((id) => BORDE.has(porId.get(id).tipo)), ...topologicalOrder(g, deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), (id) => representante(id, sid))];
    const de = (tipo) => hijos.filter((id) => porId.get(id).tipo === tipo);
    const L = (vt) => k.locales.push(vt) - 1;
    const c = k.cuerpo;
    // Antes de la primera vuelta: lo que entra por el borde. Un túnel indexado
    // guarda su array (handle, longitud, datos) y da su arrayElement en cada vuelta.
    const indexados = [];
    for (const id of de("tunnel-in")) {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      if (porId.get(id).config?.indexado) {
        // `m` is the length of a 1D array or the rows of a 2D one: the first word of the block either way.
        const [h, m, d] = [L("i32"), L("i32"), L("i32")];
        c.push(...x.entrada(0), ins("local.tee", h), callMemory("longitud"), ins("local.set", m), ins("local.get", h), callMemory("datos8"), ins("local.set", d));
        const fila = esArray(x.tOut(0)) ? { celda: nuevaCelda(), columnas: L("i32") } : null;
        if (fila) c.push(...dimensionSize(h, 1, L), ins("local.set", fila.columnas));
        indexados.push({ t: x.tOut(0), l, m, d, fila });
      } else c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    const registros = de("shift-register-left").map((id) => {
      const x = contexto(id, k);
      const vt = wasmTypeOf(x.tOut(0));
      const [ahora, nuevo] = [L(vt), L(vt)];
      // Una cadena: el shift register tiene su propia celda y se guarda una copia,
      // para que quien la produjo pueda reescribir su búfer en la vuelta siguiente.
      const t = x.tOut(0);
      const celda = t === "string" || esArray(t) ? nuevaCelda() : esCluster(t) ? bufer(clusterLayout(t).tam) : null;
      // Uninitialized, it starts with what it held when the loop last ended, kept in
      // the data space: a functional global variable relies on it (DT-045).
      const inicializado = x.cableada(0);
      const guardado = !inicializado && celda === null ? bufer(8) : null;
      if (celda !== null && inicializado) c.push(...copyValue(t, x.entrada(0), celda, x.nuevoLocal));
      if (celda !== null) c.push(ins("i32.const", celda), ins("local.set", ahora));
      else if (guardado !== null) c.push(ins("i32.const", guardado), ins(`${vt}.load`), ins("local.set", ahora));
      else c.push(...x.entrada(0), ins("local.set", ahora));
      valor.set(`${id}.value`, { local: ahora, clump: k });
      return { izq: id, der: porId.get(id).config.par, ahora, nuevo, vt, celda, t, guardado };
    });
    // La cuenta de un For: la cableada, recortada a la longitud de cada array indexado.
    let n = null;
    for (const id of de("loop-count")) {
      n = L("i32");
      const cableada = llegaA.has(`${id}.count`);
      c.push(...(cableada ? contexto(id, k).entrada(0) : indexados.length ? [ins("local.get", indexados[0].m)] : [ins("i32.const", 0)]), ins("local.set", n));
      for (const x of indexados) c.push(ins("local.get", x.m), ins("local.get", n), ins("local.get", x.m), ins("local.get", n), ins("i32.lt_s"), ins("select"), ins("local.set", n));
      // N shows the count it was given on its own terminal, once (measured); it has no wire inside to carry it.
      if (cableada) c.push(...debugHook(id, [{ port: "count", type: "i32", local: n }], { border: true }));
    }
    const i = L("i32");
    for (const id of de("loop-iteration")) valor.set(`${id}.i`, { local: i, clump: k });
    const presupuesto = L("i32");
    const salidas = de("tunnel-out").map((id) => {
      const x = contexto(id, k);
      // Un túnel de salida indexado va llenando el array de su celda, una vuelta cada vez.
      if (porId.get(id).config?.indexado) return { id, l: L("i32"), indexado: { celda: nuevaCelda(), n: L("i32"), t: x.tIn(0) } };
      return { id, l: L(wasmTypeOf(x.tOut(0))) };
    });
    const parada = L("i32");

    // Cada vez que se entra en la estructura —un bucle dentro de otro entra
    // muchas—, i vuelve a 0 y los túneles de salida al valor por defecto.
    c.push(ins("i32.const", 0), ins("local.set", i));
    for (const t of salidas) {
      if (t.indexado) {
        const el = arrayElement(t.indexado.t);
        c.push(ins("i32.const", 0), ins("local.set", t.indexado.n), ins("i32.const", t.indexado.celda), ins("i32.const", 0), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("drop"));
      } else c.push(...constantOf(contexto(t.id, k).tOut(0), 0), ins("local.set", t.l));
    }
    c.push(...frameHook(sid, "start"), ins("block"));
    if (n !== null) c.push(ins("local.get", n), ins("i32.const", 0), ins("i32.le_s"), ins("br_if", 0));
    c.push(ins("loop"));
    // El arrayElement de cada túnel indexado en esta vuelta (fuera del array, el valor por defecto).
    for (const x of indexados) {
      if (x.fila) {
        c.push(...loopRowOfIteration(x, i, L));
        continue;
      }
      const el = arrayElement(x.t);
      c.push(...constantOf(x.t, 0), ins("local.set", x.l), ins("local.get", i), ins("local.get", x.m), ins("i32.lt_s"),
        ins("if"), ...loadElement(x.t, [ins("local.get", x.d), ins("local.get", i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")]), ins("local.set", x.l), ins("end"));
    }
    // Each iteration the values enter again by the border, as Highlight Execution shows them.
    for (const id of de("tunnel-in")) c.push(...borderHook(id, "y", valor.get(`${id}.y`).local, k));
    for (const r of registros) c.push(...borderHook(r.izq, "value", r.ahora, k));
    for (const id of de("loop-iteration")) c.push(...borderHook(id, "i", i, k));
    emitirCuerpo(deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), sid, k);
    for (const t of salidas) {
      if (!t.indexado) {
        c.push(...contexto(t.id, k).entrada(0), ins("local.set", t.l));
        continue;
      }
      const { celda, n: m, t: te } = t.indexado;
      const el = arrayElement(te);
      const d = L("i32");
      c.push(
        ins("i32.const", celda), ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), callMemory("nuevo_array"), ins("local.set", d),
        ...storeElement(te, [ins("local.get", d), ins("local.get", m), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")], contexto(t.id, k).entrada(0), L),
        ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("local.set", m),
      );
    }
    for (const r of registros) c.push(...contexto(r.der, k).entrada(0), ins("local.set", r.nuevo));
    for (const id of de("loop-condition")) {
      c.push(...contexto(id, k).entrada(0));
      if (porId.get(id).config?.mode === "continue-if-true") c.push(ins("i32.eqz"));
      c.push(ins("local.set", parada));
    }
    for (const r of registros) {
      if (r.celda !== null) c.push(...copyValue(r.t, [ins("local.get", r.nuevo)], r.celda, L));
      else c.push(ins("local.get", r.nuevo), ins("local.set", r.ahora));
    }
    c.push(...frameHook(sid, "iteration"));
    // i + 1, sin pasar de 2^31 − 1: LabVIEW lo deja ahí.
    c.push(ins("local.get", i), ins("local.get", i), ins("i32.const", 0x7fffffff), ins("i32.ne"), ins("i32.add"), ins("local.set", i));
    c.push(
      ins("local.get", presupuesto), ins("i32.const", 1), ins("i32.sub"), ins("local.tee", presupuesto), ins("i32.const", 0), ins("i32.le_s"),
      ins("if"), callScheduler("yield_point"), ins("local.set", presupuesto), ins("end"),
    );
    if (n !== null) c.push(ins("local.get", i), ins("local.get", n), ins("i32.lt_s"), ins("br_if", 0));
    else c.push(ins("local.get", parada), ins("i32.eqz"), ins("br_if", 0));
    c.push(ins("end"), ins("end"));
    // Al acabar: lo que sale por el borde.
    for (const t of salidas) {
      // Rows that come out of an indexed tunnel make a 2D array: one block, not an array of arrays (DT-044).
      if (t.indexado && esArray(t.indexado.t)) {
        const celda = nuevaCelda();
        c.push(...gatherRowsInto2dArray(contexto(t.id, k).tOut(0), t.indexado.celda, celda, L), ins("i32.const", celda), ins("local.set", t.l));
      } else if (t.indexado) c.push(ins("i32.const", t.indexado.celda), ins("local.set", t.l));
      dejar(k, t.id, "y", t.l, wasmTypeOf(contexto(t.id, k).tOut(0)));
      c.push(...borderHook(t.id, "y", t.l, k));
    }
    for (const r of registros) if (r.guardado !== null) c.push(ins("i32.const", r.guardado), ins("local.get", r.ahora), ins(`${r.vt}.store`));
    for (const r of registros) {
      dejar(k, r.der, "result", r.ahora, r.vt);
      c.push(...borderHook(r.der, "result", r.ahora, k));
    }
    void s;
  }

  return { emitirEstructura };
}
