// DT-107: the control editors a user opens to make a new control, measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-25-project-new-type-definition.md, -new-custom-control.md, -empty-and-multi-control.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTROL_EDITOR_WINDOW_SIZE, MADE_TYPE_DEFINITION_WINDOW_SIZE, NEW_CONTROL_WAYS, controlEditorPosition, customizedControlEntry, followFirstObject, newControlEntry } from "../../editor/electron/new-controls.mjs";
import { ENTRY_KINDS, createRegistry, isDirty, recordChange, windowTitle } from "../../editor/electron/ovi-registry.mjs";
import { readTypeDefinition, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { CAT } from "../helpers.mjs";

const NUMERIC = { tipo: "control", label: { text: "Numeric" }, config: { type: "number" }, x: 31, y: 109 };

/** An entry of the registry made the way `made` says, with the text its page reports first (its saved version). */
function openedEntry(made) {
  const { entry } = createRegistry().open({ kind: ENTRY_KINDS.CONTROL, initialText: made.text });
  const { text, ...behavior } = made;
  Object.assign(entry, behavior);
  recordChange(entry, text);
  return entry;
}

test("each way in opens an empty editor with its ring, and its title says the kind LabVIEW's does", () => {
  const rings = Object.values(NEW_CONTROL_WAYS).map((way) => readTypeDefinition(newControlEntry(way).text, CAT));
  assert.deepEqual(rings.map((read) => [read.kind, read.objects.length]), [["type-def", 0], ["control", 0], ["type-def", 0]]);
  const titles = Object.values(NEW_CONTROL_WAYS).map((way) => windowTitle(openedEntry(newControlEntry(way)), "control-editor"));
  // Project New ▸ Type Definition: "Control 1 Control" with the ring at Type Def. (Q1); File ▸ New... Custom Control and Type Definition (Q1, Q4).
  assert.deepEqual(titles, ["Control 1 Control", "Control 1 Control", "Control 1 Type Def"], "an empty new one has no asterisk");
  assert.throws(() => newControlEntry("xcontrol"));
});

test("a new control is unsaved once edited; a customized copy and a Make Type Def. one are unsaved at once", () => {
  const entry = openedEntry(newControlEntry(NEW_CONTROL_WAYS.CUSTOM_CONTROL));
  assert.equal(isDirty(entry), false, "so an empty one closes with no question (new-custom-control.md Q2)");
  recordChange(entry, typeDefinitionText("control", [NUMERIC]));
  assert.equal(windowTitle(entry, "control-editor"), "Control 1 Control *", "the ring stays Control, only the asterisk comes (Q5)");
  const customized = openedEntry(customizedControlEntry(NUMERIC));
  assert.equal(windowTitle(customized, "control-editor"), "Control 1 Control *", "Customize Control... (Q3)");
  assert.deepEqual(readTypeDefinition(customized.current, CAT).objects.map((object) => object.label.text), ["Numeric"], "it holds the copy");
});

test("a project's new type definition takes its ring into its title with its first object, and keeps it after", () => {
  const entry = openedEntry(newControlEntry(NEW_CONTROL_WAYS.PROJECT_TYPE_DEFINITION));
  assert.equal(followFirstObject(entry, typeDefinitionText("type-def", [])), false, "still empty");
  const withObject = typeDefinitionText("type-def", [NUMERIC]);
  recordChange(entry, withObject);
  assert.equal(followFirstObject(entry, withObject), true);
  assert.equal(windowTitle(entry, "control-editor"), "Control 1 Type Def *", "Q2");
  recordChange(entry, typeDefinitionText("control", [NUMERIC]));
  assert.equal(followFirstObject(entry, typeDefinitionText("control", [NUMERIC])), false, "the title keeps its kind until reopened, as any editor's");
});

test("a new or opened control editor is 1092 × 697 and Make Type Def.'s 616 × 413, with their title bars", () => {
  assert.deepEqual([CONTROL_EDITOR_WINDOW_SIZE.width, CONTROL_EDITOR_WINDOW_SIZE.height + 33], [1092, 697]);
  assert.deepEqual([MADE_TYPE_DEFINITION_WINDOW_SIZE.width, MADE_TYPE_DEFINITION_WINDOW_SIZE.height + 33], [616, 413]);
});

test("control editors cascade +49, +30 from one to the next, as LabVIEW's", () => {
  const origin = { x: 40, y: 40 };
  assert.deepEqual([0, 1, 2].map((open) => controlEditorPosition(origin, open)), [{ x: 40, y: 40 }, { x: 89, y: 70 }, { x: 138, y: 100 }]);
});

test("the main process imports every function of new-controls.mjs it uses", async () => {
  // Found under Xvfb on 2026-11-25: a name used in main.mjs and missing from its import broke every control editor at
  // once, and no test loads main.mjs (it needs Electron).
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("../../editor/electron/main.mjs", import.meta.url), "utf8");
  const importLine = main.match(/import \{([^}]*)\} from "\.\/new-controls\.mjs";/);
  assert.ok(importLine, "main.mjs imports new-controls.mjs");
  const imported = new Set(importLine[1].split(",").map((name) => name.trim()));
  const exported = Object.keys(await import("../../editor/electron/new-controls.mjs"));
  const body = main.replace(importLine[0], "");
  const used = exported.filter((name) => new RegExp(`\\b${name}\\b`).test(body));
  assert.deepEqual(used.filter((name) => !imported.has(name)), []);
});
