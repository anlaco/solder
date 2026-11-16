// The instructions that move values in linear memory (DT-042, DT-044): atomic loads and stores, array elements and
// their sizes, reserving an array's block, and copying strings, clusters and arrays into places of their own.

import { NUMERICOS, dimensionsOf, esArray, esCluster, representacion } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { callMemory } from "./runtime-functions.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";

/** Loads a value of WebAssembly type `wasmType` from the address on the stack, in one atomic load. */
export function atomicLoad(wasmType) {
  if (wasmType === "f64") return [ins("i64.atomic.load"), ins("f64.reinterpret_i64")];
  if (wasmType === "f32") return [ins("i32.atomic.load"), ins("f32.reinterpret_i32")];
  return [ins(`${wasmType}.atomic.load`)];
}

/** Stores the value of WebAssembly type `wasmType` on the stack at the address under it, in one atomic store. */
export function atomicStore(wasmType) {
  if (wasmType === "f64") return [ins("i64.reinterpret_f64"), ins("i64.atomic.store")];
  if (wasmType === "f32") return [ins("i32.reinterpret_f32"), ins("i32.atomic.store")];
  return [ins(`${wasmType}.atomic.store`)];
}

/** The address of the null handle: a cell that always holds 0, the empty string or array. */
export const NULL_HANDLE = 0;

/**
 * Copies a row of `length` elements of type `t` from the address in the local
 * `source` to the one in `target`, in a row `width` elements wide: what does
 * not fit is left out and what is missing gets the default value, which for an
 * element by reference is copied from `defaultSource`.
 */
export function copyRow(t, source, length, target, width, defaultSource, temporal) {
  const element = arrayElement(t);
  const g = (local) => ins("local.get", local);
  const copied = temporal("i32");
  const code = [g(length), g(width), g(length), g(width), ins("i32.lt_s"), ins("select"), ins("local.set", copied)];
  if (!element.ref) {
    return [
      ...code,
      g(target), g(source), g(copied), ins("i32.const", element.tam), ins("i32.mul"), ins("memory.copy"),
      g(target), g(copied), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add"),
      ins("i32.const", 0), g(width), g(copied), ins("i32.sub"), ins("i32.const", element.tam), ins("i32.mul"), ins("memory.fill"),
    ];
  }
  const [k, from, to] = [temporal("i32"), temporal("i32"), temporal("i32")];
  const at = (base) => [g(base), g(k), ins("i32.const", element.tam), ins("i32.mul"), ins("i32.add")];
  return [
    ...code,
    ins("i32.const", 0), ins("local.set", k), ins("block"), ins("loop"), g(k), g(width), ins("i32.ge_s"), ins("br_if", 1),
    ...at(target), ins("local.set", to),
    g(k), g(copied), ins("i32.lt_s"),
    ins("if"), ...at(source), ins("local.set", from), ins("else"), ins("i32.const", defaultSource), ins("local.set", from), ins("end"),
    ...copyElement(t, from, to, temporal),
    g(k), ins("i32.const", 1), ins("i32.add"), ins("local.set", k), ins("br", 0), ins("end"), ins("end"),
  ];
}

/** Copies the element of type `t` at the address in the local `from` to the one in the local `to`. */
export function copyElement(t, from, to, temporal) {
  const element = arrayElement(t);
  if (element.ref) return copyValueTo(t, [ins("local.get", from)], [ins("local.get", to)], temporal);
  return [ins("local.get", to), ins("local.get", from), ins("i32.const", element.tam), ins("memory.copy")];
}

/** Does a value of this type live by reference, in a cell or a block: a string, a cluster or an array? */
export const isByReference = (t) => t === "string" || esCluster(t) || esArray(t);

/**
 * How an array's element is stored (DT-042): its size (`tam`) and how it is loaded (`carga`) and stored (`guarda`).
 * An element that is a string, a cluster or an array goes by reference (`ref`): its address inside the array is its
 * handle. The keys are read by the host, so they stay.
 */
export function arrayElement(t) {
  if (isByReference(t)) return { tam: esCluster(t) ? clusterLayout(t).tam : 4, ref: true };
  if (t === "boolean") return { tam: 1, carga: "i32.load8_u", guarda: "i32.store8" };
  const r = representacion(t);
  const n = NUMERICOS[r];
  if (!n.entero) return n.bits === 32 ? { tam: 4, carga: "f32.load", guarda: "f32.store" } : { tam: 8, carga: "f64.load", guarda: "f64.store" };
  if (n.bits === 64) return { tam: 8, carga: "i64.load", guarda: "i64.store" };
  if (n.bits === 32) return { tam: 4, carga: "i32.load", guarda: "i32.store" };
  if (n.bits === 16) return { tam: 2, carga: n.signo ? "i32.load16_s" : "i32.load16_u", guarda: "i32.store16" };
  return { tam: 1, carga: n.signo ? "i32.load8_s" : "i32.load8_u", guarda: "i32.store8" };
}

/**
 * An array block is `[size of each dimension I32][padding][elements]` (DT-044).
 * With one or two dimensions the header is 8 bytes, so `datos8` finds the
 * elements of both; more dimensions are not compiled yet.
 */
export const MAX_COMPILED_DIMENSIONS = 2;
export const SECOND_SIZE_OFFSET = 4;
export const ARRAY_HEADER_BYTES = 8;

