// The values of the front-panel controls (DT-053). Each control has a default
// value, `config.value`, which is what the file saves, and a current value,
// `currentValue`, which typing into it or operating it changes and which the
// file never saves; without one, the current value is the default. The editor,
// the command line and the tests all start a VI from the current values.

/** The error cluster with no error: what an unwired `error in` carries. */
export const NO_ERROR = Object.freeze({ status: false, code: 0, source: "" });

const EMPTY_VALUE_BY_CONTROL = { "str-control": "", "cluster-control": NO_ERROR, "arr-control": [] };

const CONTROL_TYPES = new Set(["control", "bool-control", "str-control", "cluster-control", "arr-control"]);

/** Is this node a control of the front panel? */
export const isControl = (node) => CONTROL_TYPES.has(node.tipo);

/** The value the control `node` saves: its default, or the empty value of its type when it has none. */
export const defaultValue = (node) => node.config?.value ?? EMPTY_VALUE_BY_CONTROL[node.tipo] ?? 0;

/** The value the control `node` holds now, and starts a Run with. */
export const startValue = (node) => (hasCurrentValue(node) ? node.currentValue : defaultValue(node));

/** Has the panel object a current value apart from its default? */
export const hasCurrentValue = (node) => node.currentValue !== undefined;

/** The value a panel object holds now, as stored: its current value, or its default (`undefined` when it has none). */
export const currentValue = (node) => (hasCurrentValue(node) ? node.currentValue : node.config?.value);

const changeNodes = (graph, shouldChange, change) => {
  const changed = graph.nodos.map((node) => (shouldChange(node) ? change(node) : node));
  return changed.every((node, index) => node === graph.nodos[index]) ? graph : { ...graph, nodos: changed };
};

const withoutCurrentValue = ({ currentValue, ...node }) => node;

/** Typing into the panel object `id` or operating it: only its current value changes. */
export const setCurrentValue = (graph, id, value) => changeNodes(graph, (node) => node.id === id, (node) => ({ ...node, currentValue: value }));

/**
 * Make Current Value(s) Default: the current value of each panel object in
 * `ids` (all of them when omitted) becomes its default, the one the file saves.
 */
export const makeCurrentValuesDefault = (graph, ids) =>
  changeNodes(
    graph,
    (node) => hasCurrentValue(node) && (!ids || ids.includes(node.id)),
    (node) => withoutCurrentValue({ ...node, config: { ...node.config, value: node.currentValue } }),
  );

/** Reinitialize (Values) to Default: each panel object in `ids` (all of them when omitted) goes back to its default. */
export const reinitializeToDefault = (graph, ids) =>
  changeNodes(graph, (node) => hasCurrentValue(node) && (!ids || ids.includes(node.id)), withoutCurrentValue);
