// The control editor's panel (DT-104): an `.octl` opened as the graph of a Front Panel that holds its one object, so that
// the Front Panel page edits it with everything it edits a panel object with, and written back from that graph. Measured
// in LabVIEW 2026 Q3: the control editor is a panel with one object, no Block Diagram
// (labview-captures/reports/2026-11-22-control-editor-window.md). Pure, as type-definition.mjs.

import * as Gr from "./graph.mjs";
import { isFreeLabel } from "./free-label.mjs";
import { readTypeDefinition, typeDefinitionText } from "./type-definition.mjs";
import { setClusterElements } from "./user-cluster.mjs";

/** The object Make Type Def. links, as it stands on a panel (a graph node), turned into an `.octl` object. */
export const definitionObjectOf = (node) => ({ tipo: node.tipo, label: node.label ? { text: node.label.text } : undefined, config: node.config, x: node.panel?.x ?? 0, y: node.panel?.y ?? 0, ...sizeOf(node.panel) });

/** The size a panel object was given (its `w` and `h`), or nothing when it has the default one. */
const sizeOf = (panel) => (panel?.w !== undefined && panel?.h !== undefined ? { w: panel.w, h: panel.h } : {});

/** `g` with the object `id` given what the file stores as it is: its label, even empty (crearEnPanel numbers a new one, "Numeric 2"), and its size. */
function withStoredLabelAndSize(g, id, object) {
  const panelOf = (node) => (object.w !== undefined ? { ...node.panel, w: object.w, h: object.h } : node.panel);
  return { ...g, nodos: g.nodos.map((node) => (node.id === id ? { ...node, label: { text: object.label?.text ?? "" }, panel: panelOf(node) } : node)) };
}

/** `g` with one of the file's objects placed on it: its label and configuration are the file's, a cluster's elements set as the panel sets them (user-cluster.mjs). */
function placeObject(g, catalog, object) {
  const { elements, ...config } = object.config ?? {};
  const placed = Gr.crearEnPanel(g, catalog, object.tipo, object.x, object.y, object.label?.text ?? "", config);
  // The size it was saved with (a resized cluster), so that its elements are not clipped by a default shell.
  const stored = withStoredLabelAndSize(placed.g, placed.id, object);
  return elements ? setClusterElements(stored, catalog, placed.id, elements) : stored;
}

/** The graph of the control editor for an `.octl`'s text: `{ kind, g, comments }`, its panel holding the file's objects, none or several (DT-107). */
export function controlEditorGraph(text, catalog) {
  const { kind, objects, comments } = readTypeDefinition(text, catalog);
  const g = objects.reduce((graph, object) => placeObject(graph, catalog, object), Gr.nuevo());
  return { kind, g, comments };
}

/** The objects of the control editor's graph, in its order: its panel objects that are not free labels. */
export const editedObjectsOf = (g, catalog) => g.nodos.filter((node) => node.panel && !node.inside && !isFreeLabel(node) && catalog.bloque(node.tipo)?.panel);

/** The `.octl` text of the control editor's graph `g` as `kind` (the ring's), with the comments it was read with: every object of its panel, or none. */
export const controlEditorText = (kind, g, catalog, comments) => typeDefinitionText(kind, editedObjectsOf(g, catalog).map(definitionObjectOf), comments);
