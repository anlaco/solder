// The top-level OVI's panel in shared memory (DT-063 §10): each indicator written into its record and each control read
// from its own, with the record's locks and counters (panel-memory.mjs), so that the diagram never waits for the
// editor.

import { esCluster } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { atomicLoad, atomicStore, copyValueTo, isByReference } from "./memory-ops.mjs";
import { PANEL_RECORD } from "./panel-memory.mjs";
import { callMemory } from "./runtime-functions.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";

/**
 * A Boolean control's mechanical action: the one chosen or, when none is, its style's default (Stop, OK and Cancel come
 * with Latch When Released; checked in LabVIEW 2026 Q3, front-panel/boolean-menu-mechanical-action.png).
 */
export function mechanicalAction(catalog, panelNode) {
  const byDefault = catalog.bloque(panelNode.tipo).config?.mechanical;
  if (!byDefault) return undefined;
  return panelNode.config?.mechanical ?? byDefault["by-style"]?.[panelNode.config?.style] ?? byDefault.value;
}

/**
 * An indicator of the top-level OVI written into its record of the panel (DT-063 §10): the diagram never
 * waits for the editor. A scalar is one atomic store, then its version goes up; a string, array or
 * cluster is copied into the record under the write lock, so the host never reads it half-written. A
 * chart (`historyLength`) writes into the next slot of its ring and counts the write. Returns the code,
 * which takes the value from `value`, into the record at `record` whose values take `slot` bytes each.
 */
export function writeIndicator(record, slot, type, value, temporal, historyLength) {
  const at = (offset) => [ins("i32.const", record + offset)];
  const lock = (name) => [...at(PANEL_RECORD.lock), callMemory(name)];
  const countWrite = [...at(PANEL_RECORD.version), ins("i32.const", 1), ins("i32.atomic.rmw.add"), ins("drop")];
  // A chart's slot for this write: its count modulo the history; any other indicator has one.
  const slotAddress = historyLength
    ? [...at(PANEL_RECORD.version), ins("i32.atomic.load"), ins("i32.const", historyLength), ins("i32.rem_u"), ins("i32.const", slot), ins("i32.mul"), ins("i32.const", record + PANEL_RECORD.value), ins("i32.add")]
    : at(PANEL_RECORD.value);
  const held = temporal(isByReference(type) ? "i32" : wasmTypeOf(type));
  const store = isByReference(type) ? copyValueTo(type, [ins("local.get", held)], slotAddress, temporal) : [...slotAddress, ins("local.get", held), ...atomicStore(wasmTypeOf(type))];
  // A scalar that is not a chart needs no lock: one atomic store is never seen half-written.
  const locked = historyLength || isByReference(type);
  return [...value, ins("local.set", held), ...(locked ? lock("write_lock") : []), ...store, ...countWrite, ...(locked ? lock("write_unlock") : [])];
}

/**
 * A control of the top-level OVI read from its record of the panel (DT-063 §10), where the host writes
 * what the editor sends. A scalar is one atomic load; a Latch is an atomic exchange that leaves FALSE, so
 * only one read sees TRUE, and it counts the release for the host to tell the editor. A string, array or
 * cluster is copied into the node's own buffer under the read lock, as a local variable copies its data.
 */
export function readControl(node) {
  const record = node.controlRecord;
  const type = node.tOut(0);
  const at = (offset) => [ins("i32.const", record + offset)];
  if (!isByReference(type)) {
    if (!mechanicalAction(node.cat, node.nodo)?.startsWith("latch")) return [...at(PANEL_RECORD.value), ...atomicLoad(wasmTypeOf(type))];
    const pressed = node.temporal("i32");
    return [
      ...at(PANEL_RECORD.value), ins("i32.const", 0), ins("i32.atomic.rmw.xchg"), ins("local.tee", pressed),
      ins("if"), ...at(PANEL_RECORD.released), ins("i32.const", 1), ins("i32.atomic.rmw.add"), ins("drop"), ins("end"),
      ins("local.get", pressed),
    ];
  }
  const own = esCluster(type) ? node.bufer(clusterLayout(type).tam) : node.celda();
  const lock = (name) => [...at(PANEL_RECORD.lock), callMemory(name)];
  return [...lock("read_lock"), ...copyValueTo(type, at(PANEL_RECORD.value), [ins("i32.const", own)], node.temporal), ...lock("read_unlock"), ins("i32.const", own)];
}
