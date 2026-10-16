// The .sdg format is frozen as version 1 from 0.4.0-beta on (DT-055, spec/02 §4.1): every file a
// released Solder saved still opens. test/fixtures/released/<version>/ keeps the example VIs as each
// release saved them; each top-level VI must load with its subVIs and compile, and a newer format
// version must be refused, not read halfway.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { loadHierarchy } from "../../core/model/hierarchy.mjs";
import { ErrorQvi, VERSION, aTexto, leer, migrar } from "../../core/model/qvi-format.mjs";
import { CAT, RAIZ } from "../helpers.mjs";

const RELEASED = path.join(RAIZ, "test", "fixtures", "released");
/** The VIs an example opens at the top; the rest of its folder are its subVIs. */
const TOP_LEVEL = ["Instrument Protocol", "Oven Controller", "Temperature Monitor"];

const filesOf = (folder) => readdirSync(folder, { recursive: true }).filter((file) => /\.(qvi|sdg)$/.test(file)).map((file) => path.join(folder, file));

for (const release of readdirSync(RELEASED)) {
  test(`the VIs saved by ${release} open and compile`, () => {
    const files = filesOf(path.join(RELEASED, release));
    assert.ok(files.length > 0, `${release} keeps its files`);
    for (const file of files.filter((candidate) => TOP_LEVEL.includes(path.basename(candidate, path.extname(candidate))))) {
      const hierarchy = loadHierarchy(file, CAT, {
        resolvePath: (caller, relative) => path.resolve(path.dirname(caller), relative),
        loadVI: (key, viCatalog) => leer(readFileSync(key, "utf8"), viCatalog),
      });
      assert.deepEqual(hierarchy.errors, [], `${release}/${path.basename(file)} loads with its subVIs`);
      const { g, cat } = hierarchy.vis.get(hierarchy.root);
      assert.equal(compilar(g, cat).errores, undefined, `${release}/${path.basename(file)} compiles`);
      // Saved again, each VI of the hierarchy is written in the current version.
      for (const [key, vi] of hierarchy.vis) assert.equal(JSON.parse(aTexto(vi.g, vi.cat)).solder, VERSION, path.basename(key));
    }
  });
}

test("a file of a newer format version is refused, and an older one is migrated step by step", () => {
  const newer = { ...JSON.parse(readFileSync(filesOf(path.join(RELEASED, "0.4.0-beta"))[0], "utf8")), solder: VERSION + 1 };
  assert.throws(() => leer(newer, CAT), ErrorQvi);
  const steps = [(vi) => ({ ...vi, solder: 2, first: true }), (vi) => ({ ...vi, solder: 3, second: vi.first })];
  assert.deepEqual(migrar({ solder: 1 }, steps, 3), { solder: 3, first: true, second: true });
});
