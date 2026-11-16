// The panel's records, the panel objects a Property Node or a control reference links, and what the host needs to run a Property Node or a Call Library Function Node (DT-063 §10, DT-072, DT-080).
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { panelObjectType } from "../model/graph.mjs";
import { PANEL_CONTROLS, RESOURCE_NAME_PANEL_OBJECTS } from "./node-kinds.mjs";
import { panelDataOf, taskPanelData } from "./panel-data.mjs";
import { mechanicalAction } from "./panel-io.mjs";
import { PATH, esCluster, inMemory } from "../model/types.mjs";
import { clusterLayout } from "./wasm-types.mjs";
import { recordBytes, slotBytes } from "./panel-memory.mjs";

export function createPanelRegistry(ovi) {
  const { cat, module, asSubOVI, g, porId, indicadores } = ovi;

  // The panel's records, by node id (DT-063 §10): made when a control or a wired indicator is emitted, or
  // earlier by a Property Node linked to it (DT-072), which may come first and may link an unwired indicator.
  const panelRecords = new Map();
  /** The record of panel object `id`, whose value is of `type` (a chart keeps `historyLength` of them). */
  function panelRecordOf(id, type, historyLength = null) {
    if (!panelRecords.has(id)) {
      const slot = slotBytes(type, esCluster(type) ? clusterLayout(type).tam : undefined);
      panelRecords.set(id, { record: module.bufer(recordBytes(slot, historyLength ?? 1), 8), slot });
    }
    return panelRecords.get(id);
  }
  /** An indicator of the top-level OVI, listed once for the host to walk; returns its record. */
  function registerIndicator(id, type, logicalType, historyLength = null) {
    const { record, slot } = panelRecordOf(id, type, historyLength);
    if (!indicadores.some((indicator) => indicator.nodo === id)) {
      const n = porId.get(id);
      indicadores.push({ nodo: id, name: n.name, tipo: type, record, ...(historyLength && { historyLength, slot }), ...panelDataOf(type, logicalType), ...(RESOURCE_NAME_PANEL_OBJECTS.has(n.tipo) && { resourceName: true }), ...(logicalType === PATH && { path: true }), ...taskPanelData(logicalType) });
    }
    return { record, slot };
  }
  /**
   * The panel control or indicator named `linkName`, as the host reaches it: a control gets its record here, and an
   * unwired indicator is listed so that what a Property Node writes reaches the panel.
   */
  function linkPanelObject(linkName) {
    const node = g.nodos.find((candidate) => candidate.name === linkName);
    if (!node) throw new Error(`The control "${linkName}" this Property Node is linked to is not on the panel.`);
    if (asSubOVI) throw new Error("A Property Node linked to a control of a subOVI cannot run yet.");
    // The object's own type: linkedControlType answers for a Property Node, not for the object it links to.
    const logicalType = panelObjectType(cat, node);
    const type = inMemory(logicalType);
    const isControl = PANEL_CONTROLS.includes(node.tipo);
    if (isControl) panelRecordOf(node.id, type);
    else registerIndicator(node.id, type, logicalType);
    return { nodo: node.id, control: isControl, mecanica: mechanicalAction(cat, node) ?? null, label: node.label?.text ?? "" };
  }
  /** Records what the host needs to run a Property Node and returns its index. */
  function registerPropertyNode(entry) {
    return module.propertyNodes.push({ ...entry, link: entry.link === null ? null : linkPanelObject(entry.link) }) - 1;
  }
  /** Records what the host needs to make a Call Library Function Node's call and returns its index. */
  function registerCallLibrary(entry) {
    return module.callLibraries.push(entry) - 1;
  }
  /** Records the panel control a control reference names and returns the reference's refnum, never 0 (Not A Refnum). */
  function registerControlReference(linkName) {
    return module.controlReferences.push(linkPanelObject(linkName));
  }

  return { panelRecords, panelRecordOf, registerIndicator, linkPanelObject, registerPropertyNode, registerCallLibrary, registerControlReference };
}
