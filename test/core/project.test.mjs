// Projects (DT-099): a `.sdproj` is LabVIEW's `.lvproj` copied one to one in JSON. The facts come from LabVIEW 2026 Q3
// (reports/2026-11-17-project-explorer-s1.md and -s2.md): a blank project is My Computer with Dependencies and Build
// Specifications; items are written folders first, then files, each by name whatever the case; Dependencies and an
// auto-populating folder are written with no contents; a file already in the project is refused and the rest added.

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import * as Project from "../../core/model/project.mjs";
import { leer as leerJson } from "../helpers.mjs";

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/sdproj.schema.json"));
const validFile = (text) => {
  const file = JSON.parse(text);
  assert.ok(validate(file), JSON.stringify(validate.errors));
  return file;
};
const targetOf = (text) => JSON.parse(text).items[0];

test("a blank project is My Computer holding Dependencies and Build Specifications, as LabVIEW saves one", () => {
  const file = validFile(Project.writeProject(Project.blankProject()));
  assert.deepEqual(file, {
    "solder-project": 1,
    items: [{ name: "My Computer", kind: "my-computer", items: [{ name: "Dependencies", kind: "dependencies" }, { name: "Build Specifications", kind: "build" }] }],
  });
});

test("items are written folders first, then files, each by name whatever the case, with the fixed items last", () => {
  let project = Project.blankProject();
  project = Project.addFiles(project, ["td/q1.ovi", "notes.txt", "main1.ovi"]).project;
  project = Project.addVirtualFolder(project, "Sub");
  project = Project.addFiles(project, ["td/StrictTD.octl", "td/base.ovi", "td/EnumTD.octl"], "td").project;
  project = Project.addAutoPopulatingFolder(project, "auto");
  const text = Project.writeProject(project);
  validFile(text);
  assert.deepEqual(targetOf(text).items.map((item) => item.name), ["auto", "Sub", "td", "main1.ovi", "notes.txt", "q1.ovi", "Dependencies", "Build Specifications"]);
  const snapshot = targetOf(text).items.find((item) => item.name === "td");
  assert.deepEqual(snapshot.items.map((item) => item.name), ["base.ovi", "EnumTD.octl", "StrictTD.octl"], "case-insensitive, as measured");
  assert.equal(snapshot.path, undefined, "a snapshot is stored as a virtual folder (measured)");
});

test("a project reads back to the same text, so saving with no change writes the same file", () => {
  let project = Project.addFiles(Project.blankProject(), ["main1.ovi", "notes.txt"]).project;
  project = Project.addAutoPopulatingFolder(Project.addVirtualFolder(project, "Sub"), "auto");
  const text = Project.writeProject(project);
  assert.equal(Project.writeProject(Project.readProject(text)), text);
});

test("Dependencies and an auto-populating folder are written with no contents: both are read again from the disk", () => {
  const project = Project.addAutoPopulatingFolder(Project.blankProject(), "auto");
  const target = Project.myComputer(project);
  const filled = {
    items: [{ ...target, items: target.items.map((item) => (item.kind === "dependencies" ? { ...item, items: [{ name: "sub1.ovi", kind: "ovi", path: "sub1.ovi" }] } : item.autoPopulating ? { ...item, items: [{ name: "a.txt", kind: "document", path: "auto/a.txt" }] } : item)) }],
  };
  const written = targetOf(Project.writeProject(filled));
  assert.deepEqual(written.items[0], { name: "auto", kind: "folder", path: "auto", "auto-populating": true });
  assert.deepEqual(written.items[1], { name: "Dependencies", kind: "dependencies" });
});

test("a file already in the project is refused with LabVIEW's reason, and the rest are added", () => {
  const first = Project.addFiles(Project.blankProject(), ["td/q1.ovi"]).project;
  const { project, refused } = Project.addFiles(first, ["td/q1.ovi", "td/q3.ovi"], "td");
  assert.deepEqual(refused, ["td/q1.ovi"]);
  assert.equal(Project.ALREADY_IN_PROJECT, "An item with this path already exists in the project.");
  assert.deepEqual(Project.itemsWithPaths(project).map((item) => item.path).sort(), ["td/q1.ovi", "td/q3.ovi"]);
});

test("an OVI, a polymorphic OVI and a control are OVI items, as LabVIEW lists its VIs and controls; other files are documents", () => {
  for (const path of ["a.ovi", "old.sdg", "older.qvi", "poly.sdp", "Point.octl"]) assert.equal(Project.itemKindOf(path), "ovi", path);
  assert.equal(Project.itemKindOf("notes.txt"), "document");
});

test("Dependencies is every file the items call, at any depth, that is not an item; the library grouped first", () => {
  const calls = { "/p/main1.ovi": ["/p/sub1.ovi", "/lib/Simple Error Handler.ovi"], "/p/sub1.ovi": ["/p/td/PointTD.octl"], "/lib/Simple Error Handler.ovi": ["/lib/Clear Errors.ovi"], "/p/td/q1.ovi": ["/p/td/PointTD.octl"] };
  const keys = Project.dependencyKeys(["/p/main1.ovi", "/p/td/q1.ovi"], (key) => calls[key], (key) => key.startsWith("/lib/"));
  assert.deepEqual(keys.library, ["/lib/Clear Errors.ovi", "/lib/Simple Error Handler.ovi"], "the transitive closure, by name (measured)");
  assert.deepEqual(keys.others, ["/p/td/PointTD.octl", "/p/sub1.ovi"]);
  const withControl = Project.dependencyKeys(["/p/main1.ovi", "/p/td/PointTD.octl"], (key) => calls[key], (key) => key.startsWith("/lib/"));
  assert.ok(!withControl.others.includes("/p/td/PointTD.octl"), "a dependency that becomes an item leaves Dependencies (measured)");
});

test("a newer project file, or one with no target, is refused", () => {
  assert.throws(() => Project.readProject({ "solder-project": Project.PROJECT_VERSION + 1, items: [] }), Project.ProjectFileError);
  assert.throws(() => Project.readProject({ "solder-project": 1, items: [] }), Project.ProjectFileError);
  assert.throws(() => Project.readProject("not json"), Project.ProjectFileError);
});

test("the tree is kept in LabVIEW's order after every change, so the window draws what the file holds", () => {
  let project = Project.addFiles(Project.blankProject(), ["zeta.ovi", "Alpha.txt"]).project;
  project = Project.addVirtualFolder(project, "Sub");
  assert.deepEqual(Project.myComputer(project).items.map((item) => item.name), ["Sub", "Alpha.txt", "zeta.ovi", "Dependencies", "Build Specifications"]);
});

test("a project keeps where its window was, and one without it reads without it", () => {
  const placed = { ...Project.blankProject(), window: { x: 41, y: 32, width: 374, height: 434 } };
  const text = Project.writeProject(placed);
  assert.deepEqual(validFile(text).window, placed.window);
  assert.deepEqual(Project.readProject(text).window, placed.window);
  assert.equal(Project.readProject(Project.writeProject(Project.blankProject())).window, undefined);
});
