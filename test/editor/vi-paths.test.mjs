// Where the subVIs of a VI are (DT-045, spec/05 §12): a caller stores the path
// of each subVI relative to its own file, and the absolute one while it has no
// file. Pure string work shared by the page and the main process.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as Paths from "../../editor/src/common/vi-paths.mjs";
import * as Q from "../../core/model/qvi-format.mjs";
import * as SN from "../../editor/src/block-diagram/subvi-nodes.mjs";
import { buildOviLibLocator } from "../../core/model/ovi-lib.mjs";
import { CAT, RAIZ } from "../helpers.mjs";

test("a path is resolved and written relative to a folder, on either kind of system", () => {
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.qvi", "lib/add2.qvi"), "/home/ana/vis/lib/add2.qvi");
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.qvi", "../shared/add2.qvi"), "/home/ana/shared/add2.qvi");
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.qvi", "/opt/add2.qvi"), "/opt/add2.qvi", "an absolute path stays");
  assert.equal(Paths.relativeBetween("/home/ana/vis", "/home/ana/shared/add2.qvi"), "../shared/add2.qvi");
  assert.equal(Paths.relativeBetween("/home/ana/vis", "/home/ana/vis/add2.qvi"), "add2.qvi");
  assert.equal(Paths.relativeBetween("/home/ana/vis", "/opt/add2.qvi"), "../../../opt/add2.qvi");
  // Windows: backslashes are read as slashes and a different disk cannot be reached relatively.
  assert.equal(Paths.resolveRelative("C:\\Users\\ana\\main.qvi", "lib\\add2.qvi"), "C:/Users/ana/lib/add2.qvi");
  assert.equal(Paths.relativeBetween("C:/Users/ana", "D:/vis/add2.qvi"), "D:/vis/add2.qvi");
  assert.equal(Paths.directoryOf(Paths.untitledKey(3)), "", "an untitled VI has no folder");
  assert.equal(Paths.isSavedKey(Paths.untitledKey(3)), false);
});

/** A caller graph with a subVI node that stores `stored`. */
const callerWith = (stored) => ({ g: { nodos: [{ id: "n1", tipo: "subvi", name: "subvi_1", x: 0, y: 0, config: { vi: stored } }], cables: [], siguiente: 2 } });

test("a caller that has never been saved stores the absolute path and converts it to relative when it is saved", () => {
  const chosen = "/home/ana/vis/lib/add2.qvi";
  // Placed from an untitled VI: absolute. Placed from a saved one: relative to it.
  assert.equal(Paths.storedPathFor(Paths.untitledKey(1), chosen), chosen);
  assert.equal(Paths.storedPathFor("/home/ana/vis/main.qvi", chosen), "lib/add2.qvi");

  // First save: the graph and the text the main process writes say the same.
  const { g } = callerWith(chosen);
  const saved = Paths.rebaseGraph(g, Paths.untitledKey(1), "/home/ana/vis/main.qvi");
  assert.equal(saved.nodos[0].config.vi, "lib/add2.qvi");
  assert.equal(Paths.rebaseGraph(saved, "/home/ana/vis/main.qvi", "/home/ana/vis/main.qvi"), saved, "saving again in the same place changes nothing");

  const text = Q.aTexto(g, CAT);
  const rebasedText = Paths.rebaseText(text, Paths.untitledKey(1), "/home/ana/vis/main.qvi");
  assert.equal(JSON.parse(rebasedText)["block-diagram"].nodes[0].config.vi, "lib/add2.qvi");
  assert.equal(Paths.rebaseText(rebasedText, "/home/ana/vis/main.qvi", "/home/ana/vis/main.qvi"), rebasedText, "the same text when nothing moves");
  assert.equal(Q.aTexto(saved, CAT), rebasedText, "the page and the main process write the same file");
});

test("Save As in another folder rebases the relative paths of the subVIs", () => {
  const from = "/home/ana/vis/main.qvi";
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, "/home/ana/other/copy.qvi"), "../vis/lib/add2.qvi");
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, "/home/ana/vis/copy.qvi"), "lib/add2.qvi");
  assert.equal(Paths.rebaseStoredPath("lib/add2.qvi", from, Paths.untitledKey(2)), "lib/add2.qvi", "no file, nothing to be relative to");
  // The path in the file and in the graph are rebased by the same rule.
  const { g } = callerWith("lib/add2.qvi");
  assert.equal(Paths.rebaseGraph(g, from, "/home/ana/other/copy.qvi").nodos[0].config.vi, "../vis/lib/add2.qvi");
  const text = Q.aTexto(g, CAT);
  assert.equal(JSON.parse(Paths.rebaseText(text, from, "/home/ana/other/copy.qvi"))["block-diagram"].nodes[0].config.vi, "../vis/lib/add2.qvi");
});

test("the files of a hierarchy are read from the paths its callers store", async () => {
  const caller = (stored) => Q.aTexto({ nodos: [{ id: "n1", tipo: "subvi", name: "subvi_1", x: 0, y: 0, config: { vi: stored } }], cables: [], siguiente: 2 }, CAT);
  const files = {
    "/vis/main.qvi": caller("lib/mid.qvi"),
    "/vis/lib/mid.qvi": caller("../deep/leaf.qvi"),
    "/vis/deep/leaf.qvi": caller("../lib/mid.qvi"),
  };
  const reads = [];
  const { texts, missing } = await Paths.readHierarchyTexts("/vis/main.qvi", files["/vis/main.qvi"], async (key) => (reads.push(key), files[key] ?? null));
  assert.deepEqual(Object.keys(texts).sort(), ["/vis/deep/leaf.qvi", "/vis/lib/mid.qvi"]);
  assert.deepEqual(reads, ["/vis/lib/mid.qvi", "/vis/deep/leaf.qvi"], "each file once, even with a cycle between them");
  assert.deepEqual(missing, []);

  const lonely = await Paths.readHierarchyTexts("/vis/a.qvi", caller("nowhere.qvi"), async () => null);
  assert.deepEqual(lonely, { texts: {}, missing: ["/vis/nowhere.qvi"] });
});

