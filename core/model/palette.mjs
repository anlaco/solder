// Palettes read from files (DT-086, step 1). A palette file is JSON that reproduces the structure of LabVIEW's `.mnu`:
// a title and an ordered list of entries, each an item (a function or control: display name and path), a sub-palette
// (the file that holds it) or a spacer. A reader of real `.mnu` files will produce the same structure later, so a
// change of NI's format touches only that reader (DT-086 §5).
//
//   { "palette": 1, "title": "DAQ", "columns": 6, "entries": [
//       { "kind": "item",    "name": "DAQ Start Task", "path": "<ovilib>/DAQ/Start Task.ovi" },
//       { "kind": "item",    "name": "DAQ Task Name",  "block": "daq-name-constant", "config": { … } },
//       { "kind": "item",    "name": "DAQ Write",      "missing": "the writes", "labview": "Writes samples…" },
//       { "kind": "spacer" },
//       { "kind": "palette", "name": "Advanced",       "path": "_daq/advanced.json" } ] }
//
// `columns` is the grid's width, and a spacer is an empty cell of it, as LabVIEW's grids have, so what follows keeps
// its place. An item places an OVI by its `path`, or a block of the catalog by its name (`block`, as the `.mnu` names
// a built-in object such as a constant). An item with `missing` is not built in Solder yet: it is shown greyed with
// that reason (DT-035, until DT-086's second step) and `labview` says what LabVIEW's does, written anew; a sub-palette
// with `missing` is a greyed folder.
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
  if (isText(entry.missing) || (entry.kind === "item" && isText(entry.block))) return null;
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
  if (palette.columns !== undefined && !(Number.isInteger(palette.columns) && palette.columns > 0)) return { problem: "the palette file's columns is not a positive whole number" };
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

/** The inventory entry of an item: an OVI by its path, a block by its name, or a hole with its reason. */
function itemEntry(id, entry, filePath) {
  if (isText(entry.missing)) return { id, etiqueta: entry.name, estado: "todo", necesita: entry.missing, ...(isText(entry.labview) && { labview: entry.labview }) };
  const placed = isText(entry.block) ? { bloque: entry.block, ...(entry.config && { config: entry.config }) } : { bloque: "subvi", config: { vi: entry.path } };
  return { id, etiqueta: entry.name, estado: "built", prueba: `add-on palette file ${filePath}`, ...placed };
}

/**
 * The inventory entries of one palette file and of the sub-palettes it names, in the file's order, and the grid of
 * that file (`{ columnas, celdas }` as the editor's measured grids, or null without `columns`): an entry that follows
 * a spacer is pinned to its cell, so the ones after it follow on from there.
 */
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
  const celdas = {};
  let afterSpacer = false;
  for (const [cell, entry] of palette.entries.entries()) {
    if (entry.kind === "spacer") {
      afterSpacer = true;
      continue;
    }
    const id = uniqueId(entry.name);
    if (afterSpacer && palette.columns) celdas[id.slice(parentId.length + 1)] = [Math.floor(cell / palette.columns), cell % palette.columns];
    afterSpacer = false;
    if (entry.kind === "item" || isText(entry.missing)) {
      entries.push(itemEntry(id, entry, filePath));
      continue;
    }
    const childPath = joinPaths(folderOf(filePath), entry.path);
    if (!files.has(paletteFileKey(childPath))) {
      entries.push({ id, etiqueta: entry.name, estado: "built", prueba: `add-on palette file ${filePath}` });
      continue;
    }
    const child = expandPalette({ parentId: id, filePath: childPath, files, ancestors: [...ancestors, key] });
    entries.push({ id, etiqueta: entry.name, estado: "built", prueba: `add-on palette file ${filePath}`, ...(child.grid && { rejilla: child.grid }) }, ...child.entries);
  }
  return { entries, grid: palette.columns ? { columnas: palette.columns, celdas } : null };
}

/** The entry that names a child file, as it is once the child exists: done, and no longer explained as a hole. */
function filledHole(entry, grid) {
  const { labview, necesita, solder, porque, ...rest } = entry;
  return { ...rest, estado: "built", prueba: `add-on palette file ${entry.menu}`, ...(grid && { rejilla: grid }) };
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
      const { entries, grid } = expandPalette({ parentId: entry.id, filePath: entry.menu, files, ancestors: [] });
      entradas.push(filledHole(entry, grid), ...entries);
    } catch (error) {
      if (!(error instanceof PaletteProblem)) throw error;
      problems.push({ file: entry.menu, problem: error.message });
      entradas.push(entry);
    }
  }
  return { inventory: { ...inventoryData, entradas }, problems };
}
