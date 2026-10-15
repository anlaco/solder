// A VI and the subVIs it calls, loaded together, as LabVIEW loads a statically
// linked subVI with its caller (DT-045).
//
// Pure: it neither reads files nor knows about paths. Whoever loads the
// hierarchy (the command line, the editor) passes two functions:
// - `resolvePath(callerKey, relativePath)`: the key of the VI that a caller
//   refers to with that path (the caller stores it relative to itself).
// - `loadVI(key, cat)`: the diagram of that VI read with `cat`, or `null` if it
//   cannot be found.
// Each VI gets its own view of the catalog, in which the ports of its `subvi`
// nodes come from the connector of the VI they call (spec/03 Rule 4). A subVI
// is loaded the first time its caller needs its ports, which can be while the
// caller itself is being read (its wires end on those ports).

import { conSubVIs } from "./graph.mjs";

/**
 * Loads the hierarchy under `rootKey`. Returns `{ root, vis, errors }`: `vis`
 * maps each key to `{ key, g, cat }` (callees before callers); `errors` lists
 * the VIs that could not be loaded and the recursive cycles, which are not
 * supported yet (DT-045 §4).
 */
export function loadHierarchy(rootKey, baseCatalog, { resolvePath, loadVI }) {
  const vis = new Map();
  const loading = new Set();
  const errors = [];
  const fail = (vi, motivo) => {
    if (!errors.some((e) => e.vi === vi && e.motivo === motivo)) errors.push({ vi, motivo });
  };
  const load = (key, callerKey) => {
    if (vis.has(key)) return vis.get(key);
    if (loading.has(key)) {
      fail(callerKey, `"${key}" calls itself through its callers: recursion needs shared-clone reentrancy, which is not supported yet (DT-045).`);
      return null;
    }
    loading.add(key);
    const cat = conSubVIs(baseCatalog, (relativePath) => load(resolvePath(key, relativePath), key));
    const g = loadVI(key, cat);
    if (!g) {
      loading.delete(key);
      fail(callerKey ?? key, `The VI "${key}" cannot be found.`);
      return null;
    }
    // Subvi nodes whose ports nobody asked for while reading (no wires) are loaded too.
    for (const node of g.nodos.filter((n) => n.tipo === "subvi")) cat.findSubVI(node.config?.vi);
    loading.delete(key);
    const entry = { key, g, cat };
    vis.set(key, entry);
    return entry;
  };
  load(rootKey, null);
  return { root: rootKey, vis, errors };
}
