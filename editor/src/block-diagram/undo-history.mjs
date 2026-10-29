// Undo and redo (spec/05-editor.md rule 42) on the diagram.
//
// Since the graph is never mutated (core/model/graph.mjs), each stable state is a
// snapshot that takes no more space than what changed. A gesture —dragging a
// node or a segment, or typing into a constant— is stored as a single step: the
// window records when the diagram comes to rest, not on every mouse move.
//
// A step may carry a name (the Edit menu says "Undo Change Attribute"); the names are
// kept apart, in `names`, one per snapshot, so a step with no name is just `undefined`.

export const nuevo = (g) => ({ base: g, antes: [], despues: [], names: { base: undefined, antes: [], despues: [] } });

/**
 * El diagrama ha quedado quieto en `g`: si cambió, lo anterior se puede deshacer. `stepName` is what the step that
 * made `g` is called, if it has a name.
 */
export const registrar = (h, g, stepName) =>
  g === h.base
    ? h
    : { base: g, antes: [...h.antes, h.base], despues: [], names: { base: stepName, antes: [...h.names.antes, h.names.base], despues: [] } };

/** The name of the step Ctrl+Z would undo, or nothing if it has none or there is none. */
export const undoName = (h) => (h.antes.length ? h.names.base : undefined);

/** The name of the step Redo would do again, or nothing. */
export const redoName = (h) => (h.despues.length ? h.names.despues[0] : undefined);

/** Ctrl+Z. Devuelve el historial y el diagrama al que se vuelve, o nada si no hay pasos. */
export function deshacer(h) {
  if (!h.antes.length) return null;
  const g = h.antes.at(-1);
  const names = { base: h.names.antes.at(-1), antes: h.names.antes.slice(0, -1), despues: [h.names.base, ...h.names.despues] };
  return { h: { base: g, antes: h.antes.slice(0, -1), despues: [h.base, ...h.despues], names }, g };
}

/** Ctrl+Shift+Z, el atajo de LabVIEW para rehacer. */
export function rehacer(h) {
  if (!h.despues.length) return null;
  const [g, ...resto] = h.despues;
  const [name, ...restNames] = h.names.despues;
  return { h: { base: g, antes: [...h.antes, h.base], despues: resto, names: { base: name, antes: [...h.names.antes, h.names.base], despues: restNames } }, g };
}
