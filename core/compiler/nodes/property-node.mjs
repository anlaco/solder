// The Property Node (DT-072).
//
// Each row is a record of FORMAT_ROW_BYTES, as Format Into String's: a write row's value is written into it
// before the call, and the host writes a read row's value into it, a string into the cell the record's bits
// word names. A cluster (Position, Bounds) goes by address: a write row's record holds the cluster wired in, a
// read row's the node's own buffer, which the host fills. The host runs the rows top to bottom with LabVIEW's rules
// (core/runtime/property-node.mjs).

import { ERROR, VISA_RESOURCE_LAYOUT, esCluster } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { i32Const, ins } from "../instructions.mjs";
import { fullClusterLayout } from "../panel-data.mjs";
import { clusterLayout } from "../wasm-types.mjs";
import { FORMAT_ROW_BYTES, ROW_BITS_OFFSET, ROW_VALUE_OFFSET, readRow, writeRow } from "./host-rows.mjs";

/** A Property Node: its read rows, in order, and its error out. */
export function propertyNode(node) {
  const { class: className, link = null, rows = [], "ignore-errors": ignoreErrors = false } = node.nodo.config ?? {};
  const { in: inputs, out: outputs } = node.cat.puertos(node.nodo);
  const buffer = node.bufer(Math.max(1, rows.length) * FORMAT_ROW_BYTES);
  const errorOut = node.bufer(clusterLayout(ERROR).tam);
  const code = [];
  const rowRecord = (row) => buffer + row * FORMAT_ROW_BYTES;
  const hostRows = rows.map((row, index) => {
    const property = node.cat.properties?.find(className, row.property);
    if (!property?.done) throw new Error(`The property "${row.property}" of the Property Node cannot run yet.`);
    const portName = `row-${index}`;
    const layout = (type) => (esCluster(type) ? { disposicion: fullClusterLayout(type) } : {});
    if (row.write) {
      const input = inputs.findIndex((port) => port.name === portName);
      const type = node.tIn(input);
      code.push(...(esCluster(type) ? [i32Const(rowRecord(index)), ...node.entrada(input), ins("i32.store", ROW_VALUE_OFFSET)] : writeRow(type, rowRecord(index), node.entrada(input))));
      return { property: row.property, write: true, tipo: type, ...layout(type) };
    }
    const type = node.tOut(outputs.findIndex((port) => port.name === portName));
    if (type === "string") code.push(i32Const(rowRecord(index)), i32Const(node.celda()), ins("i32.store", ROW_BITS_OFFSET));
    if (esCluster(type)) code.push(i32Const(rowRecord(index)), i32Const(node.bufer(clusterLayout(type).tam)), ins("i32.store", ROW_VALUE_OFFSET));
    return { property: row.property, write: false, tipo: type, ...layout(type) };
  });
  const index = node.registerPropertyNode({ class: className, link, rows: hostRows, ignoreErrors });
  const errorIn = inputs.findIndex((port) => port.name === "error-in");
  const referenceIn = inputs.findIndex((port) => port.name === "reference");
  // An Instr node's reference out is a VISA resource name the host fills; a control reference's is the refnum wired
  // in, passed on as it came.
  const isInstr = className === "Instr";
  const referenceOut = referenceIn >= 0 && isInstr ? node.bufer(clusterLayout(VISA_RESOURCE_LAYOUT).tam) : 0;
  const controlRefnum = referenceIn >= 0 && !isInstr ? node.temporal("i32") : null;
  const reference = referenceIn < 0 ? [i32Const(0)] : controlRefnum === null ? node.entrada(referenceIn) : [...node.entrada(referenceIn), ins("local.tee", controlRefnum)];
  code.push(
    i32Const(index), i32Const(buffer), ...reference, ...node.entrada(errorIn), i32Const(referenceOut), i32Const(errorOut), i32Const(node.chainIndex),
    ins("call", importIndex("property_node")), ins("drop"),
  );
  const leaveOutput = (port) => {
    if (port.name === "error-out") return [i32Const(errorOut)];
    if (port.name === "reference-out") return controlRefnum === null ? [i32Const(referenceOut)] : [ins("local.get", controlRefnum)];
    const row = Number(port.name.slice("row-".length));
    if (esCluster(hostRows[row].tipo)) return [i32Const(rowRecord(row)), ins("i32.load", ROW_VALUE_OFFSET)];
    return readRow(hostRows[row].tipo, rowRecord(row));
  };
  return [...code, ...outputs.flatMap(leaveOutput)];
}
