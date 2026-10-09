// Copy, cut and paste of a piece of a diagram (spec/05, Edit menu). A copied
// fragment is plain data, so it can be pasted into the same VI or another one.
//
// A pure module: every operation returns new data.

import { borrar, conContenido, etiquetaLibre } from "./graph.mjs";

/**
 * The fragment that copying `ids` takes: those nodes with everything inside
 * the structures among them, and the wires whose two ends are in it. Wires to
 * nodes left out are not copied, so a pasted fragment never has dangling wires.
 */
export function copyFragment(g, ids) {
  const taken = conContenido(g, ids);
  const nodes = g.nodos.filter((n) => taken.has(n.id)).map((n) => structuredClone(n));
  const wires = g.cables.filter((c) => taken.has(c.de.nodo) && taken.has(c.a.nodo)).map((c) => structuredClone(c));
  return { nodes, wires };
}

/** Cut: the fragment, and the diagram without it (its wires to the rest go with it, as with Delete). */
export function cutFragment(g, ids) {
  return { fragment: copyFragment(g, ids), g: borrar(g, ids) };
}

/**
 * Pastes `fragment` into `g`, moved by (dx, dy) on the diagram and by
 * (panelDx, panelDy) on the panel. Every node gets a new id and a new name;
 * a control or indicator gets a free label, numbered as LabVIEW does with a
 * new one ("Numeric 2"). The pasted nodes that were at the top of the fragment
 * go into `scope` (a structure id, or undefined for the VI's diagram). Returns
 * the diagram and the ids of the top pasted nodes, to select them.
 */
export function pasteFragment(g, fragment, { dx = 0, dy = 0, panelDx = dx, panelDy = dy, scope } = {}) {
  let next = g.siguiente;
  const newId = new Map(fragment.nodes.map((n) => [n.id, `n${next++}`]));
  const usedNames = new Set(g.nodos.map((n) => n.name));
  const freeName = (tipo) => {
    let k = 1;
    while (usedNames.has(`${tipo}_${k}`)) k++;
    usedNames.add(`${tipo}_${k}`);
    return `${tipo}_${k}`;
  };
  const isTop = (n) => !newId.has(n.dentro);
  let labelled = g;
  const pastedNodes = fragment.nodes.map((n) => {
    const node = { ...structuredClone(n), id: newId.get(n.id), name: freeName(n.tipo), x: n.x + dx, y: n.y + dy };
    if (isTop(n)) {
      if (scope === undefined) delete node.dentro;
      else node.dentro = scope;
      delete node.marco;
    } else node.dentro = newId.get(n.dentro);
    if (node.config?.par) node.config.par = newId.get(node.config.par);
    if (node.panel) {
      node.panel = { ...node.panel, x: node.panel.x + panelDx, y: node.panel.y + panelDy };
      if (node.label?.text !== undefined) {
        node.label = { ...node.label, text: etiquetaLibre(labelled, baseLabel(node.label.text)) };
        labelled = { ...labelled, nodos: [...labelled.nodos, node] };
      }
    }
    return node;
  });
  const shiftBends = (bends) => bends?.map((value, i) => value + (i % 2 === 0 ? dx : dy));
  const pastedWires = fragment.wires.map((c) => {
    const wire = { ...structuredClone(c), id: `c${next++}`, de: { ...c.de, nodo: newId.get(c.de.nodo) }, a: { ...c.a, nodo: newId.get(c.a.nodo) } };
    if (c.codos) wire.codos = shiftBends(c.codos);
    if (c.union) wire.union = [c.union[0] + dx, c.union[1] + dy];
    return wire;
  });
  return {
    g: { ...g, nodos: [...g.nodos, ...pastedNodes], cables: [...g.cables, ...pastedWires], siguiente: next },
    ids: fragment.nodes.filter(isTop).map((n) => newId.get(n.id)),
  };
}

/** "Numeric 2" → "Numeric": the label a copy is numbered from. */
const baseLabel = (text) => text.replace(/ \d+$/, "");
