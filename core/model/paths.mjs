// LabVIEW's path data type (DT-067): a kind and a list of components, read and written with the rules of
// the system Solder runs on. Pure module: no DOM, no file system.
//
// Measured in LabVIEW 2026 Q3 on Windows (labview-captures/reports/2026-10-26-path-type.md). The Linux and
// macOS rules are not measured yet: only their separator and root are assumed, and every other choice
// for them is marked "unverified".

/** The kinds of a path, numbered as Path Type gives them (measured). */
export const PATH_KIND = Object.freeze({ ABSOLUTE: 0, RELATIVE: 1, NOT_A_PATH: 2 });

/** The empty path: absolute with no components, the default of a path control (measured: Path Type 0, Empty? TRUE). */
export const EMPTY_PATH = Object.freeze({ kind: PATH_KIND.ABSOLUTE, components: [] });
export const NOT_A_PATH = Object.freeze({ kind: PATH_KIND.NOT_A_PATH, components: [] });

/** The text LabVIEW shows for Not A Path, and which String To Path turns back into it (measured). */
export const NOT_A_PATH_TEXT = "<Not A Path>";

/** A ".." component is kept as an empty string, as Path to Array of Strings shows it (measured: `..\x` → ["","x"]). */
const PARENT_COMPONENT = "";

const WINDOWS_SEPARATOR = "\\";
const POSIX_SEPARATOR = "/";
const UNC_PREFIX = "\\\\";
const LONG_PATH_PREFIX = "\\\\?\\";
const DRIVE_PATTERN = /^([A-Za-z]):(.*)$/s;

/** The rules of the host: "windows" or "posix" (Linux and macOS). */
export function hostPathRules() {
  const platform = typeof process !== "undefined" && process.platform ? process.platform : globalThis.navigator?.platform ?? "";
  return /^win/i.test(platform) ? "windows" : "posix";
}

const relative = (components) => ({ kind: PATH_KIND.RELATIVE, components });
const absolute = (components) => ({ kind: PATH_KIND.ABSOLUTE, components });

export const isNotAPath = (path) => path.kind === PATH_KIND.NOT_A_PATH;

/** Empty String/Path? on a path: the empty path, and the relative "." too (measured); never Not A Path. */
export const isEmptyPath = (path) => !isNotAPath(path) && path.components.length === 0;

const isUncRoot = (component) => component.startsWith(UNC_PREFIX);

/**
 * The components of the text after a root, split on the separator: a doubled or trailing separator gives
 * nothing, "." is dropped and ".." is kept as a parent component (measured: `C:\a\\b` → `C:\a\b`,
 * `C:\a\` → `C:\a`, "." → relative with no components).
 */
function splitComponents(text, separator) {
  return text
    .split(separator)
    .filter((part) => part !== "" && part !== ".")
    .map((part) => (part === ".." ? PARENT_COMPONENT : part));
}

/** String To Path, and what a path control does with the text typed into it (measured: they agree). */
export function pathFromText(text, rules = hostPathRules()) {
  if (text === NOT_A_PATH_TEXT) return NOT_A_PATH;
  if (text === "") return EMPTY_PATH;
  return rules === "windows" ? windowsPathFromText(text) : posixPathFromText(text);
}

function windowsPathFromText(text) {
  const withoutLongPrefix = text.startsWith(LONG_PATH_PREFIX) ? text.slice(LONG_PATH_PREFIX.length) : text;
  if (withoutLongPrefix.startsWith(UNC_PREFIX)) {
    // A UNC share is one component, `\\server\share` (measured: Path to Array of Strings gives it whole).
    const [server = "", share = "", ...rest] = withoutLongPrefix.slice(UNC_PREFIX.length).split(WINDOWS_SEPARATOR);
    const root = `${UNC_PREFIX}${server}${share ? `${WINDOWS_SEPARATOR}${share}` : ""}`;
    return absolute([root, ...splitComponents(rest.join(WINDOWS_SEPARATOR), WINDOWS_SEPARATOR)]);
  }
  const drive = DRIVE_PATTERN.exec(withoutLongPrefix);
  // "/" is an ordinary character on Windows (measured: "C:/a/b" → `C:\/a/b`, "C:a" → `C:\a`).
  if (drive) return absolute([drive[1], ...splitComponents(drive[2], WINDOWS_SEPARATOR)]);
  // Unverified: a text that starts with a single "\" and no drive is taken as relative.
  return relative(splitComponents(withoutLongPrefix, WINDOWS_SEPARATOR));
}

// Unverified: the whole of the POSIX rules, beyond "/" as separator and root.
function posixPathFromText(text) {
  if (text.startsWith(POSIX_SEPARATOR)) return absolute(splitComponents(text, POSIX_SEPARATOR));
  return relative(splitComponents(text, POSIX_SEPARATOR));
}

