// A VI that waits runs on any Node, with no flag: its clumps park without a stack (DT-063 §8), so
// nothing needs JSPI, whose flag Node 24.19 required and Node 26 refuses (DT-061, "What was
// measured" 1).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

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
