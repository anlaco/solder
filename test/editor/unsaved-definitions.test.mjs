// Saving an OVI that follows a type definition made by Make Type Def. and never saved (measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-22-control-editor-window.md, "Ctrl+S on the VI with the typedef untitled"): LabVIEW
// asks '"p1.vi" refers to new, unsaved files…' (Yes / Cancel), names each definition ("Name the Control (Control 1)")
// and then saves the VI, whose objects follow the files. Before DT-104 stage a3 Solder wrote the untitled key into the
// `.ovi`, a link to nothing once the editor closed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createSaveGuard, createTextWaiters, newUnsavedFilesText, saveUntitledDefinitionsFirst, untitledDefinitionsOf } from "../../editor/electron/unsaved-files.mjs";
import { rebaseText, relinkTypeDefinitionText, typeDefinitionPathsInFile } from "../../editor/src/common/ovi-paths.mjs";

/** An `.ovi` text with a panel cluster and a constant that follow the given type definition paths. */
const oviFollowing = (panelPath, constantPath) =>
  `${JSON.stringify(
    {
      "front-panel": [{ id: "c1", type: "cluster-control", typedef: { path: panelPath, strict: false } }],
      "block-diagram": [{ id: "k1", type: "num-const", config: { typedef: { path: constantPath, strict: false } } }],
    },
    null,
    2,
  )}\n`;

test("the untitled definitions an OVI follows are found once each, in order; saved ones and polymorphic OVIs have none", () => {
  assert.deepEqual(untitledDefinitionsOf(oviFollowing("untitled:4", "untitled:4")), ["untitled:4"]);
  assert.deepEqual(untitledDefinitionsOf(oviFollowing("untitled:4", "untitled:7")), ["untitled:4", "untitled:7"]);
  assert.deepEqual(untitledDefinitionsOf(oviFollowing("Point.octl", "../types/Point.octl")), []);
  assert.deepEqual(untitledDefinitionsOf(`${JSON.stringify({ "solder-polymorphic": 1, instances: [] })}\n`), []);
  assert.deepEqual(untitledDefinitionsOf("not json"), []);
});

test("the question is LabVIEW's, named after the OVI", () => {
  assert.deepEqual(newUnsavedFilesText("p1.ovi"), {
    title: "",
    message: '"p1.ovi" refers to new, unsaved files. You must save these files in order to save "p1.ovi".',
    detail: "Do you want to save the new, unsaved files?",
  });
});

test("with no untitled definition the OVI is saved as it is, and nothing is asked", async () => {
  const text = oviFollowing("Point.octl", "Point.octl");
  const steps = [];
  const record = (step) => async () => (steps.push(step), null);
  const saved = await saveUntitledDefinitionsFirst(text, { ownerName: "p1.ovi", ask: record("ask"), saveDefinition: record("save"), followSaved: record("follow") });
  assert.equal(saved, text);
  assert.deepEqual(steps, []);
});

test("Yes saves each untitled definition, in order, and then gives the text that follows their files", async () => {
  const steps = [];
  const saved = await saveUntitledDefinitionsFirst(oviFollowing("untitled:4", "untitled:7"), {
    ownerName: "p1.ovi",
    ask: async (question) => (steps.push(["ask", question.message]), true),
    saveDefinition: async (key) => (steps.push(["save", key]), `/work/${key.slice("untitled:".length)}.octl`),
    followSaved: async (text, moves) => (steps.push(["follow", moves]), "followed"),
  });
  assert.equal(saved, "followed");
  assert.deepEqual(steps, [
    ["ask", newUnsavedFilesText("p1.ovi").message],
    ["save", "untitled:4"],
    ["save", "untitled:7"],
    ["follow", [["untitled:4", "/work/4.octl"], ["untitled:7", "/work/7.octl"]]],
  ]);
});

test("Cancel, or cancelling a definition's save, leaves the OVI unsaved", async () => {
  const text = oviFollowing("untitled:4", "untitled:7");
  const never = async () => assert.fail("must not be reached");
  assert.equal(await saveUntitledDefinitionsFirst(text, { ownerName: "p1.ovi", ask: async () => false, saveDefinition: never, followSaved: never }), null);
  const savedKeys = [];
  const cancelSecond = async (key) => (savedKeys.push(key), key === "untitled:7" ? null : "/work/4.octl");
  assert.equal(await saveUntitledDefinitionsFirst(text, { ownerName: "p1.ovi", ask: async () => true, saveDefinition: cancelSecond, followSaved: never }), null);
  assert.deepEqual(savedKeys, ["untitled:4", "untitled:7"]);
});

