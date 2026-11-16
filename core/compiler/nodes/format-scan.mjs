// Format Into String and Scan From String (spec/04 Rule 21j).
//
// Each argument or output row is a row record (host-rows.mjs). For a string row the bits word holds the cell where Scan
// From String writes the string it read.

import { ERROR } from "../../model/types.mjs";
import { importIndex } from "../host-imports.mjs";
import { ins } from "../instructions.mjs";
import { clusterLayout } from "../wasm-types.mjs";
import { FORMAT_ROW_BYTES, ROW_BITS_OFFSET, readRow, writeRow } from "./host-rows.mjs";

/** The node's rows: those whose port names start with `prefix`, with their index among the inputs. */
const formatRows = (node, prefix) => node.cat.puertos(node.nodo).in.map((port, index) => ({ port, index })).filter(({ port }) => port.name.startsWith(prefix));

/** Format Into String: resulting string and error out (the host writes both). */
export function formatIntoString(node) {
  const rows = formatRows(node, "input-");
  const buffer = node.bufer(rows.length * FORMAT_ROW_BYTES);
  const [result, errorOut] = [node.celda(), node.bufer(clusterLayout(ERROR).tam)];
  const code = rows.flatMap(({ index }, row) => writeRow(node.tIn(index), buffer + row * FORMAT_ROW_BYTES, node.entrada(index)));
  code.push(
    ins("i32.const", result), ...node.entrada(0), ...node.entrada(1), ins("i32.const", buffer), ins("i32.const", rows.length),
    ...node.entrada(2), ins("i32.const", errorOut), ins("i32.const", node.cadena("Format Into String")), ins("i32.const", node.chainIndex), ins("call", importIndex("formatear")),
  );
  return [...code, ins("i32.const", result), ins("i32.const", errorOut)];
}

/** Scan From String: remaining string, offset past scan, error out and one output per row. */
export function scanFromString(node) {
  const rows = formatRows(node, "default-");
  const buffer = node.bufer(rows.length * FORMAT_ROW_BYTES);
  const [remaining, errorOut, offset] = [node.celda(), node.bufer(clusterLayout(ERROR).tam), node.temporal("i32")];
  const code = [];
  rows.forEach(({ index }, row) => {
    const record = buffer + row * FORMAT_ROW_BYTES;
    code.push(...writeRow(node.tIn(index), record, node.entrada(index)));
    if (node.tIn(index) === "string") code.push(ins("i32.const", record), ins("i32.const", node.celda()), ins("i32.store", ROW_BITS_OFFSET));
  });
  code.push(
    ins("i32.const", remaining), ...node.entrada(0), ...node.entrada(1), ...node.entrada(2), ins("i32.const", buffer), ins("i32.const", rows.length),
    ...node.entrada(3), ins("i32.const", errorOut), ins("i32.const", node.cadena("Scan From String")), ins("i32.const", node.chainIndex), ins("call", importIndex("escanear")), ins("local.set", offset),
  );
  return [...code, ins("i32.const", remaining), ins("local.get", offset), ins("i32.const", errorOut), ...rows.flatMap(({ index }, row) => readRow(node.tIn(index), buffer + row * FORMAT_ROW_BYTES))];
}
