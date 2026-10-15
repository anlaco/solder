// Where the windows of a VI go and what Ctrl+E and Ctrl+T do, as measured in
// LabVIEW 2026 Q3 (labview-captures/editor-checks/REPORT.md §4 and §7).

import assert from "node:assert/strict";
import { test } from "node:test";

import { CASCADE_STEP, DIAGRAM_OFFSET, NEW_VI_SIZE, newVIBounds, otherWindowKind, tiledBounds } from "../../editor/electron/window-layout.mjs";
import { CTRL_SHORTCUT_COMMANDS, commandForCtrlKey } from "../../editor/src/window/shortcuts.mjs";

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };

test("a new VI opens its Front Panel in front and its Block Diagram 49 px left and 30 px up, both 1090 x 696", () => {
  const { "front-panel": panel, "block-diagram": diagram } = newVIBounds(SCREEN, 0);
  assert.deepEqual([panel.width, panel.height, diagram.width, diagram.height], [1090, 696, 1090, 696]);
  assert.deepEqual([diagram.x - panel.x, diagram.y - panel.y], [-49, -30]);
  assert.deepEqual([NEW_VI_SIZE.width, NEW_VI_SIZE.height, DIAGRAM_OFFSET.x, DIAGRAM_OFFSET.y], [1090, 696, -49, -30]);
  // LabVIEW put the panel at (527, 153) on a 1920 x 1080 screen.
  assert.ok(Math.abs(panel.x - 527) <= 5 && Math.abs(panel.y - 153) <= 15, `the panel is where LabVIEW put it: ${panel.x}, ${panel.y}`);
});

test("on a screen smaller than the pair, both windows are scaled down to fit", () => {
  const small = { x: 0, y: 0, width: 800, height: 500 };
  const { "front-panel": panel, "block-diagram": diagram } = newVIBounds(small, 0);
  for (const place of [panel, diagram]) {
    assert.ok(place.x >= 0 && place.y >= 0 && place.x + place.width <= small.width && place.y + place.height <= small.height, JSON.stringify(place));
  }
  assert.ok(panel.width < NEW_VI_SIZE.width && panel.height < NEW_VI_SIZE.height);
  assert.equal(panel.width, diagram.width);
});

test("each VI opened after the first sits one cascade step down and right of the one before", () => {
  const [first, second, third] = [0, 1, 2].map((index) => newVIBounds(SCREEN, index)["front-panel"]);
  assert.deepEqual([second.x - first.x, second.y - first.y], [CASCADE_STEP, CASCADE_STEP]);
  assert.deepEqual([third.x - second.x, third.y - second.y], [CASCADE_STEP, CASCADE_STEP]);
  const far = newVIBounds(SCREEN, 100)["front-panel"];
  assert.ok(far.x + far.width <= SCREEN.width && far.y + far.height <= SCREEN.height, "the cascade never leaves the screen");
});

test("Tile Left and Right puts the Front Panel on the left and the Block Diagram on the right, side by side", () => {
  const { "front-panel": panel, "block-diagram": diagram } = tiledBounds({ x: 0, y: 0, width: 1920, height: 1024 });
  // Measured: panel x 12..950 and diagram x 970..1908, each full height.
  assert.deepEqual([panel.x, panel.x + panel.width, diagram.x, diagram.x + diagram.width], [12, 950, 970, 1908]);
  assert.deepEqual([panel.y, diagram.y, panel.height, diagram.height], [3, 3, 1018, 1018]);
});

test("Ctrl+E goes to the other window of the VI, from either", () => {
  assert.equal(otherWindowKind("front-panel"), "block-diagram");
  assert.equal(otherWindowKind("block-diagram"), "front-panel");
  assert.equal(commandForCtrlKey("e"), "toggle-window");
  assert.equal(commandForCtrlKey("E"), "toggle-window");
});

// Spec/05 rules 101 and 102; Ctrl+W was once reported not to close the VI and did not reproduce
// (labview-captures/reports/2026-10-15-solder-ctrl-w.md): the question it asks is a native window.
test("Ctrl+N makes a new VI and Ctrl+W closes, in either case", () => {
  assert.equal(commandForCtrlKey("w"), "close");
  assert.equal(commandForCtrlKey("W"), "close");
  assert.equal(commandForCtrlKey("n"), "new-vi");
});

test("Ctrl+T tiles the windows and the older shortcuts are still there", () => {
  assert.equal(commandForCtrlKey("t"), "tile-left-and-right");
  assert.deepEqual(
    ["s", "o", "q", "i", "d", "l"].map(commandForCtrlKey),
    ["save", "open", "exit", "vi-properties", "debug-window", "error-list"],
  );
  assert.equal(commandForCtrlKey("j"), undefined);
  assert.ok(Object.keys(CTRL_SHORTCUT_COMMANDS).includes("e"));
});

test("Ctrl+N is New VI and Ctrl+W is Close, as in LabVIEW's File menu", () => {
  assert.equal(commandForCtrlKey("n"), "new-vi");
  assert.equal(commandForCtrlKey("W"), "close");
});
