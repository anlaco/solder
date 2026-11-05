// Rewrites the tables of docs/design/coverage.md: the summary, from the hand-written checklists and the
// inventory, and the palettes, windows and menus, from the inventory alone. `--check` changes nothing and
// fails when the document is out of date, so that `npm test` catches a ticked item nobody counted.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPOSITORY = new URL("../", import.meta.url);
const COVERAGE_DOCUMENT = fileURLToPath(new URL("docs/design/coverage.md", REPOSITORY));
const INVENTORY = fileURLToPath(new URL("docs/schema/inventario-labview.json", REPOSITORY));

const COVERED_STATE = "built";
// `elsewhere` is solved by other means (Git for source control), so it is not a copy of LabVIEW either way.
const UNCOUNTED_STATES = new Set(["never", "elsewhere"]);
const BAR_WIDTH = 10;

// What a palette shows around its categories: buttons, not parts of LabVIEW to clone.
const PALETTE_CHROME = new Set([
  "thumbtack",
  "double-arrows",
  "search",
  "change-visible-palettes",
  "select-a-vi",
  "select-a-control",
]);

// Palette categories whose subpalettes get a row each; every other category is one row.
const EXPANDED_CATEGORIES = new Set([
  "palette.functions.programming",
  "palette.functions.instrument-io",
  "palette.controls.modern",
]);

const lastSegment = (id) => id.slice(id.lastIndexOf(".") + 1);

function indexInventory(inventory) {
  const entriesById = new Map(inventory.entradas.map((entry) => [entry.id, entry]));
  const parentIds = new Set();
  for (const entry of inventory.entradas) {
    const lastDot = entry.id.lastIndexOf(".");
    if (lastDot > 0) parentIds.add(entry.id.slice(0, lastDot));
  }
  return { entries: inventory.entradas, entriesById, parentIds };
}

const childrenOf = (index, parentId) =>
  index.entries.filter((entry) => entry.id.startsWith(parentId + ".") && !entry.id.slice(parentId.length + 1).includes("."));

// A folder is not counted, only what it holds, and a palette's thumbtack is never a leaf of LabVIEW.
function countLeaves(index, rootId) {
  let covered = 0;
  let total = 0;
  for (const entry of index.entries) {
    const insideRoot = entry.id === rootId || entry.id.startsWith(rootId + ".");
    if (!insideRoot || index.parentIds.has(entry.id)) continue;
    if (lastSegment(entry.id) === "thumbtack" || UNCOUNTED_STATES.has(entry.estado)) continue;
    total += 1;
    if (entry.estado === COVERED_STATE) covered += 1;
  }
  return { covered, total };
}

// A category LabVIEW shows but nobody has opened yet is a lone leaf: it has no count, only a name.
function rowFor(index, entry, name) {
  if (!index.parentIds.has(entry.id)) return { name, notCaptured: true };
  return { name, ...countLeaves(index, entry.id) };
}

function paletteRows(index, paletteId) {
  const rows = [];
  for (const category of childrenOf(index, paletteId)) {
    if (PALETTE_CHROME.has(lastSegment(category.id))) continue;
    if (!EXPANDED_CATEGORIES.has(category.id)) {
      rows.push(rowFor(index, category, category.etiqueta));
      continue;
    }
    for (const subpalette of childrenOf(index, category.id)) {
      if (PALETTE_CHROME.has(lastSegment(subpalette.id))) continue;
      rows.push(rowFor(index, subpalette, `${category.etiqueta} ▸ ${subpalette.etiqueta}`));
    }
  }
  return rows;
}

const windowRows = (index) =>
  index.entries
    .filter((entry) => /^(window|dialog)\.[^.]+$/.test(entry.id))
    .map((entry) => rowFor(index, entry, entry.etiqueta));

function sumRows(rows) {
  const counted = rows.filter((row) => !row.notCaptured);
  return {
    covered: counted.reduce((sum, row) => sum + row.covered, 0),
    total: counted.reduce((sum, row) => sum + row.total, 0),
  };
}

function inventoryGroups(index) {
  const menus = { name: "Every right-click menu captured", ...countLeaves(index, "context") };
  return [
    { title: "Functions palette", column: "Subpalette", rows: paletteRows(index, "palette.functions") },
    { title: "Controls palette", column: "Subpalette", rows: paletteRows(index, "palette.controls") },
    { title: "Windows and dialogs", column: "Window", rows: windowRows(index) },
    { title: "Right-click menus", column: "Menus", rows: [menus] },
  ];
}

// The checklists are the `###` sections of "## Features", each line `- [x]` or `- [ ]`.
function checklistSections(markdown) {
  const features = markdown.split(/^## /m).find((part) => part.startsWith("Features"));
  if (!features) throw new Error("coverage.md has no \"## Features\" section");
  return features
    .split(/^### /m)
    .slice(1)
    .map((section) => {
      const [title] = section.split("\n", 1);
      const ticked = section.match(/^- \[x\]/gm)?.length ?? 0;
      const unticked = section.match(/^- \[ \]/gm)?.length ?? 0;
      return { name: title.trim(), covered: ticked, total: ticked + unticked };
    });
}

function formatCount({ covered, total, notCaptured }) {
  if (notCaptured || total === 0) return ["not captured yet", ""];
  const percent = Math.round((100 * covered) / total);
  const filled = Math.round((BAR_WIDTH * covered) / total);
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  return [`${covered} / ${total} (${percent} %)`, `\`${bar}\``];
}

function renderTable(column, rows) {
  const lines = [`| ${column} | Covered | |`, `|${"-".repeat(column.length + 2)}|---------|---|`];
  for (const row of rows) {
    const [count, bar] = formatCount(row);
    lines.push(`| ${row.name} | ${count} | ${bar} |`.replace(/ {2}\|$/, " |"));
  }
  return lines.join("\n");
}

function replaceRegion(markdown, name, content) {
  const start = `<!-- coverage:${name} -->`;
  const end = `<!-- /coverage:${name} -->`;
  const from = markdown.indexOf(start);
  const to = markdown.indexOf(end);
  if (from < 0 || to < from) throw new Error(`coverage.md lacks the markers of "${name}"`);
  return markdown.slice(0, from + start.length) + "\n" + content + "\n" + markdown.slice(to);
}

export function renderCoverage(markdown, inventory) {
  const groups = inventoryGroups(indexInventory(inventory));
  const summaryRows = [
    ...checklistSections(markdown),
    ...groups.map((group) => ({ name: group.title, ...sumRows(group.rows) })),
  ];
  const inventoryTables = groups
    .map((group) => `### ${group.title}\n\n${renderTable(group.column, group.rows)}`)
    .join("\n\n");
  const withSummary = replaceRegion(markdown, "summary", renderTable("Area", summaryRows));
  return replaceRegion(withSummary, "inventory", inventoryTables);
}

export function readCoverageSources() {
  return {
    markdown: readFileSync(COVERAGE_DOCUMENT, "utf8"),
    inventory: JSON.parse(readFileSync(INVENTORY, "utf8")),
  };
}

function main() {
  const { markdown, inventory } = readCoverageSources();
  const rendered = renderCoverage(markdown, inventory);
  if (process.argv.includes("--check")) {
    if (rendered !== markdown) {
      console.error("docs/design/coverage.md is out of date: run node scripts/coverage.mjs");
      process.exit(1);
    }
    return;
  }
  writeFileSync(COVERAGE_DOCUMENT, rendered);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
