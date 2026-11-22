// A project's Dependencies (DT-099 §4, stage c): every file the items call, at any depth, that is not an item, read from
// the files whenever the project is opened, edited or refreshed, and never written to the `.sdproj`. Measured in LabVIEW
// 2026 Q3 (labview-captures/reports/2026-11-17-project-explorer-s1.md Q4 and -s2.md Q1): the library's files in one
// folder first (LabVIEW's vi.lib, Solder's ovi.lib), then the others, each by file name; the menus of each kind of row.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Project from "../../core/model/project.mjs";
import { projectDependencies } from "../../editor/electron/project-dependencies.mjs";
import * as Edit from "../../editor/src/project-explorer/project-explorer-edit.mjs";
import * as State from "../../editor/src/project-explorer/project-explorer-state.mjs";
import * as View from "../../editor/src/project-explorer/project-explorer-view.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const source = (file) => readFileSync(path.join(RAIZ, file), "utf8");
const OVI_LIB = "/solder/ovi.lib";

/** An `.ovi`'s text calling `subOVIs` (stored paths) and following the type definitions `typeDefinitions`. */
function oviText(subOVIs = [], typeDefinitions = []) {
  const nodes = subOVIs.map((vi, index) => ({ name: `s${index}`, type: "subvi", config: { vi } }));
  const panel = typeDefinitions.map((typedefPath, index) => ({ name: `c${index}`, kind: "numeric-control", typedef: { path: typedefPath, strict: false } }));
  return JSON.stringify({ "solder-ovi": 8, "front-panel": { items: panel }, "block-diagram": { nodes, wires: [] } });
}

/** /p/main.ovi calls sub.ovi, ovi.lib's Close.ovi, a missing gone.ovi and follows Point.octl; sub.ovi calls lib/deep.ovi. */
const FILES = new Map([
  ["/p/main.ovi", oviText(["sub.ovi", "<ovilib>/File/Close.ovi", "gone.ovi"], ["Point.octl"])],
  ["/p/sub.ovi", oviText(["lib/deep.ovi"])],
  ["/p/lib/deep.ovi", oviText()],
  ["/p/Point.octl", JSON.stringify({ "solder-control": 8 })],
  [`${OVI_LIB}/File/Close.ovi`, oviText()],
  ["/p/notes.txt", "not JSON"],
]);

async function dependenciesOf(itemKeys) {
  const read = [];
  const readText = async (key) => {
    read.push(key);
    return FILES.get(key) ?? null;
  };
  const dependencies = await projectDependencies(itemKeys, readText, OVI_LIB, (key) => key.startsWith(`${OVI_LIB}/`));
  return { dependencies, read };
}

test("Dependencies is the closure of what the items call, minus the items, with ovi.lib apart", async () => {
  const { dependencies, read } = await dependenciesOf(["/p/main.ovi", "/p/notes.txt"]);
  assert.deepEqual(dependencies.library, [`${OVI_LIB}/File/Close.ovi`]);
  assert.deepEqual(dependencies.others, ["/p/lib/deep.ovi", "/p/gone.ovi", "/p/Point.octl", "/p/sub.ovi"], "by file name, case-insensitive");
  assert.deepEqual(dependencies.missing, ["/p/gone.ovi"]);
  assert.ok(!read.includes("/p/notes.txt"), "a document calls nothing and is never read");
  // A dependency that becomes an item leaves Dependencies (measured: s2 Q3).
  const withSub = (await dependenciesOf(["/p/main.ovi", "/p/sub.ovi"])).dependencies;
  assert.ok(!withSub.others.includes("/p/sub.ovi"));
  assert.ok(withSub.others.includes("/p/lib/deep.ovi"), "what the item calls stays");
  // A missing item is no dependency.
  assert.deepEqual((await dependenciesOf(["/p/absent.ovi"])).dependencies, { library: [], others: [], missing: [] });
});

/** A window on a project holding /p/main.ovi, saved at /p/P.sdproj, with the dependencies above read. */
async function windowWithDependencies() {
  const project = Project.addFiles(Project.blankProject(), ["main.ovi"]).project;
  const { dependencies } = await dependenciesOf(["/p/main.ovi"]);
  return State.withDisk(State.fromProject(project, "P.sdproj", { opened: true }), { dependencies });
}

const DEPENDENCIES_KEY = "project/0/1";

test("the rows under Dependencies: the ovi.lib folder first, then the others, collapsed as an opened project", async () => {
  let state = await windowWithDependencies();
  const labels = () => State.visibleRows(state).map((row) => `${"  ".repeat(row.depth)}${row.label}${row.expandable ? (row.expanded ? " −" : " +") : ""}`);
  assert.deepEqual(labels(), ["Project: P.sdproj −", "  My Computer −", "    main.ovi", "    Dependencies +", "    Build Specifications"]);
  state = State.expandAll(state, DEPENDENCIES_KEY);
  assert.deepEqual(labels().slice(3, -1), ["    Dependencies −", "      ovi.lib −", "        Close.ovi", "      deep.ovi", "      gone.ovi", "      Point.octl", "      sub.ovi"]);
  const kinds = Object.fromEntries(State.visibleRows(state).map((row) => [row.label, row.kind]));
  assert.equal(kinds["ovi.lib"], "dependency-library");
  assert.equal(kinds["sub.ovi"], "dependency-ovi");
  assert.equal(kinds["Point.octl"], "dependency-type-definition");
  // The missing file keeps its row, drawn apart (LabVIEW's mark for it was not measured).
  assert.match(View.projectExplorerWindow(INV, state, (text) => text.length * 6, { width: 374, height: 401 }), /class="pe-row pe-missing"[^>]*>.*?gone\.ovi/);
  // Nothing of it reaches the file: Dependencies is written empty (measured: s1 Q4).
  assert.doesNotMatch(Edit.projectText(state.project), /sub\.ovi|Close\.ovi/);
});

