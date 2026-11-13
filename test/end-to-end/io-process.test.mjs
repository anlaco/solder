// The editor's instrument I/O process in real Electron (DT-065 §3): it answers an instrument, a crash of
// its native code ends only that process, and the next Run gets a new one. Skipped where Electron has no
// display to start on.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

import { IDENTITY, startInstrument } from "../instrument.mjs";
import { RAIZ } from "../helpers.mjs";

const ELECTRON = createRequire(import.meta.url)("electron");
const CHECK = path.join(RAIZ, "test/fixtures/electron/io-process-check.mjs");
const SEGMENTATION_FAULT_EXIT = 139;
const ON_WINDOWS = process.platform === "win32";
/** Longer than the check ever takes; past it Electron is stuck (it stays open when its script fails to load). */
const CHECK_TIME_LIMIT_MS = 60_000;
const hasDisplay = process.platform !== "linux" || !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;

/** Runs the check in Electron and gives the report it prints. */
function runCheck(resource) {
  return new Promise((resolve, reject) => {
    const electron = spawn(ELECTRON, ["--no-sandbox", CHECK], { env: { ...process.env, SOLDER_TEST_RESOURCE: resource } });
    let output = "";
    electron.stdout.on("data", (chunk) => (output += chunk));
    electron.stderr.on("data", (chunk) => (output += chunk));
    const stuck = setTimeout(() => electron.kill(), CHECK_TIME_LIMIT_MS);
    electron.on("error", reject);
    electron.on("close", () => {
      clearTimeout(stuck);
      const line = output.split("\n").find((text) => text.startsWith("REPORT "));
      if (!line) return reject(new Error(`No report from Electron:\n${output}`));
      resolve(JSON.parse(line.slice("REPORT ".length)));
    });
  });
}

test("a crash of the I/O process ends only it, and the next connection starts a new one", { skip: !hasDisplay && "no display for Electron" }, async () => {
  const instrument = await startInstrument();
  try {
    const report = await runCheck(instrument.resource);
    assert.equal(report.error, undefined);
    assert.equal(report.first, IDENTITY);
    // Windows has no segmentation-fault signal to send, so there the process is ended and only that is asserted.
    if (ON_WINDOWS) assert.notEqual(report.exitCode, 0);
    else assert.equal(report.exitCode, SEGMENTATION_FAULT_EXIT);
    assert.equal(report.exitsTold, 1);
    assert.equal(report.afterCrash, IDENTITY);
    assert.ok(report.newProcess);
  } finally {
    instrument.stop();
  }
});
