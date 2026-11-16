// A VI and the subOVIs it calls, loaded together, as LabVIEW loads a statically
// linked subOVI with its caller (DT-045).
//
// Pure: it neither reads files nor knows about paths. Whoever loads the
// hierarchy (the command line, the editor) passes these functions:
// - `resolvePath(callerKey, relativePath)`: the key of the OVI that a caller
//   refers to with that path (the caller stores it relative to itself).
// - `loadOVI(key, cat)`: the diagram of that OVI read with `cat`, or `null` if it
//   cannot be found.
// - `loadPolymorphic(key)`: a polymorphic OVI (`.sdp`, DT-074) read with
//   core/model/polymorphic.mjs `readPolymorphic`, or `null` if it cannot be found.
//   Its instances, resolved relative to the `.sdp`, are loaded with it: Automatic
//   needs all their connectors.
// Each OVI gets its own view of the catalog, in which the ports of its `subvi`
// nodes come from the connector of the OVI they call (spec/03 Rule 4). A subOVI
// is loaded the first time its caller needs its ports, which can be while the
// caller itself is being read (its wires end on those ports).

import { conSubOVIs } from "./graph.mjs";
import { isPolymorphicPath } from "./polymorphic.mjs";

/**
 * Loads the hierarchy under `rootKey`. Returns `{ root, ovis, errors }`: `ovis`
 * maps each key to `{ key, g, cat }` (callees before callers), or for a
 * polymorphic OVI to `{ key, polymorphic, instances }` with each instance's
 * entry (null if it could not be loaded); `errors` lists the OVIs that could not
 * be loaded and the recursive cycles, which are not supported yet (DT-045 §4).
 */
export function loadHierarchy(rootKey, baseCatalog, { resolvePath, loadOVI, loadPolymorphic = () => null }) {
  const ovis = new Map();
  const loading = new Set();
  const errors = [];
  const fail = (vi, motivo) => {
    if (!errors.some((e) => e.vi === vi && e.motivo === motivo)) errors.push({ vi, motivo });
  };
  const loadPolymorphicOVI = (key, callerKey) => {
    const polymorphic = loadPolymorphic(key);
    if (!polymorphic) {
      fail(callerKey ?? key, `The polymorphic OVI "${key}" cannot be found.`);
      return null;
    }
    const instances = polymorphic.instances.map((instance) => load(resolvePath(key, instance.path), key));
    const entry = { key, polymorphic, instances };
    ovis.set(key, entry);
    return entry;
  };
  const load = (key, callerKey) => {
    if (ovis.has(key)) return ovis.get(key);
    if (isPolymorphicPath(key)) return loadPolymorphicOVI(key, callerKey);
    if (loading.has(key)) {
      fail(callerKey, `"${key}" calls itself through its callers: recursion needs shared-clone reentrancy, which is not supported yet (DT-045).`);
      return null;
    }
    loading.add(key);
    const cat = conSubOVIs(baseCatalog, (relativePath) => load(resolvePath(key, relativePath), key));
    const g = loadOVI(key, cat);
    if (!g) {
      loading.delete(key);
      fail(callerKey ?? key, `The OVI "${key}" cannot be found.`);
      return null;
    }
    // Subvi nodes whose ports nobody asked for while reading (no wires) are loaded too.
    for (const node of g.nodos.filter((n) => n.tipo === "subvi")) cat.findSubOVI(node.config?.vi);
    loading.delete(key);
    const entry = { key, g, cat };
    ovis.set(key, entry);
    return entry;
  };
  load(rootKey, null);
  return { root: rootKey, ovis, errors };
}