test("the rows under Dependencies have their measured menus", async () => {
  const labels = (kind) => INV.hijos(`context.project-explorer.${kind}`).map((entry) => `${entry.separado ? "| " : ""}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}`);
  // s2 Q1: the vi.lib folder, a dependency VI and a dependency .ctl ("the same plus Convert Contents of Control to Class after Print..., no Run").
  assert.deepEqual(labels("dependency-library"), ["Items incorrectly claimed by a library", "| Unit Tests", "| Analyze OVIs...", "| Find Project Items...", "| Arrange By", "Expand All", "Collapse All"]);
  const common = ["| Find", "Why is this item in Dependencies?", "| Save", "Save As...", "| Analyze OVIs...", "| Arrange By", "| Rename... F2", "Replace with...", "| Properties"];
  assert.deepEqual(labels("dependency-ovi"), ["Open", "Explore...", "Show in Files View Ctrl+E", "| Print...", "| Run", ...common]);
  assert.deepEqual(labels("dependency-type-definition"), ["Open", "Explore...", "Show in Files View Ctrl+E", "| Print...", "Convert Contents of Control to Class", ...common]);
  // Each kind of row opens its own menu, and Expand All and Collapse All of the folder work.
  let state = State.expandAll(await windowWithDependencies(), DEPENDENCIES_KEY);
  const keyOf = (label) => State.visibleRows(state).find((row) => row.label === label).key;
  for (const [label, menu] of [["ovi.lib", "dependency-library"], ["sub.ovi", "dependency-ovi"], ["Point.octl", "dependency-type-definition"]]) {
    assert.equal(State.openContextMenu(state, INV, keyOf(label), { x: 0, y: 0 }).menuBarra?.id, `context.project-explorer.${menu}`, label);
  }
  state = State.runContextCommand(State.select(state, keyOf("ovi.lib")), "context.project-explorer.dependency-library.collapse-all");
  assert.ok(!State.visibleRows(state).some((row) => row.label === "Close.ovi"));
  // Refresh is built and reads the files again; a dependency is not removed, cut or copied.
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.dependencies.refresh"], "refreshDependencies");
  assert.equal(INV.entrada("context.project-explorer.dependencies.refresh").estado, "built");
  assert.ok(State.disabledButtons(State.select(state, keyOf("sub.ovi"))).has("remove-from-project"));
});

test("Open on a dependency opens its file in the project", async () => {
  const state = State.expandAll(await windowWithDependencies(), DEPENDENCIES_KEY);
  const keyOf = (label) => State.visibleRows(state).find((row) => row.label === label).key;
  assert.deepEqual(Edit.openRequestOf(state, keyOf("sub.ovi")), { storedPath: "/p/sub.ovi" }, "an absolute path, which the project resolves as it is");
  assert.deepEqual(Edit.openRequestOf(state, keyOf("Close.ovi")), { storedPath: `${OVI_LIB}/File/Close.ovi` });
  assert.equal(Edit.openRequestOf(state, keyOf("Point.octl")), null, "a type definition has no window yet");
  assert.equal(State.CONTEXT_COMMANDS["context.project-explorer.dependency-ovi.open"], "openItem");
  assert.equal(INV.entrada("context.project-explorer.dependency-type-definition.open").estado, "todo");
});

test("a selected dependency that is gone gives the selection back to My Computer", async () => {
  const state = State.expandAll(await windowWithDependencies(), DEPENDENCIES_KEY);
  const selected = State.select(state, State.visibleRows(state).find((row) => row.label === "sub.ovi").key);
  const after = State.withDisk(selected, { dependencies: { library: [], others: [], missing: [] } });
  assert.equal(after.selected, State.targetKeyOf(after.project));
  assert.equal(State.withDisk(selected, selected.disk).selected, selected.selected, "a row still there stays selected");
});

test("the page reads the files when it opens, after each edit, on Refresh and when an OVI is saved", () => {
  const page = source("editor/src/project-explorer/project-explorer.mjs");
  assert.match(page, /onDiskChanged\?\.\(\(\) => readDisk\(\)\)/);
  assert.match(page, /refreshDependencies: \(\) => readDisk\(\)/);
  assert.match(source("editor/src/project-explorer/project-explorer-commands.mjs"), /changed\(Edit\.projectText\(next\.project\)\);\s*readDisk\?\.\(\);/);
  const main = source("editor/electron/main.mjs");
  assert.equal(main.match(/broadcast\("ovi:saved"[^\n]*\n\s*projects\.filesChanged\(\);/g)?.length, 2, "both ways of saving an OVI");
});
