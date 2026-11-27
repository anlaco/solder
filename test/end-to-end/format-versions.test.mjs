// The .sdg format is frozen from 0.4.0-beta on (DT-055, spec/02 §4.1; version 2 since DT-075): every file a
// released Solder saved still opens. test/fixtures/released/<version>/ keeps the example OVIs as each
// release saved them; each top-level OVI must load with its subOVIs and compile, and a newer format
// version must be refused, not read halfway.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { ErrorQvi, MIGRATIONS, VERSION, aTexto, leer, migrar } from "../../core/model/qvi-format.mjs";
import { CAT, RAIZ } from "../helpers.mjs";

const RELEASED = path.join(RAIZ, "test", "fixtures", "released");
/** The OVIs an example opens at the top; the rest of its folder are its subOVIs. */
const TOP_LEVEL = ["Instrument Protocol", "Oven Controller", "Temperature Monitor"];

const filesOf = (folder) => readdirSync(folder, { recursive: true }).filter((file) => /\.(qvi|sdg)$/.test(file)).map((file) => path.join(folder, file));

for (const release of readdirSync(RELEASED)) {
  test(`the VIs saved by ${release} open and compile`, () => {
    const files = filesOf(path.join(RELEASED, release));
    assert.ok(files.length > 0, `${release} keeps its files`);
    for (const file of files.filter((candidate) => TOP_LEVEL.includes(path.basename(candidate, path.extname(candidate))))) {
      const hierarchy = loadHierarchy(file, CAT, {
        resolvePath: (caller, relative) => path.resolve(path.dirname(caller), relative),
        loadOVI: (key, oviCatalog) => leer(readFileSync(key, "utf8"), oviCatalog),
      });
      assert.deepEqual(hierarchy.errors, [], `${release}/${path.basename(file)} loads with its subOVIs`);
      const { g, cat } = hierarchy.ovis.get(hierarchy.root);
      assert.equal(compilar(g, cat).errores, undefined, `${release}/${path.basename(file)} compiles`);
      // Saved again, each OVI of the hierarchy is written in the current version.
      for (const [key, vi] of hierarchy.ovis) assert.equal(JSON.parse(aTexto(vi.g, vi.cat)).solder, VERSION, path.basename(key));
    }
  });
}

test("a file of a newer format version is refused, and an older one is migrated step by step", () => {
  const newer = { ...JSON.parse(readFileSync(filesOf(path.join(RELEASED, "0.4.0-beta"))[0], "utf8")), solder: VERSION + 1 };
  assert.throws(() => leer(newer, CAT), ErrorQvi);
  const steps = [(vi) => ({ ...vi, solder: 2, first: true }), (vi) => ({ ...vi, solder: 3, second: vi.first })];
  assert.deepEqual(migrar({ solder: 1 }, steps, 3), { solder: 3, first: true, second: true });
});

// DT-075: version 2 numbers a connector's cells by LabVIEW's connector index and names the pattern by its number.
test("a version 1 connector is migrated to LabVIEW's indices of 4-2-2-4, and its terminals stay where they were drawn", async () => {
  const { cellRect } = await import("../../core/model/connector.mjs");
  const OLD_4_2_2_4_RECTS = { 1: { x: 0, y: 8 }, 9: { x: 24, y: 8 } };
  const text = readFileSync(path.join(RELEASED, "0.4.0-beta", "temperature-monitor", "Read Sensor.sdg"), "utf8");
  const original = JSON.parse(text);
  assert.equal(original.solder, 1);
  assert.deepEqual([original.connector.inputs[0].cell, original.connector.outputs[0].cell], [1, 9]);
  const migrated = migrar(original);
  assert.equal(migrated.connector.pattern, 4815);
  assert.deepEqual([migrated.connector.inputs[0].cell, migrated.connector.outputs[0].cell], [10, 2], "Solder's cell n is LabVIEW's 11 − n");
  for (const [oldCell, newCell] of [[1, 10], [9, 2]]) {
    const { x, y } = cellRect(newCell, 4815);
    assert.deepEqual({ x, y }, OLD_4_2_2_4_RECTS[oldCell], `cell ${oldCell} of version 1 is the same place as LabVIEW's ${newCell}`);
  }
  assert.throws(() => migrar({ solder: 1, connector: { pattern: "5-3-3-5", inputs: [], outputs: [] } }), ErrorQvi);
});

// DT-100 §6: version 8 of the .ovi and .octl, and version 2 of the .sdp and .sdproj, allow a `comment` on any object.
// The change is only allowed, so an older file opens unchanged and is saved in the new version.
test("an .ovi or .octl of version 7 opens as version 8 with nothing else changed", () => {
  const version7 = { solder: 7, "block-diagram": { nodes: [] }, layout: { diagram: {} } };
  assert.deepEqual(migrar(version7, MIGRATIONS, 8), { ...version7, solder: 8 });
});

// DT-104 stage b: version 9 lets a type definition link say `"auto-update": false`; a link without it is ticked.
test("an .ovi or .octl of version 8 opens as version 9 with nothing else changed", () => {
  const version8 = { solder: 8, "front-panel": [{ name: "Pt", typedef: { path: "PointTD.octl", strict: false } }] };
  assert.deepEqual(migrar(version8, MIGRATIONS, 9), { ...version8, solder: 9 });
});

// DT-107: version 10 gives an .octl its list of `objects` (type-definition.mjs reads a version 9 `object` as that list,
// test/core/type-definitions.test.mjs); an .ovi has nothing to change.
test("an .ovi of version 9 opens as version 10 with nothing else changed", () => {
  const version9 = { solder: 9, "front-panel": [{ name: "Pt", typedef: { path: "PointTD.octl", strict: false, "auto-update": false } }] };
  assert.deepEqual(migrar(version9, MIGRATIONS, 10), { ...version9, solder: 10 });
});

// DT-110: version 11 lets a string object say `"display": "codes"`; without it the object is in Normal Display.
test("an .ovi of version 10 opens as version 11 with nothing else changed", () => {
  assert.equal(VERSION, 11);
  const version10 = { solder: 10, "front-panel": [{ name: "s", role: "control", type: "string", default: "*IDN?\n" }] };
  assert.deepEqual(migrar(version10), { ...version10, solder: 11 });
});

test("a .sdp and a .sdproj of version 1 open unchanged and are saved as version 2; version 3 is refused", async () => {
  const Polymorphic = await import("../../core/model/polymorphic.mjs");
  const Project = await import("../../core/model/project.mjs");
  assert.deepEqual([Polymorphic.POLYMORPHIC_VERSION, Project.PROJECT_VERSION], [2, 2]);
  const polymorphic = Polymorphic.readPolymorphic({ "solder-polymorphic": 1, instances: [{ ovi: "Add I32.ovi" }] });
  assert.equal(JSON.parse(Polymorphic.writePolymorphic(polymorphic))["solder-polymorphic"], 2);
  assert.throws(() => Polymorphic.readPolymorphic({ "solder-polymorphic": 3, instances: [] }), Polymorphic.PolymorphicFileError);
  const blank = JSON.parse(Project.writeProject(Project.blankProject()));
  const project = Project.readProject({ ...blank, "solder-project": 1 });
  assert.deepEqual(JSON.parse(Project.writeProject(project)), blank);
  assert.throws(() => Project.readProject({ ...blank, "solder-project": 3 }), Project.ProjectFileError);
});
