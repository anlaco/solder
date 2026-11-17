// A user's cluster as the Front Panel draws it (DT-095): the shell and, inside it, each element as the editor draws that
// kind of control (numeric, Boolean, string), at its place and clipped by the interior.
//
// `drawElement(node)` draws one element as a panel object (front-panel.mjs keeps that drawing); this file only places
// them and their labels. An element's label sits above it, left-aligned, 2 px away, like any control's label.

import * as Et from "../common/labels.mjs";
import * as FL from "../common/free-labels.mjs";
import { elementLabelHtml, clusterHtml } from "./html-controls.mjs";
import { elementNode, interiorBox, shellBox } from "./cluster-panel.mjs";
import { reorderFramesHtml } from "./cluster-reorder-view.mjs";

/** The gap between an element's label and its box, unless its kind keeps another (a Boolean's is 4 px). */
const ELEMENT_LABEL_GAP = 2;

/** An element's label box inside the interior: above the element, left-aligned with its value box. */
function elementLabelBox(node, box, measure) {
  const size = Et.tamano(node.label?.text ?? "", measure);
  return { x: box.x + (box.casilla ?? 0), y: box.y - size.alto - (box.separacion ?? ELEMENT_LABEL_GAP), ancho: size.ancho, alto: size.alto };
}

/** The elements of a cluster, drawn in cluster order (later ones over earlier ones where they overlap). */
function elementsHtml(cluster, { drawElement, boxOf, measure, value }) {
  return cluster.config.elements
    .map((element, index) => {
      const node = elementNode(cluster, element, index);
      const withRunValue = value(cluster, node, index);
      const label = node.label?.text ? elementLabelHtml(node.label.text, elementLabelBox(node, boxOf(node), measure)) : "";
      return drawElement(withRunValue) + label;
    })
    .join("");
}

/** In reorder mode, the frames and badges over the elements; otherwise nothing. */
function reorderHtml(cluster, { boxOf, measure, reorder }) {
  if (reorder?.cluster !== cluster.id) return "";
  return reorderFramesHtml(cluster, reorder, (index) => {
    const node = elementNode(cluster, cluster.config.elements[index], index);
    const box = boxOf(node);
    const element = { x: box.x, y: box.y, ancho: box.ancho, alto: box.alto };
    return { element, label: node.label?.text ? elementLabelBox(node, box, measure) : null };
  });
}

/**
 * The cluster's HTML. `frame`: as the other objects'; `tools`: `drawElement(node)`, `boxOf(node)` (an element's box
 * from its place), `measure` (the text measure), `value(cluster, node, index)` (element `index` as it holds its value now) and
 * `reorder`, the panel's Reorder Controls In Cluster state, if any (cluster-reorder.mjs).
 */
export function clusterObject(cluster, frame, tools) {
  const box = shellBox(cluster);
  const interior = interiorBox({ x: 0, y: 0, ancho: box.ancho, alto: box.alto });
  const handles = frame.selected ? FL.handlesHtml(cluster, box, { shown: true, attribute: "data-asa-cluster" }) : "";
  return clusterHtml({ ...frame, box: { ...box, casilla: 0 } }, { interior, elementsHtml: elementsHtml(cluster, tools) + reorderHtml(cluster, tools), handles });
}

