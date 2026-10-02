// Undo and redo (spec/05-editor.md rule 42) on the diagram.
//
// Since the graph is never mutated (core/model/graph.mjs), each stable state is a
// snapshot that takes no more space than what changed. A gesture —dragging a
// node or a segment, or typing into a constant— is stored as a single step: the
// window records when the diagram comes to rest, not on every mouse move.

export const nuevo = (g) => ({ base: g, antes: [], despues: [] });

/** El diagrama ha quedado quieto en `g`: si cambió, lo anterior se puede deshacer. */
export const registrar = (h, g) => (g === h.base ? h : { base: g, antes: [...h.antes, h.base], despues: [] });

/** Ctrl+Z. Devuelve el historial y el diagrama al que se vuelve, o nada si no hay pasos. */
export function deshacer(h) {
  if (!h.antes.length) return null;
  const g = h.antes.at(-1);
  return { h: { base: g, antes: h.antes.slice(0, -1), despues: [h.base, ...h.despues] }, g };
}

/** Ctrl+Shift+Z, el atajo de LabVIEW para rehacer. */
export function rehacer(h) {
  if (!h.despues.length) return null;
  const [g, ...resto] = h.despues;
  return { h: { base: g, antes: [...h.antes, h.base], despues: resto }, g };
}
