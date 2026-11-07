// ovi.lib, Solder's own library of OVIs (DT-073): a folder shipped with Solder whose OVIs a caller names by a
// symbolic path, `<ovilib>/Instr/VISA Configure Serial Port (Instr).sdg`, resolved against the ovi.lib of the
// Solder that opens it, as LabVIEW stores `<vilib>\Utility\error.llb\Clear Errors.vi` (measured,
// labview-captures/reports/2026-11-05-vilib-and-type-polymorphic.md §A). Pure: it works on strings with `/` as the
// separator, so the command line, the main process and the page share it.

/** The root token of a stored path into ovi.lib, as LabVIEW's `<vilib>`. */
export const OVI_LIB_TOKEN = "<ovilib>";

/** What the hierarchy and a subOVI's description add after an OVI of ovi.lib, as LabVIEW adds "(vi.lib)". */
export const OVI_LIB_MARK = "(ovi.lib)";

const withSlashes = (path) => path.replaceAll("\\", "/");
const withoutTrailingSlash = (path) => path.replace(/\/+$/, "");

/** Does a stored path name an OVI of ovi.lib? */
export const isOviLibPath = (storedPath) => withSlashes(storedPath).startsWith(`${OVI_LIB_TOKEN}/`);

/**
 * What `<ovilib>` paths are resolved against: either one folder (a string), or a locator when add-ons bring their
 * own `ovi.lib/` folders (DT-081 §4). A locator is plain data, `{ roots, files }`: `roots` lists the folders, ovi.lib's
 * first, and `files` says for each relative path the position of the root that holds it. The page cannot ask the disk
 * which folder has a file, so the main process builds it once at start-up and the resolving stays pure.
 */
export function buildOviLibLocator(roots, listRelativeFiles) {
  const files = {};
  roots.forEach((root, rootPosition) => {
    for (const relativePath of listRelativeFiles(root)) {
      const key = withSlashes(relativePath);
      if (!Object.hasOwn(files, key)) files[key] = rootPosition; // an earlier root hides a later one's copy
    }
  });
  return { roots: roots.map(withSlashes), files };
}

const isLocator = (oviLib) => typeof oviLib === "object" && oviLib !== null && Array.isArray(oviLib.roots);
const rootsOf = (oviLib) => (isLocator(oviLib) ? oviLib.roots : oviLib ? [oviLib] : []);

/** The folder that holds the file `relativePath` of ovi.lib: the first one if no folder is known to have it. */
function rootHolding(relativePath, oviLib) {
  if (!isLocator(oviLib)) return oviLib;
  const rootPosition = Object.hasOwn(oviLib.files, relativePath) ? oviLib.files[relativePath] : 0;
  return oviLib.roots[rootPosition];
}

/**
 * The absolute path of a stored `<ovilib>/…` path, against `oviLib` (a folder or a locator). With nothing known (a
 * caller that does not know where ovi.lib is) the stored path is returned as it is, so that it is reported as not found.
 */
export function resolveOviLibPath(storedPath, oviLib) {
  if (!oviLib) return storedPath;
  const relativePath = withSlashes(storedPath).slice(OVI_LIB_TOKEN.length + 1);
  return `${withoutTrailingSlash(withSlashes(rootHolding(relativePath, oviLib)))}/${relativePath}`;
}

const rootContaining = (absolutePath, oviLib) =>
  rootsOf(oviLib).find((root) => withSlashes(absolutePath).startsWith(`${withoutTrailingSlash(withSlashes(root))}/`));

/** Does an absolute path lie inside ovi.lib or, with a locator, inside any add-on's ovi.lib folder? */
export function isInOviLib(absolutePath, oviLib) {
  return rootContaining(absolutePath, oviLib) !== undefined;
}

/**
 * The symbolic path a caller stores for an OVI of ovi.lib chosen at `absolutePath`, or null if it is elsewhere, or if
 * that symbolic path would lead to another file (ovi.lib's own copy of the same relative path, or a file the locator
 * does not know).
 */
export function oviLibPathFor(absolutePath, oviLib) {
  const root = rootContaining(absolutePath, oviLib);
  if (root === undefined) return null;
  const symbolic = `${OVI_LIB_TOKEN}/${withSlashes(absolutePath).slice(withoutTrailingSlash(withSlashes(root)).length + 1)}`;
  return resolveOviLibPath(symbolic, oviLib) === withSlashes(absolutePath) ? symbolic : null;
}

/** How the hierarchy names an OVI: its file name, with "(ovi.lib)" after it when it is one of ovi.lib's. */
export function hierarchyName(absolutePath, oviLib) {
  const fileName = withSlashes(absolutePath).split("/").pop();
  return isInOviLib(absolutePath, oviLib) ? `${fileName} ${OVI_LIB_MARK}` : fileName;
}
