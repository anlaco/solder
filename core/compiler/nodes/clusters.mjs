// Programming ▸ Cluster, Class & Variant (DT-042, DT-050, DT-083, DT-095): Bundle writes its elements into a block of
// its own; Unbundle reads them without copying; the By Name nodes do the same for the rows they name; a user's Cluster
// Constant is a constant of the module with its derived type and value.
//
// Each emitter takes the node's emitting context (`node`, compile-ovi's `e`) and returns its instructions.

import { readClusterFields } from "../constants.mjs";
import { ins } from "../instructions.mjs";
import { copyValue, isByReference } from "../memory-ops.mjs";
import { clusterLayout, wasmTypeOf } from "../wasm-types.mjs";

/** Writes the value that input `input` leaves into the field at `address`: a copy of a string, array or cluster, or a store. */
function writeField(node, field, input, address) {
  if (isByReference(field.tipo)) return copyValue(field.tipo, node.entrada(input), address, node.temporal);
  return [ins("i32.const", address), ...node.entrada(input), ins(`${wasmTypeOf(field.tipo)}.store`)];
}

/** Bundle: each element input into its field of a new block. */
export function bundle(node) {
  const layout = clusterLayout(node.tOut(0));
  const block = node.bufer(layout.tam);
  const code = layout.campos.flatMap((field, input) => writeField(node, field, input, block + field.off));
  return [...code, ins("i32.const", block)];
}

/** Unbundle: every field of the cluster wired in. */
export const unbundle = (node) => readClusterFields(node, clusterLayout(node.tIn(0)).campos);

/** The names of a By Name node's rows, in order. */
const namedRows = (node) => (node.nodo.config?.items ?? []).filter((name) => name !== null);

/** Bundle By Name: a copy of the input cluster with each named row's element written over (DT-083). */
export function bundleByName(node) {
  const layout = clusterLayout(node.tIn(0));
  const block = node.bufer(layout.tam);
  const code = copyValue(node.tIn(0), node.entrada(0), block, node.temporal);
  namedRows(node).forEach((name, row) => {
    const field = layout.campos.find((candidate) => candidate.nombre === name);
    code.push(...writeField(node, field, row + 1, block + field.off));
  });
  return [...code, ins("i32.const", block)];
}

/** Unbundle By Name: the same reads as Unbundle, only the named rows and in their order (DT-050). */
export function unbundleByName(node) {
  const fields = clusterLayout(node.tIn(0)).campos;
  return readClusterFields(node, namedRows(node).map((name) => fields.find((field) => field.nombre === name)));
}

/** A user's Cluster Constant (DT-095): its derived type and value, laid out as a constant of the module. */
export const clusterConstant = (node) => [ins("i32.const", node.clusterConstante(node.tOut(0), node.nodo.config?.value ?? {}))];
