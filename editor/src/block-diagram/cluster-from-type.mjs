// Create ▸ Control and Create ▸ Indicator on a terminal whose type is a cluster (DT-095 stage d): a panel cluster whose
// elements are panel objects of the cluster's element types, in cluster order, with the element names as their (hidden when
// empty) labels. Measured in LabVIEW 2026 Q3 on a Bundle's output (labview-captures/reports/2026-11-16-cluster-diagram.md Q3:
// "output cluster", 108 x 58 for a DBL and a String, elements with empty labels; the stacking below is that size).
//
// Pure functions over the graph. Where the terminal goes on the diagram is terminal-creation.mjs's.

import * as Gr from "../../../core/model/graph.mjs";
import { blockForTerminal } from "../../../core/model/create-on-terminal.mjs";
import { setClusterElements } from "../../../core/model/user-cluster.mjs";
import { cajaObjeto } from "../front-panel/front-panel.mjs";
import { CLUSTER_MEASURES, canBeElement, elementBlock, elementConfig, withShellBox } from "../front-panel/cluster-panel.mjs";

/**
 * The elements are stacked top to bottom with one pixel between them: a DBL (25 px high) and a String (24) gave a shell 58
 * high, 4 + 25 + 1 + 24 + 4 (report Q3). Unverified for more elements, and for other widths: they are left-aligned.
 */
const ELEMENT_GAP = 1;

/** The panel element that a field of the cluster becomes in a cluster of block `clusterBlock`, at (0, y); undefined for a type that cannot be an element yet. */
function elementOfField(cat, field, clusterBlock, kind, y) {
  const block = blockForTerminal(field.type, kind);
  if (!block || !canBeElement(block.tipo)) return undefined;
  const tipo = elementBlock(block.tipo, clusterBlock);
  const made = Gr.crearEnPanel(Gr.nuevo(), cat, tipo, 0, 0, field.name, elementConfig(block.config, tipo)).g.nodos[0];
  return { tipo, label: { text: field.name }, config: made.config, x: 0, y };
}

/** The elements of a cluster of `type` as panel objects of `kind` ("control" or "indicator"), or undefined when one of its elements has no panel object that can be an element yet (an array, a cluster…). */
export function elementsOfType(cat, type, kind) {
  const clusterBlock = `cluster-${kind}`;
  const elements = [];
  let y = 0;
  for (const field of type.cluster) {
    const element = elementOfField(cat, field, clusterBlock, kind, y);
    if (!element) return undefined;
    elements.push(element);
    y += cajaObjeto(element.tipo, 0, 0, element.config).alto + ELEMENT_GAP;
  }
  return elements;
}

/** The shell that holds `elements` with its bevel round them: as wide as the widest and as high as the stack. */
function shellSizeFor(elements) {
  const bevel = 2 * CLUSTER_MEASURES.bevel;
  if (!elements.length) return { ancho: CLUSTER_MEASURES.width, alto: CLUSTER_MEASURES.height };
  const boxes = elements.map((element) => cajaObjeto(element.tipo, element.x, element.y, element.config));
  return { ancho: Math.max(...boxes.map((box) => box.ancho)) + bevel, alto: Math.max(...boxes.map((box) => box.y + box.alto)) + bevel };
}

/**
 * The cluster `clusterId`, a bare panel cluster made on a terminal of `type`, given its elements and the shell that holds
 * them, its corner kept. Returns `{ g }`, or `{ g, motivo }` when an element's type cannot be an element yet.
 */
export function withElementsOfType(g, cat, clusterId, type, kind) {
  const elements = elementsOfType(cat, type, kind);
  if (!elements) return { g, motivo: `There is no ${kind} for a cluster with these elements yet.` };
  const corner = g.nodos.find((node) => node.id === clusterId).panel;
  const typed = setClusterElements(g, cat, clusterId, elements);
  return { g: withShellBox(typed, clusterId, { x: corner.x, y: corner.y, ...shellSizeFor(elements) }) };
}