/** Leaves the number of elements of the array in the local `handle`: the product of its sizes, 0 when it is empty. */
export function elementCount(t, handle, temporal) {
  if (dimensionsOf(t) === 1) return [ins("local.get", handle), callMemory("longitud")];
  const block = temporal("i32");
  return [
    ins("local.get", handle), ins("i32.load"), ins("local.tee", block), ins("i32.load"),
    ins("local.get", block), ins("i32.load", SECOND_SIZE_OFFSET), ins("i32.mul"),
    ins("i32.const", 0), ins("local.get", block), ins("select"),
  ];
}

/** Leaves size `dimension` (0 the rows, 1 the columns) of the array in the local `handle`; 0 when it is empty. */
export function dimensionSize(handle, dimension, temporal) {
  const block = temporal("i32");
  return [
    ins("local.get", handle), ins("i32.load"), ins("local.tee", block), ins("i32.load", dimension * SECOND_SIZE_OFFSET),
    ins("i32.const", 0), ins("local.get", block), ins("select"),
  ];
}

/**
 * Makes the block of `cell` an array of type `t` with the sizes held in the
 * locals `sizes` and leaves where its elements start, like `nuevo_array`. For
 * two dimensions, the old header is first turned into an element count, which
 * is what `nuevo_array` reads to know which elements are new.
 */
export function reserveArray(t, cell, sizes, temporal) {
  return reserveArrayAt(t, [ins("i32.const", cell)], sizes, temporal);
}

/** Like reserveArray, with the cell left on the stack by the instructions `cell`. */
export function reserveArrayAt(t, cell, sizes, temporal) {
  const element = arrayElement(t.array);
  const g = (local) => ins("local.get", local);
  const allocate = (count) => [...cell, ...count, ins("i32.const", element.tam), ins("i32.const", element.ref ? 1 : 0), callMemory("nuevo_array")];
  if (dimensionsOf(t) === 1) return allocate([g(sizes[0])]);
  const [block, data] = [temporal("i32"), temporal("i32")];
  return [
    ...cell, ins("i32.load"), ins("local.tee", block),
    ins("if"), g(block), g(block), ins("i32.load"), g(block), ins("i32.load", SECOND_SIZE_OFFSET), ins("i32.mul"), ins("i32.store"), ins("end"),
    ...allocate([g(sizes[0]), g(sizes[1]), ins("i32.mul")]), ins("local.tee", data),
    ins("i32.const", ARRAY_HEADER_BYTES), ins("i32.sub"), ins("local.tee", block), g(sizes[0]), ins("i32.store"),
    g(block), g(sizes[1]), ins("i32.store", SECOND_SIZE_OFFSET),
    g(data),
  ];
}

/** The element of type `t` at the address that `dir` leaves: its value or, by reference, that address. */
export const loadElement = (t, dir) => (arrayElement(t).ref ? dir : [...dir, ins(arrayElement(t).carga)]);

/**
 * Copies the value of type `t` that `source` leaves on the stack (a handle or a cluster's address) to `target`, a fixed
 * address: a string into its cell; a cluster field by field, with its strings copied. It is how a node keeps a value of
 * its own, as a shift register or a Bundle does (DT-042).
 */
export function copyValue(t, origen, destino, temporal) {
  return copyValueTo(t, origen, [ins("i32.const", destino)], temporal);
}

/** Like copyValue, with the target computed: `target` are the instructions that leave its address. */
export function copyValueTo(t, origen, destino, temporal) {
  if (t === "string") return [...origen, ...destino, callMemory("copiar")];
  const [de, a] = [temporal("i32"), temporal("i32")];
  const r = [...origen, ins("local.set", de), ...destino, ins("local.set", a)];
  const g = (l) => ins("local.get", l);
  if (esArray(t)) {
    // The elements into the target cell's block: at once or, when they go by reference, one by one.
    const e = arrayElement(t.array);
    const [n, od, dd, i] = [temporal("i32"), temporal("i32"), temporal("i32"), temporal("i32")];
    const sizes = Array.from({ length: dimensionsOf(t) }, () => temporal("i32"));
    sizes.forEach((size, dimension) => r.push(...dimensionSize(de, dimension, temporal), ins("local.set", size)));
    r.push(...elementCount(t, de, temporal), ins("local.set", n), g(de), callMemory("datos8"), ins("local.set", od));
    r.push(...reserveArrayAt(t, [g(a)], sizes, temporal), ins("local.set", dd));
    if (!e.ref) r.push(g(dd), g(od), g(n), ins("i32.const", e.tam), ins("i32.mul"), ins("memory.copy"));
    else {
      const paso = (l) => [g(l), g(i), ins("i32.const", e.tam), ins("i32.mul"), ins("i32.add")];
      r.push(ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
        ...copyValueTo(t.array, paso(od), paso(dd), temporal),
        g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"));
    }
    return r;
  }
  for (const c of clusterLayout(t).campos) {
    const sitio = (l) => [g(l), ins("i32.const", c.off), ins("i32.add")];
    if (isByReference(c.tipo)) r.push(...copyValueTo(c.tipo, sitio(de), sitio(a), temporal));
    else {
      const vt = wasmTypeOf(c.tipo);
      r.push(g(a), g(de), ins(`${vt}.load`, c.off), ins(`${vt}.store`, c.off));
    }
  }
  return r;
}

/** Stores at the address that `dir` leaves the element of type `t` that `valor` leaves. */
export function storeElement(t, dir, valor, temporal) {
  const e = arrayElement(t);
  return e.ref ? copyValueTo(t, valor, dir, temporal) : [...dir, ...valor, ins(e.guarda)];
}
