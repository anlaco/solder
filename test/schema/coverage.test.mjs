// docs/design/coverage.md against what it counts: a ticked item or a built inventory entry that the tables do
// not show yet means somebody forgot `node scripts/coverage.mjs`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { readCoverageSources, renderCoverage } from "../../scripts/coverage.mjs";

test("the coverage tables match the checklists and the inventory", () => {
  const { markdown, inventory } = readCoverageSources();
  assert.ok(renderCoverage(markdown, inventory) === markdown, "coverage.md is out of date: run node scripts/coverage.mjs");
});

test("a checklist item ticked changes its area's count in the summary", () => {
  const { markdown, inventory } = readCoverageSources();
  const ticked = markdown.replace("- [ ] EXT (extended precision)", "- [x] EXT (extended precision)");
  const before = renderCoverage(markdown, inventory).match(/^\| Language and types \| (\d+) \//m)[1];
  const after = renderCoverage(ticked, inventory).match(/^\| Language and types \| (\d+) \//m)[1];
  assert.equal(Number(after), Number(before) + 1);
});
