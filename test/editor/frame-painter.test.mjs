// The values a Run sends are painted once per frame of the display (reports/2026-11-21-visual-faults-editor.md).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createFramePainter } from "../../editor/src/window/frame-painter.mjs";

/** A display whose frames come when the test says. */
function fakeDisplay() {
  let callbacks = [];
  return {
    requestFrame: (callback) => callbacks.push(callback),
    pending: () => callbacks.length,
    nextFrame() {
      const due = callbacks;
      callbacks = [];
      for (const callback of due) callback();
    },
  };
}

test("many requests before a frame give one paint at that frame", () => {
  const display = fakeDisplay();
  let paints = 0;
  const painter = createFramePainter({ paint: () => paints++, requestFrame: display.requestFrame });
  for (let message = 0; message < 5; message++) painter.request();
  assert.equal(paints, 0, "nothing is painted before the frame");
  assert.equal(display.pending(), 1, "one frame is asked for, not one per message");
  display.nextFrame();
  assert.equal(paints, 1);
  display.nextFrame();
  assert.equal(paints, 1, "a frame with nothing asked paints nothing");
});

test("each frame with a request paints again", () => {
  const display = fakeDisplay();
  let paints = 0;
  const painter = createFramePainter({ paint: () => paints++, requestFrame: display.requestFrame });
  for (let frame = 0; frame < 3; frame++) {
    painter.request();
    display.nextFrame();
  }
  assert.equal(paints, 3);
});

test("a paint for another reason before the frame leaves the frame nothing to do", () => {
  const display = fakeDisplay();
  let paints = 0;
  const painter = createFramePainter({ paint: () => paints++, requestFrame: display.requestFrame });
  painter.request();
  painter.painted();
  display.nextFrame();
  assert.equal(paints, 0);
  painter.request();
  display.nextFrame();
  assert.equal(paints, 1, "a request after it is still painted");
});

const windowSource = readFileSync(new URL("../../editor/src/window/editor-window.mjs", import.meta.url), "utf8");

test("the window paints a Run's values at the next frame, and the Block Diagram does not paint them", () => {
  const showValues = windowSource.slice(windowSource.indexOf("function mostrarValores("), windowSource.indexOf("const valuePainter"));
  assert.match(showValues, /if \(conDiagrama\) return void \(pan = \{ \.\.\.pan, valores: shown \}\);/);
  assert.match(showValues, /valuePainter\.request\(\);/);
  assert.doesNotMatch(showValues, /pintar\(/, "no paint per message");
});

test("a paint for values only does not send the docked window its menus again", () => {
  assert.match(windowSource, /createFramePainter\(\{ paint: \(\) => pintar\(\{ chromeChanged: false \}\)/);
  assert.match(windowSource, /if \(chromeChanged\) docking\?\.afterPaint\(\);/);
});
