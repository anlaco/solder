// The command line and `npm test` start on every Node that runs JSPI: Node 24.19 needs
// `--experimental-wasm-jspi`, JSPI ships without a flag from Node 24.20 on, and Node 26
// refuses to start with the flag (DT-061, "What was measured" 1). So the flag is passed
// only when the running Node lacks JSPI.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { JSPI_FLAG, jspiNodeArguments } from "../../cli/jspi.mjs";
import { RAIZ } from "../helpers.mjs";

const withJSPI = { Suspending: function Suspending() {}, promising: () => {} };
const withoutJSPI = {};

test("the JSPI flag is passed only to a Node that lacks JSPI", () => {
  assert.deepEqual(jspiNodeArguments(withJSPI), []);
  assert.deepEqual(jspiNodeArguments(withoutJSPI), [JSPI_FLAG]);
});

test("neither npm test nor the command line's shebang hard-code the JSPI flag, which Node 26 refuses", () => {
  const packageJson = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.doesNotMatch(packageJson.scripts.test, /experimental-wasm-jspi/);
  const shebang = readFileSync(path.join(RAIZ, "cli/solder.mjs"), "utf8").split("\n")[0];
  assert.doesNotMatch(shebang, /experimental-wasm-jspi/);
});

test("the command line runs a VI that waits when Node is started with no flag", () => {
  const output = execFileSync(
    process.execPath,
    [path.join(RAIZ, "cli/solder.mjs"), "run", path.join(RAIZ, "test/fixtures/command-line/Add After Wait.sdg")],
    { encoding: "utf8" },
  );
  assert.equal(output, "Sum = 8\n");
});
