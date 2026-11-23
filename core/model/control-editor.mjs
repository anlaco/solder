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

/**
 * The graph of the control editor for an `.octl`'s text: `{ kind, g, id, comments }`, `id` the one object's node. Its
 * label and configuration are the file's; a cluster's elements are set as the panel sets them (user-cluster.mjs).
 */
export function controlEditorGraph(text, catalog) {
  const { kind, object, comments } = readTypeDefinition(text, catalog);
  const { elements, ...config } = object.config ?? {};
  const placed = Gr.crearEnPanel(Gr.nuevo(), catalog, object.tipo, object.x, object.y, object.label?.text ?? "", config);
  // The file's label as it is, even empty: crearEnPanel would number a new one ("Numeric 2").
  let g = { ...placed.g, nodos: placed.g.nodos.map((node) => (node.id === placed.id ? { ...node, label: { text: object.label?.text ?? "" } } : node)) };
  // The size the object was saved with (a resized cluster), so that its elements are not clipped by a default shell.
  if (object.w !== undefined) g = { ...g, nodos: g.nodos.map((node) => (node.id === placed.id ? { ...node, panel: { ...node.panel, w: object.w, h: object.h } } : node)) };
  if (elements) g = setClusterElements(g, catalog, placed.id, elements);
  return { kind, g, id: placed.id, comments };
}

/** The one object of the control editor's graph: its first panel object that is not a free label. */
export const editedObjectOf = (g, catalog) => g.nodos.find((node) => node.panel && !isFreeLabel(node) && catalog.bloque(node.tipo)?.panel);

/** The `.octl` text of the control editor's graph `g` as `kind` (the ring's), with the comments it was read with. */
export function controlEditorText(kind, g, catalog, comments) {
  const node = editedObjectOf(g, catalog);
  if (!node) throw new Error("the control editor holds no object");
  return typeDefinitionText(kind, definitionObjectOf(node), comments);
}
