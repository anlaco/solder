// LabVIEW reserves a subVI while a caller runs: its windows are in run mode and refuse every edit until the caller
// stops (labview-captures/reports/2026-11-19-subvi-checks-0.14-labview.md §1). Solder's pages tell the main process
// which OVIs their Run calls, and each page checks its own key.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createReservations } from "../../editor/electron/run-reservations.mjs";

const source = (file) => readFileSync(new URL(`../../editor/${file}`, import.meta.url), "utf8");

test("the OVIs a running caller calls are reserved until it stops, and two callers keep a shared subOVI reserved", () => {
  const reservations = createReservations();
  assert.deepEqual(reservations.keys(), []);
  reservations.set(1, ["/a/sub.ovi", "/a/inner.ovi"]);
  reservations.set(2, ["/a/sub.ovi"]);
  assert.deepEqual(reservations.keys().sort(), ["/a/inner.ovi", "/a/sub.ovi"]);
  reservations.set(1, null);
  assert.deepEqual(reservations.keys(), ["/a/sub.ovi"], "the other caller still runs");
  reservations.set(2, null);
  assert.deepEqual(reservations.keys(), []);
});

test("a page reports its Run's callees, enters run mode when its own key is reserved, and a reserved page aborts nothing", () => {
  const page = source("src/window/editor-window.mjs");
  assert.match(page, /window\.solder\?\.runState\?\.\(hierarchyKeys\.filter\(\(key\) => key !== oviKey\)\);\n  modoRun\(true\);/, "the Run says what it calls");
  assert.match(page, /window\.solder\?\.runState\?\.\(null\);\n  modoRun\(false\);/, "and when it ends");
  assert.match(page, /onReserved\?\.\(\(keys\) => reservar\(keys\.includes\(oviKey\)\)\)/);
  assert.match(page, /modoRun\(si, \{ reserved: true \}\)/, "reserved is run mode, where nothing is edited");
  assert.match(page, /if \(!ejecutando \|\| reservado\) return;/, "Abort in a reserved OVI does not bounce between its two windows");
  assert.match(source("electron/main.mjs"), /registerRunReservations\(\{ ipcMain, webContents \}\)/);
});
