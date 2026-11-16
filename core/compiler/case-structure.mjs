// The Case Structure: its selector, its frames and its tunnels.
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { orden } from "../model/graph.mjs";
import { coversEveryError, isErrorFrameValue } from "../model/error-case.mjs";
import { importIndex } from "./host-imports.mjs";
import { ERROR_FIELDS, constantOf } from "./constants.mjs";
import { esCluster, esEnum, esError } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { convertValue, wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";

export function createCaseStructure(ovi) {
  const { porId, llegaA, cadena, valor, errores, ids } = ovi;
  const borderHook = (...args) => ovi.borderHook(...args);
  const contexto = (...args) => ovi.contexto(...args);
  const dejar = (...args) => ovi.dejar(...args);
  const emitirCuerpo = (...args) => ovi.emitirCuerpo(...args);
  const frameHook = (...args) => ovi.frameHook(...args);

  /**
   * Un Case, en línea (DT-041): los túneles de entrada se leen una vez; el
   * selector, redondeado a entero si es decimal, elige un marco por una cadena
   * de if/else (sus valores y rangos, en orden; el Default, al final); sólo corre
   * lo de ese marco, y cada túnel de salida toma lo que le llega en él, o el
   * valor por defecto con Use Default If Unwired.
   */
  /**
   * Whether the frames give every item of the enum `t` a frame; ranges include both ends
   * (spec/04 Rule 17e). A frame's values are item names (DT-049); a name that is not an
   * item covers nothing.
   */
  function coversEveryItem(t, frames) {
    const at = (name) => (name === undefined ? undefined : t.enum.indexOf(name));
    const covered = (item) =>
      frames.some((frame) => (frame.valores ?? []).some((v) => {
        if (typeof v === "string") return at(v) === item;
        if (v && typeof v === "object") {
          const lo = v.min === undefined ? 0 : at(v.min);
          const hi = v.max === undefined ? t.enum.length - 1 : at(v.max);
          return lo <= item && item <= hi;
        }
        return false;
      }));
    return t.enum.every((_, item) => covered(item));
  }

  function emitirCase(sid, k) {
    const s = porId.get(sid);
    const marcos = s.config?.marcos ?? [];
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    const L = (vt) => k.locales.push(vt) - 1;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    // The selector: a Boolean or an integer as an i32, or a string by its handle.
    const sel = L("i32");
    let stringSelector = false;
    // An enum selector travels as its item index (U16) and names its frames by item (DT-049).
    let enumSelector = null;
    // An error cluster selector keeps its code in `sel` and its status here.
    let errorSelector = false;
    const errorStatus = L("i32");
    // Lo que rompe la flecha de Run en LabVIEW: un selector numérico sin Default,
    // uno booleano sin sus dos marcos, o un valor en dos marcos.
    const nombre = s.label?.text ?? s.name;
    const vistos = new Set();
    for (const m of marcos) {
      for (const v of m.valores ?? []) {
        const clave = JSON.stringify(v);
        if (vistos.has(clave)) errores.push({ nodo: sid, motivo: `In "${nombre}", the value ${clave} is in two frames.` });
        vistos.add(clave);
      }
    }
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "case-selector")) {
      const x = contexto(id, k);
      const t = x.tIn(0);
      // An error cluster selects by its status and code (DT-083): No Error when status is F, a warning
      // included, and otherwise the frame whose codes hold the code ("Error 7", "Error .." for any code).
      errorSelector = esError(t);
      if (esCluster(t) && !errorSelector) errores.push({ nodo: sid, motivo: `The selector of "${nombre}" is a cluster: only an error cluster can select a frame.` });
      if (errorSelector && marcos.some((m) => (m.valores ?? []).some((v) => !isErrorFrameValue(v)))) errores.push({ nodo: sid, motivo: "Case Structure: Selector values have wrong type" });
      if (errorSelector && !marcos.some((m) => m.default) && !coversEveryError(marcos)) errores.push({ nodo: sid, motivo: "Case Structure: No case for some selector values" });
      if (t === "boolean" && !(vistos.has("true") && vistos.has("false")) && !marcos.some((m) => m.default)) errores.push({ nodo: sid, motivo: `"${nombre}" needs a True frame and a False frame.` });
      if (t !== "boolean" && !errorSelector && !marcos.some((m) => m.default) && !(esEnum(t) && coversEveryItem(t, marcos))) errores.push({ nodo: sid, motivo: `"${nombre}" needs a Default frame: some selector values have no frame.` });
      if (t === "string" && marcos.some((m) => !m.default && !m.valores?.length)) errores.push({ nodo: sid, motivo: `In "${nombre}", a frame has no selector value.` });
      stringSelector = t === "string";
      enumSelector = esEnum(t) ? t : null;
      c.push(...x.entrada(0));
      if (errorSelector) {
        const cluster = L("i32");
        c.push(ins("local.tee", cluster), ins("i32.load", ERROR_FIELDS.status), ins("local.set", errorStatus), ins("local.get", cluster), ins("i32.load", ERROR_FIELDS.code));
      }
      else if (t !== "boolean" && !stringSelector && !esCluster(t)) c.push(...convertValue(t, "i32"));
      c.push(ins("local.set", sel));
    }
    // A frame value that no longer names an item — a stale name left by deleting the item in
    // Edit Items — breaks the Case, as in LabVIEW; the wire stays whole (measured, DT-049).
    if (enumSelector) {
      const esItem = (name) => enumSelector.enum.includes(name);
      for (const m of marcos) {
        for (const v of m.valores ?? []) {
          const wrongType = typeof v === "string" ? !esItem(v) : v && typeof v === "object" ? (v.min !== undefined && !esItem(v.min)) || (v.max !== undefined && !esItem(v.max)) : true;
          if (wrongType) errores.push({ nodo: sid, motivo: "Case Structure: Selector values have wrong type" });
        }
      }
    }
    // Its input tunnels show their values once the selector has arrived, as the frame starts (measured).
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) c.push(...borderHook(id, "y", valor.get(`${id}.y`).local, k));
    c.push(...frameHook(sid, "start"));
    const salidas = deAqui.filter((x) => porId.get(x).tipo === "case-tunnel-out").map((id) => {
      const x = contexto(id, k);
      const l = L(wasmTypeOf(x.tOut(0)));
      c.push(...constantOf(x.tOut(0), 0), ins("local.set", l));
      return { id, l, x };
    });
    const marco = (m) => {
      emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k);
      for (const t of salidas) {
        if (!llegaA.has(`${t.id}.x-${m}`)) continue;
        c.push(...t.x.entrada(m), ins("local.set", t.l));
      }
    };
    const valorI32 = (v) => (v === true ? 1 : v === false ? 0 : Math.round(v));
    // A string selector compares on the host: equal to a value, or min ≤ selector < max in a range.
    const compareSelectorTo = (text) => [ins("local.get", sel), ins("i32.const", cadena(text)), ins("call", importIndex(s.config?.caseInsensitive ? "cmp_ci" : "cmp"))];
    const stringCondition = (v) => {
      if (typeof v === "string") return [...compareSelectorTo(v), ins("i32.eqz")];
      const bounds = [];
      if (typeof v.min === "string") bounds.push([...compareSelectorTo(v.min), ins("i32.const", 0), ins("i32.ge_s")]);
      if (typeof v.max === "string") bounds.push([...compareSelectorTo(v.max), ins("i32.const", 0), ins("i32.lt_s")]);
      return bounds.length === 2 ? [...bounds.flat(), ins("i32.and")] : bounds.length ? bounds[0] : [ins("i32.const", 1)];
    };
    // An enum value is an item name: it selects by the item's index. A stale name (already
    // reported above) selects nothing.
    const enumIndex = (name) => (name === undefined ? null : enumSelector.enum.indexOf(name));
    const enumCondition = (v) => {
      if (typeof v === "string") {
        const i = enumIndex(v);
        return i >= 0 ? [ins("local.get", sel), ins("i32.const", i), ins("i32.eq")] : [];
      }
      if (v && typeof v === "object") {
        const lo = v.min === undefined ? null : enumIndex(v.min);
        const hi = v.max === undefined ? null : enumIndex(v.max);
        const partes = [];
        if (lo !== null && lo >= 0) partes.push([ins("local.get", sel), ins("i32.const", lo), ins("i32.ge_s")]);
        if (hi !== null && hi >= 0) partes.push([ins("local.get", sel), ins("i32.const", hi), ins("i32.le_s")]);
        return partes.length === 2 ? [...partes.flat(), ins("i32.and")] : partes.length ? partes[0] : [];
      }
      return [];
    };
    // An integer value or range over the code, held only when the status is T; No Error, only when it is F.
    const errorCondition = (v) => {
      if (v?.noError) return [ins("local.get", errorStatus), ins("i32.eqz")];
      const partes = [];
      if (v && typeof v === "object") {
        if (v.min !== undefined && v.min !== null) partes.push([ins("local.get", sel), ins("i32.const", v.min), ins("i32.ge_s")]);
        if (v.max !== undefined && v.max !== null) partes.push([ins("local.get", sel), ins("i32.const", v.max), ins("i32.le_s")]);
      } else partes.push([ins("local.get", sel), ins("i32.const", valorI32(v)), ins("i32.eq")]);
      partes.push([ins("local.get", errorStatus), ins("i32.const", 0), ins("i32.ne")]);
      return [...partes.flat(), ...partes.slice(1).map(() => ins("i32.and"))];
    };
    const condicion = (valores) => {
      // Each value leaves one boolean on the stack, joined with or; a value that matches
      // nothing (a stale enum name) contributes none.
      const trozos = valores
        .map((v) => {
          if (stringSelector) return stringCondition(v);
          if (enumSelector) return enumCondition(v);
          if (errorSelector) return errorCondition(v);
          if (v && typeof v === "object") {
            const partes = [];
            if (v.min !== undefined && v.min !== null) partes.push([ins("local.get", sel), ins("i32.const", v.min), ins("i32.ge_s")]);
            if (v.max !== undefined && v.max !== null) partes.push([ins("local.get", sel), ins("i32.const", v.max), ins("i32.le_s")]);
            return [...partes.flat(), ...(partes.length === 2 ? [ins("i32.and")] : partes.length ? [] : [ins("i32.const", 1)])];
          }
          return [ins("local.get", sel), ins("i32.const", valorI32(v)), ins("i32.eq")];
        })
        .filter((trozo) => trozo.length);
      const r = trozos.flatMap((trozo, j) => (j ? [...trozo, ins("i32.or")] : trozo));
      return r.length ? r : [ins("i32.const", 0)];
    };
    const conValores = marcos.map((m, i) => ({ m, i })).filter(({ m }) => m.valores?.length);
    const porDefecto = marcos.findIndex((m) => m.default);
    // if (marco 0) … else if (marco 1) … else (Default)
    for (const { m, i } of conValores) {
      // Un marco con valores que además es el Default: sus valores van al Default.
      if (i === porDefecto) continue;
      c.push(...condicion(m.valores), ins("if"));
      marco(i);
      c.push(ins("else"));
    }
    if (porDefecto >= 0) marco(porDefecto);
    for (const { i } of conValores) if (i !== porDefecto) c.push(ins("end"));
    c.push(...frameHook(sid, "end"));
    for (const t of salidas) {
      dejar(k, t.id, "y", t.l, wasmTypeOf(t.x.tOut(0)));
      c.push(...borderHook(t.id, "y", t.l, k));
    }
  }

  return { coversEveryItem, emitirCase };
}
