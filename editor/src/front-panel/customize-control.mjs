// Edit ▸ Customize Control... and Advanced ▸ Customize... (DT-107): they open an unlinked copy of the one selected panel
// object in a control editor. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-25-new-custom-control.md Q3):
// the Edit row is enabled with exactly one panel object selected, by its frame, and greyed with a free label or its text
// selected. A pure module over the panel's state.

import { definitionObjectOf, editedObjectsOf } from "../../../core/model/control-editor.mjs";
import { selectedObjects } from "./panel-clipboard.mjs";

/** The one object Customize Control... acts on: the only thing selected, an object a control editor holds; else null. */
export function customizableNode(panel, catalog) {
  if (panel.seleccion.length !== 1 || selectedObjects(panel).length !== 1) return null;
  return editedObjectsOf(panel.g, catalog).find((node) => node.id === panel.seleccion[0]) ?? null;
}

/** What a control editor is opened with for the node `nodeId` of `g`: its `.octl` object, or null for something that is not an object. */
export function customizedObject(g, catalog, nodeId) {
  const node = editedObjectsOf(g, catalog).find((candidate) => candidate.id === nodeId);
  return node ? definitionObjectOf(node) : null;
}
