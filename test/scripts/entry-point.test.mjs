// A script knows it was run directly, and not imported, on every system (scripts/entry-point.mjs). On Windows,
// `scripts/build-native.mjs` compared `file:///C:/…` with `file://C:\…` and so never built anything, without a word
// (labview-captures/reports/2026-11-08-solder-calls-real-nilvaiu.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import { isRunDirectly } from "../../scripts/entry-point.mjs";

test("on Windows a script run by its path is recognised, whatever the slashes and the drive letter's case", () => {
  const moduleUrl = "file:///C:/solder/scripts/build-native.mjs";
  assert.equal(isRunDirectly(moduleUrl, "C:\\solder\\scripts\\build-native.mjs", "win32"), true);
  assert.equal(isRunDirectly(moduleUrl, "c:\\solder\\scripts\\build-native.mjs", "win32"), true);
  assert.equal(isRunDirectly(moduleUrl, "C:/solder/scripts/build-native.mjs", "win32"), true);
  assert.equal(isRunDirectly(moduleUrl, "C:\\solder\\scripts\\run-tests.mjs", "win32"), false, "another script imported it");
});

test("on Linux a script run by its path is recognised, and one that imported it is not", () => {
  const moduleUrl = "file:///home/someone/solder/scripts/build-native.mjs";
  assert.equal(isRunDirectly(moduleUrl, "/home/someone/solder/scripts/build-native.mjs", "linux"), true);
  assert.equal(isRunDirectly(moduleUrl, "/home/someone/solder/scripts/run-tests.mjs", "linux"), false);
  assert.equal(isRunDirectly(moduleUrl, "/home/someone/Solder/scripts/build-native.mjs", "linux"), false, "Linux tells cases apart");
});

test("with no script, as in a REPL, nothing was run directly", () => {
  assert.equal(isRunDirectly("file:///home/someone/a.mjs", undefined, "linux"), false);
});
