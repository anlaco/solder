// The terminals of Bundle and Unbundle (DT-095 §3, DT-098), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-16-cluster-diagram.md Q3-Q4, 2026-11-17-bundle-unbundle.md Q1-Q4).
//
// Both nodes keep in `config.type` a copy of the type of the cluster wired to them (wired-clusters.mjs refreshes it):
// with it they have one row per element, in cluster order, named by its index, so a wire stays on its row when the
// cluster changes, as LabVIEW keeps it. The copy is also the type their cluster terminal takes, so a wire whose type
// differs from it is broken instead of being read with the wrong layout. Without it, an Unbundle has no rows and a
// Bundle has as many element inputs as it was stretched to, each taking the type wired to it.

/** An unwired Bundle shows two element inputs (2026-11-16 Q3). */
export const BUNDLE_ROWS_DEFAULT = 2;

/** The variable of an unwired Bundle's row `index`: the type wired to that row. */
const rowVariable = (index) => `R${index}`;

/** The name of row `index`, the same for Bundle's inputs and Unbundle's outputs (the names the `.ovi` already stores). */
export const rowPort = (index) => `campo-${index}`;

/** The row index of a port of Bundle or Unbundle, or -1 for its cluster terminals. */
export const rowOfPort = (port) => (port.startsWith("campo-") ? Number(port.slice("campo-".length)) : -1);

/** The elements of the copied cluster type, or undefined when the node has none. */
const copiedFields = (node) => node.config?.type?.cluster;

/** How many element inputs an unwired Bundle shows: as many as it was stretched to. */
export const bundleRowCount = (node) => copiedFields(node)?.length ?? node.config?.rows ?? BUNDLE_ROWS_DEFAULT;

/**
 * Bundle's terminals. Its Context Help reads cluster, element 0, element 1… and output cluster (2026-11-16 Q3). With the
 * top `cluster` wired, every row stands for the element of its index and may stay unwired, the element passing through
 * (2026-11-17 Q3: `3 True yo`). Without it, every row is required (Q2: "Contains unwired or bad terminal") and the
 * output is a cluster of the rows' types in row order, with unnamed elements.
 */
export function bundlePorts(node, dir) {
  const fields = copiedFields(node);
  if (fields) {
    if (dir === "out") return [{ name: "result", label: "output cluster", type: node.config.type }];
    const rows = fields.map((field, index) => ({ name: rowPort(index), label: `element ${index}`, type: field.type, default: 0 }));
    return [{ name: "cluster", label: "cluster", type: node.config.type, default: 0 }, ...rows];
  }
  const variables = Array.from({ length: bundleRowCount(node) }, (_, index) => rowVariable(index));
  if (dir === "out") return [{ name: "result", label: "output cluster", type: { rowsCluster: variables } }];
  const rows = variables.map((variable, index) => ({ name: rowPort(index), label: `element ${index}`, type: { var: variable } }));
  // The unwired top takes the type the rows build, so the node has every type it needs to be compiled; a cluster wired
  // there gives the node its copy (wired-clusters.mjs) and the rows follow it.
  return [{ name: "cluster", label: "cluster", type: { rowsCluster: variables }, default: 0 }, ...rows];
}

/** Unbundle's terminals: the cluster, and one output per element of the copied type, named after the element; none without it. */
export function unbundlePorts(node, dir) {
  const fields = copiedFields(node);
  if (dir === "in") return [{ name: "value", label: "cluster", type: fields ? node.config.type : { clusterOf: "C" } }];
  return (fields ?? []).map((field, index) => ({ name: rowPort(index), label: field.name, type: field.type }));
}

/** The cluster an unwired Bundle builds from the types bound to its rows' variables; undefined while one is unwired. */
export function rowsClusterType(variables, vars) {
  const types = variables.map((variable) => vars[variable]);
  return types.every((type) => type !== undefined) ? { cluster: types.map((type) => ({ name: "", type })) } : undefined;
}
