// The instructions that push a constant of a Solder type, and the error cluster's layout (DT-042, DT-043).
//
// A cluster constant is the module's zero cluster: one block, all zeros and empty strings, that is the default value of
// every cluster. compile-ovi.mjs reserves it once it knows the largest cluster of the OVI, and says where it is with
// `setZeroClusterAddress`; until then it is address 0.

import { ERROR, esArray, esCluster } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { isByReference } from "./memory-ops.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";

let zeroClusterAddress = 0;

/** Where the module being compiled keeps its zero cluster. */
export function setZeroClusterAddress(address) {
  zeroClusterAddress = address;
}

/** The empty array is handle 0, as in LabVIEW. */
const EMPTY_ARRAY_HANDLE = 0;

/** Pushes the constant `value` of type `type`; a cluster is the zero cluster and an array the empty one, whatever `value`. */
export function constantOf(type, value) {
  if (esCluster(type)) return [ins("i32.const", zeroClusterAddress)];
  if (esArray(type)) return [ins("i32.const", EMPTY_ARRAY_HANDLE)];
  const wasmType = wasmTypeOf(type);
  if (wasmType === "f64" || wasmType === "f32") return [ins(`${wasmType}.const`, Number(value))];
  if (wasmType === "i64") return [ins("i64.const", typeof value === "bigint" ? BigInt.asIntN(64, value) : BigInt(Math.trunc(Number(value))))];
  return [ins("i32.const", Number(value) | 0)];
}

/** Where status, code and source lie in an error cluster (DT-043), and its size (`tam`). */
export const ERROR_FIELDS = (() => {
  const fields = clusterLayout(ERROR).campos;
  return { status: fields[0].off, code: fields[1].off, source: fields[2].off, tam: clusterLayout(ERROR).tam };
})();

/**
 * Reads the given fields of the cluster at the node's input, without copying (DT-042): a string or a cluster by its
 * address, a scalar by its value.
 */
export function readClusterFields(node, fields) {
  const cluster = node.temporal("i32");
  const reads = [...node.entrada(0), ins("local.set", cluster)];
  for (const field of fields) {
    if (isByReference(field.tipo)) reads.push(ins("local.get", cluster), ins("i32.const", field.off), ins("i32.add"));
    else reads.push(ins("local.get", cluster), ins(`${wasmTypeOf(field.tipo)}.load`, field.off));
  }
  return reads;
}
