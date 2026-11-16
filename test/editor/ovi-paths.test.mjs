// Where the subOVIs of an OVI are (DT-045, spec/05 §12): a caller stores the path
// of each subOVI relative to its own file, and the absolute one while it has no
// file. Pure string work shared by the page and the main process.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Paths from "../../editor/src/common/ovi-paths.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SN from "../../editor/src/block-diagram/subovi-nodes.mjs";
import { buildOviLibLocator } from "../../core/model/ovi-lib.mjs";
import { CAT, RAIZ } from "../helpers.mjs";

test("a path is resolved and written relative to a folder, on either kind of system", () => {
  assert.equal(Paths.resolveRelative("/home/ana/ovis/main.qvi", "lib/add2.qvi"), "/home/ana/ovis/lib/add2.qvi");
  assert.equal(Paths.resolveRelative("/home/ana/ovis/main.qvi", "../shared/add2.qvi"), "/home/ana/shared/add2.qvi");
  assert.equal(Paths.resolveRelative("/home/ana/ovis/main.qvi", "/opt/add2.qvi"), "/opt/add2.qvi", "an absolute path stays");
  assert.equal(Paths.relativeBetween("/home/ana/ovis", "/home/ana/shared/add2.qvi"), "../shared/add2.qvi");
  assert.equal(Paths.relativeBetween("/home/ana/ovis", "/home/ana/ovis/add2.qvi"), "add2.qvi");
  assert.equal(Paths.relativeBetween("/home/ana/ovis", "/opt/add2.qvi"), "../../../opt/add2.qvi");
  // Windows: backslashes are read as slashes and a different disk cannot be reached relatively.
  assert.equal(Paths.resolveRelative("C:\\Users\\ana\\main.qvi", "lib\\add2.qvi"), "C:/Users/ana/lib/add2.qvi");
  assert.equal(Paths.relativeBetween("C:/Users/ana", "D:/ovis/add2.qvi"), "D:/ovis/add2.qvi");
  assert.equal(Paths.directoryOf(Paths.untitledKey(3)), "", "an untitled VI has no folder");
  assert.equal(Paths.isSavedKey(Paths.untitledKey(3)), false);
});

/** A caller graph with a subOVI node that stores `stored`. */
const callerWith = (stored) => ({ g: { nodos: [{ id: "n1", tipo: "subvi", name: "subvi_1", x: 0, y: 0, config: { vi: stored } }], cables: [], siguiente: 2 } });

test("a caller that has never been saved stores the absolute path and converts it to relative when it is saved", () => {
  const chosen = "/home/ana/ovis/lib/add2.qvi";
  // Placed from an untitled OVI: absolute. Placed from a saved one: relative to it.
  assert.equal(Paths.storedPathFor(Paths.untitledKey(1), chosen), chosen);
  assert.equal(Paths.storedPathFor("/home/ana/ovis/main.qvi", chosen), "lib/add2.qvi");

  // First save: the graph and the text the main process writes say the same.
  const { g } = callerWith(chosen);
  const saved = Paths.rebaseGraph(g, Paths.untitledKey(1), "/home/ana/ovis/main.qvi");
  assert.equal(saved.nodos[0].config.vi, "lib/add2.qvi");
  assert.equal(Paths.rebaseGraph(saved, "/home/ana/ovis/main.qvi", "/home/ana/ovis/main.qvi"), saved, "saving again in the same place changes nothing");

  const text = Q.aTexto(g, CAT);
  const rebasedText = Paths.rebaseText(text, Paths.untitledKey(1), "/home/ana/ovis/main.qvi");
  assert.equal(JSON.parse(rebasedText)["block-diagram"].nodes[0].config.vi, "lib/add2.qvi");
  assert.equal(Paths.rebaseText(rebasedText, "/home/ana/ovis/main.qvi", "/home/ana/ovis/main.qvi"), rebasedText, "the same text when nothing moves");
  assert.equal(Q.aTexto(saved, CAT), rebasedText, "the page and the main process write the same file");
});

test("Save As in another folder rebases the relative paths of the subOVIs", () => {
  const from = "/home/ana/ovis/main.qvi";
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, "/home/ana/other/copy.qvi"), "../ovis/lib/add2.qvi");
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, "/home/ana/ovis/copy.qvi"), "lib/add2.qvi");
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, Paths.untitledKey(2)), "lib/add2.qvi", "no file, nothing to be relative to");
  // The path in the file and in the graph are rebased by the same rule.
  const { g } = callerWith("lib/add2.qvi");
  assert.equal(Paths.rebaseGraph(g, from, "/home/ana/other/copy.qvi").nodos[0].config.vi, "../ovis/lib/add2.qvi");
  const text = Q.aTexto(g, CAT);
  assert.equal(JSON.parse(Paths.rebaseText(text, from, "/home/ana/other/copy.qvi"))["block-diagram"].nodes[0].config.vi, "../ovis/lib/add2.qvi");
});

test("the files of a hierarchy are read from the paths its callers store", async () => {
  const caller = (stored) => Q.aTexto({ nodos: [{ id: "n1", tipo: "subvi", name: "subvi_1", x: 0, y: 0, config: { vi: stored } }], cables: [], siguiente: 2 }, CAT);
  const files = {
    "/ovis/main.qvi": caller("lib/mid.qvi"),
    "/ovis/lib/mid.qvi": caller("../deep/leaf.qvi"),
    "/ovis/deep/leaf.qvi": caller("../lib/mid.qvi"),
  };
  const reads = [];
  const { texts, missing } = await Paths.readHierarchyTexts("/ovis/main.qvi", files["/ovis/main.qvi"], async (key) => (reads.push(key), files[key] ?? null));
  assert.deepEqual(Object.keys(texts).sort(), ["/ovis/deep/leaf.qvi", "/ovis/lib/mid.qvi"]);
  assert.deepEqual(reads, ["/ovis/lib/mid.qvi", "/ovis/deep/leaf.qvi"], "each file once, even with a cycle between them");
  assert.deepEqual(missing, []);

  const lonely = await Paths.readHierarchyTexts("/ovis/a.qvi", caller("nowhere.qvi"), async () => null);
  assert.deepEqual(lonely, { texts: {}, missing: ["/ovis/nowhere.qvi"] });
});

