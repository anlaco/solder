// An OVI and its subOVIs, loaded in the page (DT-045 consequence a).
//
// The page cannot read the disk: the main process gives it the text of every
// file the OVI reaches (common/ovi-paths.mjs `readHierarchyTexts`), and this
// module runs `loadHierarchy` on them. The result is the catalog view of the
// OVI being edited, in which the ports of each `subvi` node come from the
// connector of the OVI it calls, and the errors that stop it from running.

import { loadHierarchy } from "../../../core/model/hierarchy.mjs";
import { readPolymorphic } from "../../../core/model/polymorphic.mjs";
import { readTypeDefinition } from "../../../core/model/type-definition.mjs";
import { resolveRelative } from "../common/ovi-paths.mjs";

/**
 * `rootKey`: the path of the OVI, or its untitled key. The root is either
 * `rootGraph`, the graph being edited (it is not read again from text, so
 * unsaved changes count), or `rootText`, a file just opened. `texts` maps the
 * key of every other OVI to its text; `readOVI(text, catalog)` reads one;
 * `oviLibRoot` is the ovi.lib folder that `<ovilib>` paths lead to (DT-073).
 * Returns `{ graph, catalog, errors, keys, typeDefinitions }`: the root OVI, its
 * catalog view, the reasons the hierarchy cannot be compiled, the keys of its
 * subOVIs, and the `.octl` files it follows by key (null when missing, DT-096).
 */
export function buildHierarchy({ rootKey, rootGraph, rootText, texts, baseCatalog, readOVI, oviLibRoot = "" }) {
  const readErrors = [];
  const loadOVI = (key, oviCatalog) => {
    if (key === rootKey) return rootGraph ?? readOVI(rootText, oviCatalog);
    if (!(key in texts)) return null;
    try {
      return readOVI(texts[key], oviCatalog);
    } catch (error) {
      readErrors.push(`${key}: ${error.message}`);
      return null;
    }
  };
  const loadPolymorphic = (key) => {
    if (!(key in texts)) return null;
    try {
      return readPolymorphic(texts[key]);
    } catch (error) {
      readErrors.push(`${key}: ${error.message}`);
      return null;
    }
  };
  // A type definition that cannot be read is reported as LabVIEW reports a missing one (DT-096 §3); so is one that
  // holds no object or several, which nothing can follow (DT-107; what LabVIEW says of it is unverified).
  const loadTypeDefinition = (key) => {
    if (!(key in texts)) return null;
    try {
      const definition = readTypeDefinition(texts[key], baseCatalog);
      return definition.object ? definition : null;
    } catch {
      return null;
    }
  };
  const hierarchy = loadHierarchy(rootKey, baseCatalog, { resolvePath: (callerKey, storedPath) => resolveRelative(callerKey, storedPath, oviLibRoot), loadOVI, loadPolymorphic, loadTypeDefinition });
  const errors = [...hierarchy.errors.map((error) => error.motivo), ...readErrors];
  const root = hierarchy.ovis.get(rootKey);
  return { graph: root.g, catalog: root.cat, errors, keys: [...hierarchy.ovis.keys()].filter((key) => key !== rootKey), typeDefinitions: hierarchy.typeDefinitions };
}
