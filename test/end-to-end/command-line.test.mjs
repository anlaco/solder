// A VI that waits runs on any Node, with no flag: its clumps park without a stack (DT-063 §8), so
// nothing needs JSPI, whose flag Node 24.19 required and Node 26 refuses (DT-061, "What was
// measured" 1).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { addonsFolders, platformName } from "../../editor/electron/installed-addons.mjs";
import { RAIZ } from "../helpers.mjs";

const WAITING_VI = path.join(RAIZ, "test/fixtures/command-line/Add After Wait.sdg");
// A pool of two threads: the behaviour is the same, and the tests do not start one per processor.
const FEW_THREADS = ["--threads", "2"];
// Started before the command line, it takes JSPI away from the engine, if the engine has it.
const WITHOUT_JSPI = "data:text/javascript,delete WebAssembly.Suspending;delete WebAssembly.promising";

test("the command line runs a VI that waits when Node is started with no flag", () => {
  const output = execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "run", WAITING_VI, ...FEW_THREADS], { encoding: "utf8" });
  assert.equal(output, "Sum = 8\n");
});

test("a VI that waits runs on an engine with no JSPI at all", () => {
  const output = execFileSync(process.execPath, ["--import", WITHOUT_JSPI, path.join(RAIZ, "cli/solder.mjs"), "run", WAITING_VI, ...FEW_THREADS], { encoding: "utf8" });
  assert.equal(output, "Sum = 8\n");
});

test("neither npm test nor the command line's shebang pass an engine flag, which Node 26 may refuse", () => {
  const packageJson = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.doesNotMatch(packageJson.scripts.test, /--experimental/);
  const shebang = readFileSync(path.join(RAIZ, "cli/solder.mjs"), "utf8").split("\n")[0];
  assert.doesNotMatch(shebang, /--experimental/);
});

test("the command line takes the threads of its pool, and refuses a number that is not one", () => {
  const run = (...options) => execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "run", WAITING_VI, ...options], { encoding: "utf8" });
  assert.equal(run("--threads", "1"), run("--threads", "3"), "one thread and three give the same");
  assert.throws(() => execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "run", WAITING_VI, "--threads", "0"], { stdio: "pipe" }), (error) => error.status === 2);
});

// S10-#8 (daq-plugin-findings.md): the command line resolves `<ovilib>/…` into the add-ons installed in the user's
// folder, as the editor does (DT-081 §4). The caller is DAQ Start Task with its subOVI stored by its symbolic path.
test("the command line finds a subOVI of an installed add-on through its <ovilib> path", (context) => {
  const userData = mkdtempSync(path.join(tmpdir(), "solder-user-data-"));
  context.after(() => rmSync(userData, { recursive: true, force: true }));
  const environment = { ...process.env, XDG_DATA_HOME: userData, APPDATA: userData };
  const [, userAddons] = addonsFolders({ nodePlatform: process.platform, homeDirectory: userData, environment });
  const platformPart = `daq-${platformName(process.platform, process.arch)}`;
  for (const part of ["daq", platformPart]) cpSync(path.join(RAIZ, "addons", part), path.join(userAddons, part), { recursive: true });
  const startTask = readFileSync(path.join(RAIZ, "addons/daq/1/ovi.lib/DAQ/DAQ Start Task.ovi"), "utf8");
  const caller = path.join(userData, "Caller.ovi");
  writeFileSync(caller, startTask.replace('"vi": "DAQ Fill In Error Info.ovi"', '"vi": "<ovilib>/DAQ/DAQ Fill In Error Info.ovi"'));
  const check = (env) => execFileSync(process.execPath, [path.join(RAIZ, "cli/solder.mjs"), "check", caller], { encoding: "utf8", env, stdio: "pipe" });
  assert.doesNotThrow(() => check(environment));
  const withoutAddons = { ...environment, XDG_DATA_HOME: path.join(userData, "none"), APPDATA: path.join(userData, "none") };
  assert.throws(() => check(withoutAddons), (error) => error.status === 1 && /cannot be found/.test(error.stderr), "without the add-on the subOVI is missing");
});
