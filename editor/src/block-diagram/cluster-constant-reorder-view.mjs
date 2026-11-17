// Reorder Controls In Cluster... on the Block Diagram (DT-095 stage c2), drawn as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-cluster-constant-elements.md Q5, local evidence never committed): the diagram goes
// dark (#666666 where it was white), the cluster stays white and undarkened with its elements in colour, and each element
// has the frame and badge the panel's mode draws, with a 3 px bar in the colour of its type on top of the badge. The
// mode itself (the order, the field, ✓ and ✗) is front-panel/cluster-reorder.mjs.

import { elementType } from "../../../core/model/user-cluster.mjs";
import { aspecto } from "../../../core/model/types.mjs";
import { reorderFramesHtml } from "../front-panel/cluster-reorder-view.mjs";
import { clusterBox, elementNode, interiorBox } from "./cluster-constant-geometry.mjs";

/** Far larger than any diagram, so that the dark layer covers whatever the canvas shows however it is scrolled. */
const DARK_LAYER_REACH = 100000;

const px = (value) => `${value}px`;

/** The darkening of everything that is not the cluster; the colour is a theme token (`--reorder-diagram-darkening`). */
const darkLayer = () =>
  `<div class="cc-reorder-dark" style="left:${px(-DARK_LAYER_REACH / 2)};top:${px(-DARK_LAYER_REACH / 2)};width:${px(DARK_LAYER_REACH)};height:${px(DARK_LAYER_REACH)}"></div>`;

/**
 * The layers over the diagram while cluster `reorder.cluster` is reordered: the dark layer, the cluster drawn again over
 * it, and the elements' frames clipped by its interior. `drawNode(node)` is the diagram's own drawing of a node, `boxOf(node)`
 * its box; `cat` resolves the type of each element, whose colour is the bar's.
 */
export function reorderLayerHtml(g, reorder, { cat, drawNode, boxOf }) {
  const cluster = g.nodos.find((node) => node.id === reorder.cluster);
  if (!cluster) return "";
  const interior = interiorBox(clusterBox(cluster));
  const origin = { x: interior.x, y: interior.y };
  const frames = reorderFramesHtml(cluster, reorder, (index) => {
    const element = cluster.config.elements[index];
    const box = boxOf(elementNode(cluster, element, index, origin));
    return { element: { x: box.x - origin.x, y: box.y - origin.y, ancho: box.ancho, alto: box.alto }, label: null, barColor: aspecto(elementType(cat, element)).color };
  });
  const clip = `left:${px(interior.x)};top:${px(interior.y)};width:${px(interior.ancho)};height:${px(interior.alto)}`;
  return `${darkLayer()}${drawNode(cluster)}<div class="cc-reorder-frames" style="${clip}">${frames}</div>`;
}