/** Path To String, and how the panel shows a path (measured: empty → "", relative with no components → "."). */
export function pathToText(path, rules = hostPathRules()) {
  if (isNotAPath(path)) return NOT_A_PATH_TEXT;
  const shown = path.components.map((component) => (component === PARENT_COMPONENT ? ".." : component));
  if (path.kind === PATH_KIND.RELATIVE) return shown.length === 0 ? "." : shown.join(rules === "windows" ? WINDOWS_SEPARATOR : POSIX_SEPARATOR);
  if (shown.length === 0) return "";
  if (rules !== "windows") return `${POSIX_SEPARATOR}${shown.join(POSIX_SEPARATOR)}`;
  const [root, ...rest] = shown;
  // A drive shows as "C:\"; a UNC share as itself (measured: `C:\` and `\\server\share\f`).
  const rootText = isUncRoot(root) ? root : `${root}:`;
  return rest.length === 0 && !isUncRoot(root) ? `${rootText}${WINDOWS_SEPARATOR}` : [rootText, ...rest].join(WINDOWS_SEPARATOR);
}

/**
 * Build Path: `name` is a string or a path (LabVIEW takes both). Measured: a Not A Path base, an absolute
 * name or an empty name string give Not A Path; ".." takes one component away; the empty path is a root
 * to which a name is the drive ("" + "b" → `b:\`); `C:\` + ".." gives the empty path; the empty path with
 * an empty name stays empty, while any other base with an empty name gives Not A Path.
 */
export function buildPath(base, name, rules = hostPathRules()) {
  if (isNotAPath(base)) return NOT_A_PATH;
  if (typeof name === "string" && name === "") return base.kind === PATH_KIND.ABSOLUTE && base.components.length === 0 ? EMPTY_PATH : NOT_A_PATH;
  const appended = typeof name === "string" ? pathFromText(name, rules) : name;
  if (isNotAPath(appended) || appended.kind === PATH_KIND.ABSOLUTE) return NOT_A_PATH;
  const components = [...base.components];
  for (const component of appended.components) {
    if (component !== PARENT_COMPONENT) components.push(component);
    else if (components.length > 0 && components.at(-1) !== PARENT_COMPONENT) components.pop();
    // Unverified: ".." above the root of an absolute path; a relative path keeps it.
    else if (base.kind === PATH_KIND.RELATIVE) components.push(PARENT_COMPONENT);
    else return NOT_A_PATH;
  }
  return { kind: base.kind, components };
}

/**
 * Strip Path: the path without its last component, and that component. Measured: `C:\` gives the empty
 * path and "C"; a single relative name gives "." and the name; the empty path, Not A Path and a bare UNC
 * share give Not A Path and "".
 */
export function stripPath(path) {
  if (isNotAPath(path) || path.components.length === 0) return { stripped: NOT_A_PATH, name: "" };
  if (path.kind === PATH_KIND.ABSOLUTE && path.components.length === 1 && isUncRoot(path.components[0])) return { stripped: NOT_A_PATH, name: "" };
  const name = path.components.at(-1);
  return { stripped: { kind: path.kind, components: path.components.slice(0, -1) }, name: name === PARENT_COMPONENT ? ".." : name };
}

/** Path to Array of Strings: the components and whether the path is relative (measured: Not A Path gives [] and FALSE). */
export function pathToArrayOfStrings(path) {
  if (isNotAPath(path)) return { components: [], relative: false };
  return { components: [...path.components], relative: path.kind === PATH_KIND.RELATIVE };
}

/** Array of Strings to Path: the inverse, which cannot give Not A Path back (measured: it comes back empty). */
export const arrayOfStringsToPath = (components, isRelative) => ({ kind: isRelative ? PATH_KIND.RELATIVE : PATH_KIND.ABSOLUTE, components: [...components] });

/**
 * Equal? on two paths: the same kind and the same components. Windows ignores case (measured:
 * `C:\a` = `c:\A`); unverified: that the POSIX rules keep it.
 */
export function pathsEqual(first, second, rules = hostPathRules()) {
  if (first.kind !== second.kind || first.components.length !== second.components.length) return false;
  const fold = rules === "windows" ? (text) => text.toLowerCase() : (text) => text;
  return first.components.every((component, index) => fold(component) === fold(second.components[index]));
}

// In memory a path is one handle, like LabVIEW's own path handle (DT-067 §1): its block holds the kind in one
// byte, then each component as its UTF-8 length (U32, little-endian) and its bytes. An empty block is the
// empty path, so a path that was never written, whose handle is 0, reads as the empty path.
const KIND_BYTES = 1;
const LENGTH_BYTES = 4;

export function encodePath(path) {
  if (path.kind === PATH_KIND.ABSOLUTE && path.components.length === 0) return new Uint8Array(0);
  const encoded = path.components.map((component) => new TextEncoder().encode(component));
  const bytes = new Uint8Array(KIND_BYTES + encoded.reduce((total, component) => total + LENGTH_BYTES + component.length, 0));
  const view = new DataView(bytes.buffer);
  bytes[0] = path.kind;
  let offset = KIND_BYTES;
  for (const component of encoded) {
    view.setUint32(offset, component.length, true);
    bytes.set(component, offset + LENGTH_BYTES);
    offset += LENGTH_BYTES + component.length;
  }
  return bytes;
}

export function decodePath(bytes) {
  if (bytes.length === 0) return EMPTY_PATH;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const components = [];
  for (let offset = KIND_BYTES; offset < bytes.length; ) {
    const length = view.getUint32(offset, true);
    components.push(new TextDecoder().decode(bytes.subarray(offset + LENGTH_BYTES, offset + LENGTH_BYTES + length)));
    offset += LENGTH_BYTES + length;
  }
  return { kind: bytes[0], components };
}
