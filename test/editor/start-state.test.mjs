// What the Getting Started window remembers: the recent files and the carousel page
// (labview-captures/reports/2026-10-15-getting-started.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAROUSEL_PAGE_COUNT, MAX_RECENT_FILES, RECENT_FILTERS,
  emptyStartState, filterRecentFiles, nextCarouselPage, parseStartState, rememberFile,
} from "../../editor/src/getting-started/start-state.mjs";

test("a file opened again goes to the top of the recent list, once", () => {
  let state = emptyStartState();
  for (const file of ["/a.sdg", "/b.sdg", "/a.sdg"]) state = rememberFile(state, file);
  assert.deepEqual(state.recentFiles, ["/a.sdg", "/b.sdg"]);
  for (let index = 0; index < MAX_RECENT_FILES + 5; index++) state = rememberFile(state, `/f${index}.sdg`);
  assert.equal(state.recentFiles.length, MAX_RECENT_FILES);
});

test("the carousel moves on one page each time the window is shown, wrapping from the last to the first", () => {
  let state = { ...emptyStartState(), carouselPage: CAROUSEL_PAGE_COUNT - 1 };
  state = nextCarouselPage(state);
  assert.equal(state.carouselPage, 0);
  assert.equal(nextCarouselPage(state).carouselPage, 1);
});

test("the recent list filters as LabVIEW's combo does", () => {
  const files = ["/x/Main.sdg", "/x/old.qvi", "/x/plant.sdproj", "/x/notes.txt"];
  assert.deepEqual(RECENT_FILTERS, ["All Recent Files", "Recent Projects", "Recent VIs", "Other Recent Files"]);
  assert.deepEqual(filterRecentFiles(files, "All Recent Files"), files);
  assert.deepEqual(filterRecentFiles(files, "Recent VIs"), ["/x/Main.sdg", "/x/old.qvi"]);
  assert.deepEqual(filterRecentFiles(files, "Recent Projects"), ["/x/plant.sdproj"]);
  assert.deepEqual(filterRecentFiles(files, "Other Recent Files"), ["/x/notes.txt"]);
});

test("a missing or damaged state file starts empty", () => {
  assert.deepEqual(parseStartState("not json"), emptyStartState());
  assert.deepEqual(parseStartState('{"recentFiles":["/a.sdg",3],"carouselPage":11}'), { recentFiles: ["/a.sdg"], carouselPage: 3 });
});
