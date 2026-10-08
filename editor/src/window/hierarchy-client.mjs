// A VI and its subVIs, loaded in the page (DT-045 consequence a).
//
// The page cannot read the disk: the main process gives it the text of every
// file the VI reaches (common/vi-paths.mjs `readHierarchyTexts`), and this
// module runs `loadHierarchy` on them. The result is the catalog view of the
// VI being edited, in which the ports of each `subvi` node come from the
// connector of the VI it calls, and the errors that stop it from running.

import { loadHierarchy } from "../../../core/model/hierarchy.mjs";
import { resolveRelative } from "../common/vi-paths.mjs";

/**
 * `rootKey`: the path of the VI, or its untitled key. The root is either
 * `rootGraph`, the graph being edited (it is not read again from text, so
 * unsaved changes count), or `rootText`, a file just opened. `texts` maps the
 * key of every other VI to its text; `readVI(text, catalog)` reads one.
 * Returns `{ graph, catalog, errors, keys }`: the root VI, its catalog view,
 * the reasons the hierarchy cannot be compiled, and the keys of its subVIs.
 */
export function buildHierarchy({ rootKey, rootGraph, rootText, texts, baseCatalog, readVI }) {
  const readErrors = [];
  const loadVI = (key, viCatalog) => {
    if (key === rootKey) return rootGraph ?? readVI(rootText, viCatalog);
    if (!(key in texts)) return null;
    try {
      return readVI(texts[key], viCatalog);
    } catch (error) {
      readErrors.push(`${key}: ${error.message}`);
      return null;
    }
  };
  const hierarchy = loadHierarchy(rootKey, baseCatalog, { resolvePath: resolveRelative, loadVI });
  const errors = [...hierarchy.errors.map((error) => error.motivo), ...readErrors];
  const root = hierarchy.vis.get(rootKey);
  return { graph: root.g, catalog: root.cat, errors, keys: [...hierarchy.vis.keys()].filter((key) => key !== rootKey) };
}
