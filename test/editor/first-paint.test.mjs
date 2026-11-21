// A page's window is shown once the page has painted, not blank before (reports/2026-11-21-visual-faults-editor.md).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { UNPAINTED_PAGE_DEADLINE_MS, createFirstPaintGate } from "../../editor/electron/first-paint.mjs";

/** A clock whose timers run when the test says. */
function fakeTimers() {
  const timers = [];
  return { setTimer: (callback, ms) => timers.push({ callback, ms }), runAll: () => timers.splice(0).forEach((timer) => timer.callback()), timers };
}

test("loading the HTML does not show the window: the first paint does, once", () => {
  const clock = fakeTimers();
  let shown = 0;
  const gate = createFirstPaintGate({ onReady: () => shown++, setTimer: clock.setTimer });
  gate.loaded();
  assert.equal(shown, 0, "loaded, not painted: still hidden");
  gate.painted();
  assert.equal(shown, 1);
  gate.painted();
  clock.runAll();
  assert.equal(shown, 1, "the deadline after a paint shows nothing more");
});

test("a page that never paints is shown after the deadline, so a broken page is seen", () => {
  const clock = fakeTimers();
  let shown = 0;
  const gate = createFirstPaintGate({ onReady: () => shown++, setTimer: clock.setTimer });
  gate.loaded();
  assert.deepEqual(clock.timers.map((timer) => timer.ms), [UNPAINTED_PAGE_DEADLINE_MS]);
  clock.runAll();
  assert.equal(shown, 1);
});

const source = (file) => readFileSync(new URL(`../../editor/${file}`, import.meta.url), "utf8");

test("the pages say when they have painted, and the page window waits for it", () => {
  assert.match(source("src/window/editor-window.mjs"), /\npintar\(\);\n[^\n]*\nwindow\.solder\?\.pagePainted\(\);/);
  assert.match(source("src/project-explorer/project-explorer.mjs"), /if \(state\) paint\(\);\n[^\n]*\nsolder\?\.pagePainted\(\);/);
  assert.match(source("electron/page-window.mjs"), /once\("did-finish-load", \(\) => this\.firstPaint\.loaded\(\)\)/);
  assert.doesNotMatch(source("electron/page-window.mjs"), /did-finish-load", \(\) => this\.emit\("ready-to-show"\)/);
  assert.match(source("electron/layout-manager.mjs"), /ipcMain\.on\("page:painted", \(event\) => pageOfContents\(event\.sender\)\?\.markPainted\(\)\)/);
});

test("the toolbar's paint asks the warnings only, never the errors that need a compile", () => {
  const window = source("src/window/editor-window.mjs");
  assert.match(window, /conAvisos: !ejecutando && EL\.showsWarningButton\(warningRows\(\), errorList\.showWarnings\)/);
  const warnings = window.slice(window.indexOf("function warningRows("), window.indexOf("const listRows"));
  assert.doesNotMatch(warnings, /compilar|errorRows/);
});

test("docked, a page with no menus yet leaves the ones on screen", () => {
  assert.match(source("electron/dock-window.mjs"), /if \(page && !page\.chromeModel\) return;\n\s*chrome\.show\(/);
});
