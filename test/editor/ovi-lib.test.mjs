// ovi.lib (DT-073): a caller names an OVI of Solder's own library by a symbolic `<ovilib>/…` path, resolved
// against the ovi.lib of the Solder that opens it, as LabVIEW stores `<vilib>\…` (measured,
// labview-captures/reports/2026-11-05-vilib-and-type-polymorphic.md §A); the hierarchy says "(ovi.lib)".

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as OviLib from "../../core/model/ovi-lib.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as Paths from "../../editor/src/common/vi-paths.mjs";
import * as SN from "../../editor/src/block-diagram/subvi-nodes.mjs";
import { assignPanelElement } from "../../core/model/connector.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { buildHierarchy } from "../../editor/src/window/hierarchy-client.mjs";
import { CAT, RAIZ, buildAdder, buildVI } from "../helpers.mjs";

const OVI_LIB = "/opt/solder/resources/ovi.lib";
const LIBRARY_OVI = `${OVI_LIB}/Utility/Add Two.sdg`;
const STORED = "<ovilib>/Utility/Add Two.sdg";

test("a <ovilib> path resolves against this Solder's ovi.lib, wherever the caller is", () => {
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.sdg", STORED, OVI_LIB), LIBRARY_OVI);
  assert.equal(Paths.resolveRelative(Paths.untitledKey(1), STORED, OVI_LIB), LIBRARY_OVI, "an untitled caller too");
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.sdg", "<ovilib>\\Utility\\Add Two.sdg", "C:\\Solder\\ovi.lib"), "C:/Solder/ovi.lib/Utility/Add Two.sdg", "with Windows separators");
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.sdg", STORED), STORED, "with no ovi.lib known, the path stays as it is and is not found");
  // An OVI inside ovi.lib that calls a sibling by a relative path finds it in ovi.lib.
  assert.equal(Paths.resolveRelative(LIBRARY_OVI, "Helper.sdg", OVI_LIB), `${OVI_LIB}/Utility/Helper.sdg`);
});

test("an OVI chosen inside ovi.lib is stored by its symbolic path, and no rebase moves it", () => {
  assert.equal(Paths.storedPathFor("/home/ana/vis/main.sdg", LIBRARY_OVI, OVI_LIB), STORED);
  assert.equal(Paths.storedPathFor(Paths.untitledKey(1), LIBRARY_OVI, OVI_LIB), STORED, "an untitled caller stores it symbolically too");
  assert.equal(Paths.storedPathFor("/home/ana/vis/main.sdg", "/home/ana/vis/lib/mine.sdg", OVI_LIB), "lib/mine.sdg", "a user's OVI stays relative");
  assert.equal(Paths.storedPathFor("/home/ana/vis/main.sdg", "/opt/solder/resources/ovi.libx/a.sdg", OVI_LIB), "../../../opt/solder/resources/ovi.libx/a.sdg", "a folder whose name only starts like ovi.lib's is not ovi.lib");
  assert.equal(Paths.rebaseStoredPath(STORED, Paths.untitledKey(1), "/home/ana/vis/main.sdg"), STORED, "first save");
  assert.equal(Paths.rebaseStoredPath(STORED, "/home/ana/vis/main.sdg", "/srv/other/copy.sdg"), STORED, "Save As elsewhere");
  const g = { nodos: [{ id: "n1", tipo: "subvi", name: "subvi_1", x: 0, y: 0, config: { vi: STORED } }], cables: [], siguiente: 2 };
  assert.equal(Paths.rebaseGraph(g, "/home/ana/vis/main.sdg", "/srv/copy.sdg"), g);
  const text = Q.aTexto(g, CAT);
  assert.equal(Paths.rebaseText(text, "/home/ana/vis/main.sdg", "/srv/copy.sdg"), text);
});

test("the hierarchy names an OVI of ovi.lib with (ovi.lib) after it, as LabVIEW says (vi.lib)", () => {
  assert.equal(OviLib.hierarchyName(LIBRARY_OVI, OVI_LIB), "Add Two.sdg (ovi.lib)");
  assert.equal(OviLib.hierarchyName("/home/ana/vis/lib/mine.sdg", OVI_LIB), "mine.sdg");
  assert.equal(OviLib.isOviLibPath(STORED), true);
  assert.equal(OviLib.isOviLibPath("lib/mine.sdg"), false);
});

/** The adder (x + y) with its connector, as the text of an OVI of ovi.lib. */
function libraryAdderText() {
  const { g, ids } = buildAdder();
  let withConnector = g;
  for (const [id, cell] of [[ids.x, 11], [ids.y, 9], [ids.sum, 2]]) withConnector = assignPanelElement(withConnector, CAT, id, cell);
  return Q.aTexto(withConnector, CAT);
}

test("a caller of an ovi.lib OVI reads its files through the symbolic path and runs it as any subOVI", async () => {
  const callerKey = "/home/ana/vis/main.sdg";
  const caller = (() => {
    const placed = Gr.crearNodo(Gr.nuevo(), CAT, "subvi", 100, 60);
    return Gr.fijarConfig(placed.g, placed.id, SN.subVIConfig(STORED));
  })();
  const reads = [];
  const { texts, missing } = await Paths.readHierarchyTexts(callerKey, Q.aTexto(caller, CAT), async (key) => (reads.push(key), key === LIBRARY_OVI ? libraryAdderText() : null), OVI_LIB);
  assert.deepEqual(reads, [LIBRARY_OVI]);
  assert.deepEqual(missing, []);

  const probe = buildHierarchy({ rootKey: callerKey, rootGraph: caller, texts, baseCatalog: CAT, readVI: Q.leer, oviLibRoot: OVI_LIB });
  assert.deepEqual(probe.errors, []);
  assert.deepEqual(probe.keys, [LIBRARY_OVI]);
  const callNode = caller.nodos[0];
  assert.deepEqual(probe.catalog.puertos(callNode).in.map((port) => port.name).sort(), ["control_1", "control_2"]);

  // Wired to two constants and an indicator, it runs.
  const wired = buildVI(probe.catalog, (b) => {
    b.node("two", "const", { value: 2 });
    b.node("five", "const", { value: 5 });
    b.node("call", "subvi", { vi: STORED });
    b.node("sum", "indicator");
    b.wire("two.result", "call.control_1");
    b.wire("five.result", "call.control_2");
    b.wire("call.indicator_1", "sum.value");
  });
  const { catalog } = buildHierarchy({ rootKey: callerKey, rootGraph: wired.g, texts, baseCatalog: CAT, readVI: Q.leer, oviLibRoot: OVI_LIB });
  const compiled = compilar(wired.g, catalog);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  assert.deepEqual(await ejecutar(compiled, {}), { [wired.id.sum]: 7 });

  const lost = buildHierarchy({ rootKey: callerKey, rootGraph: caller, texts: {}, baseCatalog: CAT, readVI: Q.leer, oviLibRoot: OVI_LIB });
  assert.match(lost.errors[0], /Add Two\.sdg" cannot be found/);
});

test("ovi.lib ships with the application, outside its archive", () => {
  assert.ok(existsSync(path.join(RAIZ, "ovi.lib")), "the folder is in the repository");
  const build = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")).build;
  assert.ok(build.extraResources.some((resource) => resource.from === "ovi.lib" && resource.to === "ovi.lib"));
  assert.match(readFileSync(path.join(RAIZ, "editor/electron/main.mjs"), "utf8"), /process\.resourcesPath, "ovi\.lib"/, "the installed application looks for it among its resources");
});
