// Instrument I/O ▸ VISA (DT-065 §4, DT-066): each function parks its clump while the Run's coordinator talks to the
// instrument (core/runtime/instrument-io.mjs), which writes the outputs into their places.

import { ERROR, VISA_RESOURCE_LAYOUT } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { ins } from "../instructions.mjs";
import { clusterLayout } from "../wasm-types.mjs";

/**
 * A VISA function (DT-066): `inputs` are the indices of what goes to the host before the error in (the
 * resource name and the function's own value), then the error in. Its outputs get
 * places of their own, the host writes them while the clump is parked, and they are left on the stack in
 * the catalog's order: resource name out, read buffer, return count, error out.
 */
export function visaFunction(node, importName, inputs, { resourceOut, buffer, count }) {
  const places = {
    resourceOut: resourceOut ? node.bufer(clusterLayout(VISA_RESOURCE_LAYOUT).tam) : null,
    buffer: buffer ? node.celda() : null,
    count: count ? node.bufer(4) : null,
    errorOut: node.bufer(clusterLayout(ERROR).tam),
  };
  const errorIn = node.cat.puertos(node.nodo).in.findIndex((port) => port.name === "error-in");
  const addresses = [places.resourceOut, places.buffer, places.count, places.errorOut].filter((place) => place !== null);
  const outputs = [
    ...(resourceOut ? [ins("i32.const", places.resourceOut)] : []),
    ...(buffer ? [ins("i32.const", places.buffer)] : []),
    ...(count ? [ins("i32.const", places.count), ins("i32.load")] : []),
    ins("i32.const", places.errorOut),
  ];
  return [
    ...inputs.flatMap((index) => node.entrada(index)), ...node.entrada(errorIn),
    ...addresses.map((address) => ins("i32.const", address)), ins("i32.const", node.chainIndex),
    ins("call", importIndex(importName)), ins("drop"),
    ...outputs,
  ];
}
