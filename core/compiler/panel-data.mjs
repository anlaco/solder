// What the host needs to read and write a panel value that is not a scalar (DT-063 §10): a cluster's full layout, an
// array's element and dimensions, and whether a value is a DAQ task (DT-087 §7). The keys are read by the runtime.

import { isDaqTask } from "../model/daq-name.mjs";
import { PATH, dimensionsOf, esArray, esCluster } from "../model/types.mjs";
import { arrayElement } from "./memory-ops.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";

/** What the host needs to read and write a compound value of the panel: a cluster's layout or an array's element. */
export function panelData(t) {
  if (esCluster(t)) return { disposicion: fullClusterLayout(t) };
  if (esArray(t)) return { dims: dimensionsOf(t), elemento: { ...arrayElement(t.array), tipo: t.array, ...(esCluster(t.array) ? { disposicion: fullClusterLayout(t.array) } : {}) } };
  return {};
}

/** The panel data of a value of memory type `t` and logical type `logical`: an array of paths says so of its elements. */
export function panelDataOf(t, logical) {
  const data = panelData(t);
  return esArray(logical) && logical.array === PATH ? { ...data, elemento: { ...data.elemento, path: true } } : data;
}

/**
 * What the host needs to know of a DAQ task control or indicator (DT-087 §7): the editor holds a task on the panel as
 * its name alone, so the host writes a control's text as a task with no record (record 0) and reads an indicator's
 * name out of the task wire.
 */
export const taskPanelData = (logicalType) => (isDaqTask(logicalType) ? { task: true } : {});

/** A cluster's layout with those of the clusters inside it, so that the host reads and writes it. */
export function fullClusterLayout(t) {
  const d = clusterLayout(t);
  // A field that is an array carries what the host needs to read it (its element and dimensions).
  return { ...d, campos: d.campos.map((c) => ({ ...c, wasm: wasmTypeOf(c.tipo), ...(esCluster(c.tipo) ? { disposicion: fullClusterLayout(c.tipo) } : {}), ...(esArray(c.tipo) ? { array: panelData(c.tipo) } : {}) })) };
}
