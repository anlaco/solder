// Type checking of core/ over its JSDoc (DT-093 §2, tsconfig.json): TypeScript, pinned in package.json, reads the
// JavaScript and finds what the suite may not reach, such as a name left behind by a rename. When it was brought in
// (2026-11-16) it found 48 errors, all JSDoc that says less than the code (an optional parameter not marked so, a type
// guessed from a default); they are listed by file and code in test/fixtures/typecheck/baseline.json, as a ratchet: a
// file may lose errors, never gain one, and the list follows when they are fixed.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { RAIZ } from "../helpers.mjs";

const BASELINE = path.join(RAIZ, "test/fixtures/typecheck/baseline.json");
const TSC = path.join(RAIZ, "node_modules/typescript/bin/tsc");
const ERROR_LINE = /^(.+?)\(\d+,\d+\): error (TS\d+): /;

/** The errors TypeScript gives today, counted by `file code`. */
function currentErrors() {
  const run = spawnSync(process.execPath, [TSC, "-p", path.join(RAIZ, "tsconfig.json"), "--pretty", "false"], { cwd: RAIZ, encoding: "utf8" });
  const counts = {};
  for (const line of run.stdout.split("\n")) {
    const match = ERROR_LINE.exec(line);
    if (match) counts[`${match[1]} ${match[2]}`] = (counts[`${match[1]} ${match[2]}`] ?? 0) + 1;
  }
  return counts;
}

test("core/ gains no type error over the baseline, and the baseline lists only errors still there", () => {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const current = currentErrors();
  for (const [key, count] of Object.entries(current)) {
    assert.ok(count <= (baseline[key] ?? 0), `${key}: ${count} errors, the baseline allows ${baseline[key] ?? 0} (run npx tsc -p tsconfig.json)`);
  }
  for (const [key, count] of Object.entries(baseline)) {
    assert.ok((current[key] ?? 0) === count, `${key}: the baseline says ${count}, there are ${current[key] ?? 0} now: update test/fixtures/typecheck/baseline.json`);
  }
});
