// The keys that end the editing of a label, as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-15-label-enter.md): the main Enter types a new line, numpad Enter and Ctrl+Enter end.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Et from "../../editor/src/common/labels.mjs";

const key = (overrides) => ({ key: "Enter", code: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, ...overrides });

test("numpad Enter and Ctrl+Enter end a label's editing, the main Enter and Shift+Enter do not", () => {
  assert.equal(Et.endsLabelEdit(key({ code: "NumpadEnter" })), true);
  assert.equal(Et.endsLabelEdit(key({ ctrlKey: true })), true);
  assert.equal(Et.endsLabelEdit(key({})), false);
  assert.equal(Et.endsLabelEdit(key({ shiftKey: true })), false);
  assert.equal(Et.endsLabelEdit(key({ key: "a", code: "KeyA", ctrlKey: true })), false);
});

test("the main Enter types a new line into a label, as LabVIEW keeps it", () => {
  const typed = Et.teclear({ texto: "abc", todo: false }, "Enter");
  assert.equal(typed.texto, "abc\n");
});