test("Open Front Panel names the absolute file of the subVI that a node stores relative to its caller", () => {
  const { g } = callerWith("lib/add2.qvi");
  assert.ok(SN.isSubVI(g.nodos[0]));
  assert.equal(Paths.resolveRelative("/home/ana/vis/main.qvi", g.nodos[0].config.vi), "/home/ana/vis/lib/add2.qvi");
  assert.equal(Paths.resolveRelative(Paths.untitledKey(1), "/opt/add2.qvi"), "/opt/add2.qvi", "an untitled caller stores it absolute");
});

// DT-094: an OVI is written as `.ovi`; the old `.sdg` (DT-051) and `.qvi` still open and, saved in place, keep their name.
test("Save As writes .ovi unless the chosen path already names an OVI file, of any of its extensions", () => {
  assert.equal(Paths.savePathFor("/vis/main"), "/vis/main.ovi");
  assert.equal(Paths.savePathFor("/vis/main.ovi"), "/vis/main.ovi");
  assert.equal(Paths.savePathFor("/vis/old.sdg"), "/vis/old.sdg", "an old name chosen on purpose is kept");
  assert.equal(Paths.savePathFor("/vis/older.qvi"), "/vis/older.qvi", "an old name chosen on purpose is kept");
  assert.equal(Paths.savePathFor("/vis/MAIN.OVI"), "/vis/MAIN.OVI", "in any case");
  assert.equal(Paths.saveAsProposal("/vis/old.sdg", "old.sdg"), "/vis/old.ovi", "an old file is offered under the new extension");
  assert.equal(Paths.saveAsProposal("/vis/older.qvi", "older.qvi"), "/vis/older.ovi");
  assert.equal(Paths.saveAsProposal(null, "Untitled 1"), "Untitled 1.ovi");
});

test("the three extensions name an OVI file, and the debugger and the error chain drop any of them", () => {
  assert.deepEqual(["a.ovi", "a.sdg", "a.qvi", "A.QVI", "a.sdt", "a.sdproj", "a.vi", "a.octl"].map(Paths.isVIFile), [true, true, true, true, false, false, false, false]);
  assert.deepEqual(["Parse Reply.ovi", "Parse Reply.sdg", "Parse Reply.qvi", "Parse Reply"].map(Paths.withoutVIExtension), ["Parse Reply", "Parse Reply", "Parse Reply", "Parse Reply"]);
});

// What Solder ships is renamed to `.ovi` (DT-094 §3); the fixtures of released betas keep the names they were saved with.
const SHIPPED_FOLDERS = ["examples", "ovi.lib", "addons"];

test("every OVI Solder ships is a .ovi and every subOVI it names is there", () => {
  const oviLib = buildOviLibLocator([path.join(RAIZ, "ovi.lib"), path.join(RAIZ, "addons/daq/1/ovi.lib")], (root) => readdirSync(root, { recursive: true }).map(String));
  const shipped = SHIPPED_FOLDERS.flatMap((folder) => readdirSync(path.join(RAIZ, folder), { recursive: true }).map((name) => path.join(RAIZ, folder, String(name))));
  const ovis = shipped.filter(Paths.isVIFile);
  assert.ok(ovis.length >= 30, "the examples, ovi.lib's OVIs and the DAQ add-on's");
  for (const file of ovis) {
    assert.ok(file.endsWith(Paths.VI_EXTENSION), `${file} has the new extension`);
    for (const stored of Paths.subVIPathsInFile(JSON.parse(readFileSync(file, "utf8")))) {
      assert.ok(stored.endsWith(Paths.VI_EXTENSION), `${file} calls ${stored} by its new name`);
      assert.ok(existsSync(Paths.resolveRelative(file, stored, oviLib)), `${file} calls ${stored}, which exists`);
    }
  }
});

test("a VI goes by its file name once saved, and by its Untitled name before", () => {
  assert.equal(Paths.viDisplayName(Paths.untitledKey(1), "Untitled 1"), "Untitled 1");
  assert.equal(Paths.viDisplayName("/home/ana/vis/dlg1.sdg", "Untitled 1"), "dlg1.sdg");
  assert.equal(Paths.viDisplayName("C:\\Users\\ana\\dlg1.sdg", "Untitled 1"), "dlg1.sdg");
});

test("the window names the VI by its current name, not the one it was opened with", () => {
  // Abort's tooltip kept saying `Abort execution of "Untitled 1"` after the VI was saved as dlg1.sdg
  // (labview-captures/reports/2026-10-29-editor-run-dialogs.md): the toolbar read the name the window
  // was opened with, which a Save does not change.
  const source = readFileSync(`${RAIZ}/editor/src/window/editor-window.mjs`, "utf8");
  const namesRead = source.match(/viInfo\.name/g) ?? [];
  assert.equal(namesRead.length, 1, "only currentVIName() reads the name the window was opened with");
  assert.match(source, /const currentVIName = \(\) => Paths\.viDisplayName\(viKey, viInfo\.name\)/);
});