test("Open Front Panel names the absolute file of the subOVI that a node stores relative to its caller", () => {
  const { g } = callerWith("lib/add2.qvi");
  assert.ok(SN.isSubOVI(g.nodos[0]));
  assert.equal(Paths.resolveRelative("/home/ana/ovis/main.qvi", g.nodos[0].config.vi), "/home/ana/ovis/lib/add2.qvi");
  assert.equal(Paths.resolveRelative(Paths.untitledKey(1), "/opt/add2.qvi"), "/opt/add2.qvi", "an untitled caller stores it absolute");
});

// DT-094: an OVI is written as `.ovi`; the old `.sdg` (DT-051) and `.qvi` still open and, saved in place, keep their name.
test("Save As writes .ovi unless the chosen path already names an OVI file, of any of its extensions", () => {
  assert.equal(Paths.savePathFor("/ovis/main"), "/ovis/main.ovi");
  assert.equal(Paths.savePathFor("/ovis/main.ovi"), "/ovis/main.ovi");
  assert.equal(Paths.savePathFor("/ovis/old.sdg"), "/ovis/old.sdg", "an old name chosen on purpose is kept");
  assert.equal(Paths.savePathFor("/ovis/older.qvi"), "/ovis/older.qvi", "an old name chosen on purpose is kept");
  assert.equal(Paths.savePathFor("/ovis/MAIN.OVI"), "/ovis/MAIN.OVI", "in any case");
  assert.equal(Paths.saveAsProposal("/ovis/old.sdg", "old.sdg"), "/ovis/old.ovi", "an old file is offered under the new extension");
  assert.equal(Paths.saveAsProposal("/ovis/older.qvi", "older.qvi"), "/ovis/older.ovi");
  assert.equal(Paths.saveAsProposal(null, "Untitled 1"), "Untitled 1.ovi");
});

test("the three extensions name an OVI file, and the debugger and the error chain drop any of them", () => {
  assert.deepEqual(["a.ovi", "a.sdg", "a.qvi", "A.QVI", "a.sdt", "a.sdproj", "a.vi", "a.octl"].map(Paths.isOVIFile), [true, true, true, true, false, false, false, false]);
  assert.deepEqual(["Parse Reply.ovi", "Parse Reply.sdg", "Parse Reply.qvi", "Parse Reply"].map(Paths.withoutOVIExtension), ["Parse Reply", "Parse Reply", "Parse Reply", "Parse Reply"]);
});

// What Solder ships is renamed to `.ovi` (DT-094 §3); the fixtures of released betas keep the names they were saved with.
const SHIPPED_FOLDERS = ["examples", "ovi.lib", "addons"];

test("every OVI Solder ships is a .ovi and every subOVI it names is there", () => {
  const oviLib = buildOviLibLocator([path.join(RAIZ, "ovi.lib"), path.join(RAIZ, "addons/daq/1/ovi.lib")], (root) => readdirSync(root, { recursive: true }).map(String));
  const shipped = SHIPPED_FOLDERS.flatMap((folder) => readdirSync(path.join(RAIZ, folder), { recursive: true }).map((name) => path.join(RAIZ, folder, String(name))));
  const ovis = shipped.filter(Paths.isOVIFile);
  assert.ok(ovis.length >= 30, "the examples, ovi.lib's OVIs and the DAQ add-on's");
  for (const file of ovis) {
    assert.ok(file.endsWith(Paths.OVI_EXTENSION), `${file} has the new extension`);
    for (const stored of Paths.subOVIPathsInFile(JSON.parse(readFileSync(file, "utf8")))) {
      assert.ok(stored.endsWith(Paths.OVI_EXTENSION), `${file} calls ${stored} by its new name`);
      assert.ok(existsSync(Paths.resolveRelative(file, stored, oviLib)), `${file} calls ${stored}, which exists`);
    }
  }
});

test("a VI goes by its file name once saved, and by its Untitled name before", () => {
  assert.equal(Paths.oviDisplayName(Paths.untitledKey(1), "Untitled 1"), "Untitled 1");
  assert.equal(Paths.oviDisplayName("/home/ana/ovis/dlg1.sdg", "Untitled 1"), "dlg1.sdg");
  assert.equal(Paths.oviDisplayName("C:\\Users\\ana\\dlg1.sdg", "Untitled 1"), "dlg1.sdg");
});

test("the window names the VI by its current name, not the one it was opened with", () => {
  // Abort's tooltip kept saying `Abort execution of "Untitled 1"` after the OVI was saved as dlg1.sdg
  // (labview-captures/reports/2026-10-29-editor-run-dialogs.md): the toolbar read the name the window
  // was opened with, which a Save does not change.
  const source = readFileSync(`${RAIZ}/editor/src/window/editor-window.mjs`, "utf8");
  const namesRead = source.match(/oviInfo\.name/g) ?? [];
  assert.equal(namesRead.length, 1, "only currentOVIName() reads the name the window was opened with");
  assert.match(source, /const currentOVIName = \(\) => Paths\.oviDisplayName\(oviKey, oviInfo\.name\)/);
});
