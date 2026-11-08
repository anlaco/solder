// Palettes read from files (DT-086, step 1). A palette file is JSON that reproduces the structure of LabVIEW's `.mnu`:
// a title and an ordered list of entries, each an item (a function or control: display name and path), a sub-palette
// (the file that holds it) or a spacer. A reader of real `.mnu` files will produce the same structure later, so a
// change of NI's format touches only that reader (DT-086 §5).
//
//   { "palette": 1, "title": "DAQ", "entries": [
//       { "kind": "item",    "name": "DAQ Start Task", "path": "<ovilib>/DAQ/Start Task.sdg" },
//       { "kind": "spacer" },
//       { "kind": "palette", "name": "Advanced",       "path": "_daq/advanced.json" } ] }
//
// The parent names where its child goes (LabVIEW's `dir.mnu` names `daqmx.mnu` before it exists, measured
// labview-captures/reports/2026-11-08-mnu-format.md): an inventory entry with a `menu` field names the file, and an
// add-on that provides it fills the hole. A missing file is skipped silently, as LabVIEW skips it. Pure: the files are
// given as text, so the main process and the tests share it.

export const PALETTE_FORMAT_VERSION = 1;

const ENTRY_KINDS = ["item", "spacer", "palette"];
const MAXIMUM_NESTING = 8;

/** Palette files are found by relative path without regard to case: DFDT's folder is `categories` (measured). */
export const paletteFileKey = (relativePath) => relativePath.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();

const isText = (value) => typeof value === "string" && value.trim() !== "";

/** Does a path stay inside the folder of the palette that names it? No climbing out, no absolute paths. */
const staysInside = (path) => !path.startsWith("/") && !path.replaceAll("\\", "/").split("/").includes("..");

function entryProblem(entry, position) {
  const label = `entry ${position}`;
  if (!ENTRY_KINDS.includes(entry?.kind)) return `${label} has an unknown kind`;
  if (entry.kind === "spacer") return null;
  if (!isText(entry.name)) return `${label} has no name`;
  if (!isText(entry.path)) return `${label} has no path`;
  if (entry.kind === "palette" && !staysInside(entry.path)) return `${label} has a path that leaves its folder`;
  return null;
}

/** Checks the text of a palette file. Returns `{ palette }` or `{ problem }` with a sentence for the log. */
export function parsePalette(text) {
  let palette;
  try {
    palette = JSON.parse(text);
  } catch {
    return { problem: "the palette file is not valid JSON" };
  }
  if (palette?.palette !== PALETTE_FORMAT_VERSION) return { problem: `the palette file has an unknown version (expected ${PALETTE_FORMAT_VERSION})` };
  if (!isText(palette.title)) return { problem: "the palette file has no title" };
  if (!Array.isArray(palette.entries)) return { problem: "the palette file has no entries" };
  for (const [index, entry] of palette.entries.entries()) {
    const problem = entryProblem(entry, index + 1);
    if (problem) return { problem };
  }
  return { palette };
}

class PaletteProblem extends Error {}

const folderOf = (filePath) => filePath.replaceAll("\\", "/").split("/").slice(0, -1).join("/");
const joinPaths = (folder, path) => [folder, path.replaceAll("\\", "/")].filter(Boolean).join("/");

function idFragment(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entry";
}

/** The inventory entries of one palette file and of the sub-palettes it names, in the file's order. */
function expandPalette({ parentId, filePath, files, ancestors }) {
  const key = paletteFileKey(filePath);
  if (ancestors.includes(key)) throw new PaletteProblem(`${filePath} names itself, directly or through its sub-palettes`);
  if (ancestors.length >= MAXIMUM_NESTING) throw new PaletteProblem(`${filePath} is nested more than ${MAXIMUM_NESTING} palettes deep`);

  const { palette, problem } = parsePalette(files.get(key));
  if (problem) throw new PaletteProblem(`${filePath}: ${problem}`);

  const taken = new Set();
  const uniqueId = (name) => {
    const base = `${parentId}.${idFragment(name)}`;
    let candidate = base;
    for (let copy = 2; taken.has(candidate); copy++) candidate = `${base}-${copy}`;
    taken.add(candidate);
    return candidate;
  };

  const entries = [];
  for (const entry of palette.entries) {
    if (entry.kind === "spacer") continue; // a gap in the grid; the inventory has no such thing yet
    const id = uniqueId(entry.name);
    if (entry.kind === "item") {
      entries.push({ id, etiqueta: entry.name, estado: "built", prueba: `add-on palette file ${filePath}`, bloque: "subvi", config: { vi: entry.path } });
      continue;
    }
    entries.push({ id, etiqueta: entry.name, estado: "built", prueba: `add-on palette file ${filePath}` });
    const childPath = joinPaths(folderOf(filePath), entry.path);
    if (files.has(paletteFileKey(childPath))) {
      entries.push(...expandPalette({ parentId: id, filePath: childPath, files, ancestors: [...ancestors, key] }));
    }
  }
  return entries;
}

/** The entry that names a child file, as it is once the child exists: done, and no longer explained as a hole. */
function filledHole(entry) {
  const { labview, necesita, solder, porque, ...rest } = entry;
  return { ...rest, estado: "built", prueba: `add-on palette file ${entry.menu}` };
}

/**
 * Fills the holes of `inventoryData` whose `menu` names a file that `menuFiles` (`{ relative path: text }`) holds.
 * Returns `{ inventory, problems }`: a new inventory, the one given untouched, and a sentence for the log for each file
 * that could not be used, whose hole then stays as it was.
 */
export function mergeAddonPalettes(inventoryData, menuFiles) {
  const files = new Map(Object.entries(menuFiles).map(([path, text]) => [paletteFileKey(path), text]));
  const problems = [];
  const entradas = [];

  for (const entry of inventoryData.entradas) {
    if (!entry.menu || !files.has(paletteFileKey(entry.menu))) {
      entradas.push(entry);
      continue;
    }
    try {
      const children = expandPalette({ parentId: entry.id, filePath: entry.menu, files, ancestors: [] });
      entradas.push(filledHole(entry), ...children);
    } catch (error) {
      if (!(error instanceof PaletteProblem)) throw error;
      problems.push({ file: entry.menu, problem: error.message });
      entradas.push(entry);
    }
  }
  return { inventory: { ...inventoryData, entradas }, problems };
}