test("an OVI with no page follows the saved file, stored relative to the OVI once it is rebased", () => {
  const relinked = relinkTypeDefinitionText(oviFollowing("untitled:4", "untitled:7"), "untitled:4", "/work/types/Point.octl");
  assert.deepEqual(typeDefinitionPathsInFile(JSON.parse(relinked)), ["/work/types/Point.octl", "untitled:7"]);
  const written = rebaseText(relinked, "/work/main.ovi", "/work/main.ovi");
  assert.deepEqual(typeDefinitionPathsInFile(JSON.parse(written)), ["types/Point.octl", "untitled:7"]);
  const unrelated = oviFollowing("Point.octl", "Point.octl");
  assert.equal(relinkTypeDefinitionText(unrelated, "untitled:4", "/work/Point.octl"), unrelated);
});

test("a save waits for the page's next report that follows the files, and gives up after its time", async () => {
  const waiters = createTextWaiters();
  const entry = { current: oviFollowing("untitled:4", "untitled:4") };
  const followsFiles = (current) => untitledDefinitionsOf(current).length === 0;
  const waiting = waiters.until(entry, followsFiles, 1000);
  entry.current = oviFollowing("untitled:4", "Point.octl");
  waiters.changed(entry);
  entry.current = oviFollowing("Point.octl", "Point.octl");
  waiters.changed(entry);
  assert.equal(await waiting, true);
  assert.equal(await waiters.until(entry, followsFiles, 1000), true, "already followed: resolved at once");
  const stuck = { current: oviFollowing("untitled:4", "untitled:4") };
  assert.equal(await waiters.until(stuck, followsFiles, 10), false);
});

test("every save of an OVI, and of one closed with Defer Decision, goes through the question; the dialog names the control", () => {
  const main = readFileSync(new URL("../../editor/electron/main.mjs", import.meta.url), "utf8");
  const asksBeforeWriting = (name) => {
    const body = main.slice(main.indexOf(`async function ${name}(`), main.indexOf("\n}\n", main.indexOf(`async function ${name}(`)));
    const asked = body.indexOf("saveDefinitionsItFollows(");
    return asked >= 0 && asked < body.indexOf("writeFile(");
  };
  assert.ok(asksBeforeWriting("askAndWriteOVI"), "askAndWriteOVI asks before it writes");
  assert.ok(asksBeforeWriting("saveDeferred"), "saveDeferred asks before it writes");
  assert.match(main, /textWaiters\.changed\(open\.entry\)/, "the page's reports reach the waiting saves");
  assert.match(main, /`Name the Control \(\$\{oviName\(entry\)\}\)`/);
});

test("Ctrl+S pressed again while a save is asking does not stack another question for the same OVI", async () => {
  const guard = createSaveGuard();
  const entry = {};
  const other = {};
  let asked = 0;
  let answer;
  const question = () => new Promise((resolve) => { asked += 1; answer = resolve; });
  const first = guard.runOnce(entry, question);
  assert.equal(await guard.runOnce(entry, question), null, "the second press is a cancelled save");
  assert.equal(await guard.runOnce(entry, question), null);
  assert.equal(asked, 1, "one question open");
  const another = guard.runOnce(other, async () => "other saved");
  assert.equal(await another, "other saved", "another OVI saves meanwhile");
  answer("saved");
  assert.equal(await first, "saved");
  const second = guard.runOnce(entry, question);
  assert.equal(asked, 2, "once the first is answered a new save asks again");
  answer("x");
  await second;
  const failing = guard.runOnce(entry, async () => { throw new Error("disk full"); });
  await assert.rejects(failing, /disk full/);
  assert.equal(await guard.runOnce(entry, async () => "again"), "again", "a failed save does not lock the OVI");
  assert.match(readFileSync(new URL("../../editor/electron/main.mjs", import.meta.url), "utf8"), /function writeOVI\(open, owner, text, saveAs\) \{\n  return saveGuard\.runOnce\(open\.entry, /, "every save goes through the guard");
});
