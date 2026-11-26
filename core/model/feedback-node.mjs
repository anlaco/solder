// The Feedback Node (DT-109): one node in the file and in the editor, two halves for the type resolution and the
// compiler. LabVIEW keeps it in two parts as well (its scripting lists a companion node holding the input terminal), so
// a wire from the node's output back to its own input is not a cycle: the half that gives the stored value has no wire
// before it but its initializer's, and the half that stores the incoming value runs after its input.

export const FEEDBACK_NODE = "feedback-node";
export const FEEDBACK_STORE = "feedback-store";

/** The inputs that belong to the storing half. */
const STORE_PORTS = new Set(["input", "enable"]);

/** The id of the storing half of the Feedback Node `id`. */
export const storeHalfId = (id) => `${id}@store`;

/** The terminal of the original graph that a terminal of the split graph stands for: a store half's are its node's. */
export function terminalOfNode(graph, key) {
  if (!key.includes("@store")) return key;
  const [nodeId, port] = [key.slice(0, key.lastIndexOf(".")), key.slice(key.lastIndexOf(".") + 1)];
  const node = graph.nodos.find((candidate) => candidate.id === nodeId);
  return node?.tipo === FEEDBACK_STORE ? `${node.config.of}.${port}` : key;
}

/**
 * The graph with a `feedback-store` half beside each Feedback Node, in the same structure and frame, and the wires of
 * its `input` and `enable` moved to that half. A graph already split is returned as it is.
 */
export function withFeedbackHalves(graph) {
  const feedbackNodes = graph.nodos.filter((node) => node.tipo === FEEDBACK_NODE);
  const existing = new Set(graph.nodos.map((node) => node.id));
  const toSplit = feedbackNodes.filter((node) => !existing.has(storeHalfId(node.id)));
  if (!toSplit.length) return graph;
  const splitIds = new Set(toSplit.map((node) => node.id));
  const storeHalves = toSplit.map((node) => ({ id: storeHalfId(node.id), tipo: FEEDBACK_STORE, name: `${node.name}@store`, x: node.x, y: node.y, dentro: node.dentro, marco: node.marco, config: { of: node.id } }));
  const movedEnd = (end) => (splitIds.has(end.nodo) && STORE_PORTS.has(end.puerto) ? { ...end, nodo: storeHalfId(end.nodo) } : end);
  return { ...graph, nodos: [...graph.nodos, ...storeHalves], cables: graph.cables.map((wire) => ({ ...wire, a: movedEnd(wire.a) })) };
}

/** The edges that order each store half after its node's first half: dependencies that are not wires. */
export const feedbackOrderEdges = (graph) => graph.nodos.filter((node) => node.tipo === FEEDBACK_STORE).map((node) => [node.config.of, node.id]);

/**
 * The structures of the loops that enclose `node`, innermost first, from its `dentro` outwards: only loops count, as in
 * LabVIEW's Move Initializer One Loop Out.
 */
export function enclosingLoops(graph, node) {
  const byId = new Map(graph.nodos.map((candidate) => [candidate.id, candidate]));
  const loops = [];
  for (let structure = byId.get(node.dentro); structure; structure = byId.get(structure.dentro)) {
    if (structure.tipo === "while-loop" || structure.tipo === "for-loop") loops.push(structure.id);
  }
  return loops;
}

/**
 * The loop whose every start initializes the Feedback Node `node`, or null when it initializes on the first call of a
 * Run (on the node). Moved further out than the loops it is in, it stays on the outermost one (unverified).
 */
export function initializingLoop(graph, node) {
  const loopsOut = Math.max(0, Math.trunc(node.config?.initializerLoopsOut ?? 0));
  if (loopsOut === 0) return null;
  const loops = enclosingLoops(graph, node);
  return loops.length ? loops[Math.min(loopsOut, loops.length) - 1] : null;
}

/** The delay of a Feedback Node: an integer of at least 1; LabVIEW ignores 0 and less (measured, Q3). */
export const feedbackDelay = (node) => Math.max(1, Math.trunc(Number(node.config?.delay ?? 1)) || 1);

/** The type a wire into `terminal` carries, as `resolved` has it, or undefined. */
function typeWiredInto(graph, resolved, nodeId, port) {
  const wire = graph.cables.find((candidate) => candidate.a.nodo === nodeId && candidate.a.puerto === port);
  return wire && resolved.salidas.get(`${wire.de.nodo}.${wire.de.puerto}`);
}

/**
 * The hints of the second pass of the type resolution (as an uninitialized shift register's, DT-041) for the split
 * graph `graph`, from the first pass `resolved`: a Feedback Node with no initializer takes the type that comes into its
 * input; a store half, the type its node gives, so that a wire of another type is coerced or broken there.
 */
export function feedbackTypeHints(graph, resolved) {
  const hints = new Map();
  for (const node of graph.nodos) {
    const hint = node.tipo === FEEDBACK_NODE && !graph.cables.some((wire) => wire.a.nodo === node.id && wire.a.puerto === "initializer")
      ? typeWiredInto(graph, resolved, storeHalfId(node.id), "input")
      : node.tipo === FEEDBACK_STORE ? resolved.salidas.get(`${node.config.of}.output`) : undefined;
    if (hint !== undefined) hints.set(node.id, hint);
  }
  return hints;
}

/** The resolved types of the split graph `graph` with each store half's inputs also under its Feedback Node's terminals. */
export function withNodeTerminals(graph, resolved) {
  const entradas = new Map(resolved.entradas);
  for (const [key, type] of resolved.entradas) entradas.set(terminalOfNode(graph, key), type);
  return { ...resolved, entradas };
}

/** The inputs that have a wire, `node.port`, a store half's counted as its Feedback Node's. */
export function wiredTerminals(graph) {
  const nodeOfStore = new Map(graph.nodos.filter((node) => node.tipo === FEEDBACK_STORE).map((node) => [node.id, node.config.of]));
  return new Set(graph.cables.flatMap((wire) => {
    const own = `${wire.a.nodo}.${wire.a.puerto}`;
    return nodeOfStore.has(wire.a.nodo) ? [own, `${nodeOfStore.get(wire.a.nodo)}.${wire.a.puerto}`] : [own];
  }));
}
