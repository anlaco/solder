// The Call Library Function Node (DT-080): an external wait whose host calls the library (core/runtime/call-library.mjs).
// Record 0 is the return value's and record n the n-th parameter's, laid out as a Property Node's rows: a number in
// the value word, written before the call and read after it; a string's or an array's handle in the value word and
// the cell its output goes to in the bits word.

import { callLibraryConfig, callLibraryReturnKind, returnsString, whyCallLibraryCannotRun } from "../../model/call-library.mjs";
import { DAQ_TASK_LAYOUT, isDaqTask } from "../../model/daq-name.mjs";
import { ERROR, esArray, esRefnum } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { i32Const, ins } from "../instructions.mjs";
import { fullClusterLayout, panelData } from "../panel-data.mjs";
import { clusterLayout } from "../wasm-types.mjs";
import { FORMAT_ROW_BYTES, ROW_BITS_OFFSET, ROW_VALUE_OFFSET, readRow, writeRow } from "./host-rows.mjs";

/** A refnum lives in memory as a U32 (DT-072, amendment of 2026-11-03 §2). */
const REFNUM_IN_MEMORY = "u32";

/** A Call Library Function Node: its return value, each parameter's output, the path out and the error out. */
export function callLibrary(node) {
  const config = callLibraryConfig(node.nodo.config);
  const why = whyCallLibraryCannotRun(config);
  if (why) throw new Error(why);
  const { in: inputs, out: outputs } = node.cat.puertos(node.nodo);
  const records = node.bufer((config.parameters.length + 1) * FORMAT_ROW_BYTES);
  const recordAt = (slot) => records + slot * FORMAT_ROW_BYTES;
  const code = [];
  const outputCell = (record) => [i32Const(record), i32Const(node.celda()), ins("i32.store", ROW_BITS_OFFSET)];
  const hostParameters = config.parameters.map((parameter, index) => {
    const input = inputs.findIndex((port) => port.name === `arg-${index}-in`);
    const type = node.tIn(input);
    const record = recordAt(index + 1);
    const minimumSize = parameter["minimum-size"] ? config.parameters.findIndex((other) => other.name === parameter["minimum-size"]) : -1;
    // How a string or an array is passed (a handle or an address, DT-088); the host reads it to build and read the block.
    const format = parameter.type === "string" ? parameter["string-format"] : parameter.type === "array" ? parameter["array-format"] : undefined;
    const described = { type: parameter.type, dataType: parameter["data-type"] ?? "i32", pass: parameter.pass ?? "value", minimumSize, tipo: type, format };
    if (parameter.type === "adapt-to-type" && esRefnum(node.logicalTIn(input))) {
      // A refnum, as the This Application LabVIEW's DAQ VIs wire into lvAppRef: the library gets the address of its
      // 4-byte value, in every format but Interface to Data (measured, reports/2026-11-14-vi-server-reference.md; DT-090).
      code.push(...writeRow(REFNUM_IN_MEMORY, record, node.entrada(input)));
      return { ...described, type: "numeric", dataType: REFNUM_IN_MEMORY, pass: "pointer", tipo: REFNUM_IN_MEMORY };
    }
    if (parameter.type === "adapt-to-type" && !isDaqTask(node.logicalTIn(input))) {
      throw new Error(`The parameter "${parameter.name}" adapts to a type Solder does not pass to a library yet: only a DAQ task or a refnum.`);
    }
    if (isDaqTask(node.logicalTIn(input))) {
      code.push(i32Const(record), ...node.entrada(input), ins("i32.store", ROW_VALUE_OFFSET));
      // Adapt to Type gets a cell with the record and the I/O writes the task it holds afterwards into the output's
      // buffer; a pointer-sized integer gets the task object and passes the wire on (DT-087 §7).
      if (parameter.type === "adapt-to-type") code.push(i32Const(record), i32Const(node.bufer(clusterLayout(DAQ_TASK_LAYOUT).tam)), ins("i32.store", ROW_BITS_OFFSET));
      return { ...described, task: parameter.type === "adapt-to-type" ? "record-cell" : "object", disposicion: fullClusterLayout(DAQ_TASK_LAYOUT) };
    }
    if (parameter.type === "string") {
      code.push(i32Const(record), ...node.entrada(input), ins("i32.store", ROW_VALUE_OFFSET), ...outputCell(record));
      return described;
    }
    if (esArray(type)) {
      code.push(i32Const(record), ...node.entrada(input), ins("i32.store", ROW_VALUE_OFFSET), ...outputCell(record));
      return { ...described, array: panelData(type) };
    }
    code.push(...writeRow(type, record, node.entrada(input)));
    return described;
  });
  const returnValue = config["return-type"];
  const returnKind = callLibraryReturnKind(returnValue);
  if (returnsString(returnKind)) code.push(...outputCell(recordAt(0)));
  const index = node.registerCallLibrary({
    library: config.library,
    specifyPathOnDiagram: config["specify-path-on-diagram"],
    function: config.function,
    uiThread: config.thread === "ui",
    returnKind,
    parameters: hostParameters,
  });
  const pathIn = inputs.findIndex((port) => port.name === "path-in");
  const errorIn = inputs.findIndex((port) => port.name === "error-in");
  const errorOut = node.bufer(clusterLayout(ERROR).tam);
  const path = pathIn >= 0 ? node.temporal("i32") : null;
  code.push(
    i32Const(index), i32Const(records), ...(path === null ? [i32Const(0)] : [...node.entrada(pathIn), ins("local.tee", path)]), ...node.entrada(errorIn), i32Const(errorOut), i32Const(node.chainIndex),
    ins("call", importIndex("call_library")), ins("drop"),
  );
  const leaveOutput = (port) => {
    if (port.name === "error-out") return [i32Const(errorOut)];
    if (port.name === "path-out") return [ins("local.get", path)];
    if (port.name === "return") return returnsString(returnKind) ? [i32Const(recordAt(0)), ins("i32.load", ROW_BITS_OFFSET)] : readRow(port.type, recordAt(0));
    const parameterIndex = Number(port.name.split("-")[1]);
    const parameter = hostParameters[parameterIndex];
    const record = recordAt(parameterIndex + 1);
    if (parameter.type === "string" || parameter.array || parameter.task === "record-cell") return [i32Const(record), ins("i32.load", ROW_BITS_OFFSET)];
    if (parameter.task === "object") return [i32Const(record), ins("i32.load", ROW_VALUE_OFFSET)];
    return readRow(parameter.tipo, record);
  };
  return [...code, ...outputs.flatMap(leaveOutput)];
}
