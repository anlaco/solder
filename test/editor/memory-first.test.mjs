// A caller sees an open subOVI with its unsaved edits (GitHub issue #20; DT-045 §8: LabVIEW looks in memory first).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readHierarchyTexts, pathKey } from "../../editor/src/common/ovi-paths.mjs";
import { changesWhatCallersSee, memoryFirstReader } from "../../editor/electron/memory-first.mjs";
import { createRegistry, recordChange } from "../../editor/electron/ovi-registry.mjs";

const SUB_PATH = "/work/sub.ovi";
const ON_DISK = '{"saved": true}';
const EDITED = '{"saved": false}';
const disk = async (key) => (key === pathKey(SUB_PATH) ? ON_DISK : null);

test("an open OVI is read with its unsaved edits, before its file", async () => {
  const registry = createRegistry();
  const read = memoryFirstReader(registry, disk);
  assert.equal(await read(pathKey(SUB_PATH)), ON_DISK, "not open: the file");
  const { entry } = registry.open({ path: SUB_PATH, initialText: ON_DISK });
  assert.equal(await read(pathKey(SUB_PATH)), ON_DISK, "open but its windows have not reported its text yet: the file");
  recordChange(entry, ON_DISK);
  recordChange(entry, EDITED);
  assert.equal(await read(pathKey(SUB_PATH)), EDITED, "edited and not saved: what is in memory");
  registry.close(entry.id);
  assert.equal(await read(pathKey(SUB_PATH)), ON_DISK, "closed without saving: the file again");
});

test("an untitled OVI is never what a path leads to", async () => {
  const registry = createRegistry();
  const { entry } = registry.open({});
  recordChange(entry, EDITED);
  assert.equal(await memoryFirstReader(registry, disk)(pathKey(SUB_PATH)), ON_DISK);
});

test("the hierarchy a caller loads holds the open subOVI as edited", async () => {
  const registry = createRegistry();
  const { entry } = registry.open({ path: SUB_PATH });
  recordChange(entry, EDITED);
  const caller = JSON.stringify({ "block-diagram": { nodes: [{ name: "n1", type: "subvi", config: { vi: "sub.ovi" } }] } });
  const { texts } = await readHierarchyTexts(pathKey("/work/main.ovi"), caller, memoryFirstReader(registry, disk));
  assert.equal(texts[pathKey(SUB_PATH)], EDITED);
});

test("moving an OVI's windows is not an edit its callers need to hear of (DT-078)", () => {
  const at = (x) => JSON.stringify({ nodes: [], layout: { windows: { "front-panel": { x } } } });
  assert.equal(changesWhatCallersSee(at(10), at(20)), false);
  assert.equal(changesWhatCallersSee(at(10), JSON.stringify({ nodes: [1], layout: { windows: { "front-panel": { x: 10 } } } })), true);
  assert.equal(changesWhatCallersSee(null, at(10)), true, "the first text a window reports");
});

test("the main process reads subOVIs through memory, never straight from the disk", () => {
  const main = readFileSync(new URL("../../editor/electron/main.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(main, /readHierarchyTexts\([^)]*readTextOrNull/);
  assert.match(main, /readHierarchyTexts\(keyOf\(entry\), text, readOVIText, OVI_LIB\)/);
});
