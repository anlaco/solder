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
 * The absolute path of a stored `<ovilib>/…` path, against the folder `oviLibRoot`. With no root (a caller that
 * does not know where ovi.lib is) the stored path is returned as it is, so that it is reported as not found.
 */
export function resolveOviLibPath(storedPath, oviLibRoot) {
  if (!oviLibRoot) return storedPath;
  return `${withoutTrailingSlash(withSlashes(oviLibRoot))}/${withSlashes(storedPath).slice(OVI_LIB_TOKEN.length + 1)}`;
}

/** Does an absolute path lie inside the ovi.lib folder `oviLibRoot`? */
export function isInOviLib(absolutePath, oviLibRoot) {
  if (!oviLibRoot) return false;
  return withSlashes(absolutePath).startsWith(`${withoutTrailingSlash(withSlashes(oviLibRoot))}/`);
}

/** The symbolic path a caller stores for an OVI of ovi.lib chosen at `absolutePath`, or null if it is elsewhere. */
export function oviLibPathFor(absolutePath, oviLibRoot) {
  if (!isInOviLib(absolutePath, oviLibRoot)) return null;
  return `${OVI_LIB_TOKEN}/${withSlashes(absolutePath).slice(withoutTrailingSlash(withSlashes(oviLibRoot)).length + 1)}`;
}

/** How the hierarchy names an OVI: its file name, with "(ovi.lib)" after it when it is one of ovi.lib's. */
export function hierarchyName(absolutePath, oviLibRoot) {
  const fileName = withSlashes(absolutePath).split("/").pop();
  return isInOviLib(absolutePath, oviLibRoot) ? `${fileName} ${OVI_LIB_MARK}` : fileName;
}
