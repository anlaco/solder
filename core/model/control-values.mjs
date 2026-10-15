// The value each control starts a Run with: the value saved on the panel, or the
// empty value of its type when it has none. The editor, the command line and the
// tests all start a VI the same way.

/** The error cluster with no error: what an unwired `error in` carries. */
export const NO_ERROR = Object.freeze({ status: false, code: 0, source: "" });

const EMPTY_VALUE_BY_CONTROL = { "str-control": "", "cluster-control": NO_ERROR, "arr-control": [] };

/** The value the control `node` starts with. */
export const startValue = (node) => node.config?.value ?? EMPTY_VALUE_BY_CONTROL[node.tipo] ?? 0;
