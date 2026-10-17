// DT-058 §1–2: a VI's window style is the `.css` with its name next to its file; it is read when the VI opens,
// again whenever it changes on disk, and it goes after every other sheet so it wins over the editor's style.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { companionStylesheetPath } from "../../editor/src/common/vi-paths.mjs";
import { applyWindowStyle } from "../../editor/src/front-panel/window-stylesheet.mjs";
import { readWindowStyle, watchWindowStyle } from "../../editor/electron/window-style.mjs";

test("the window style has the VI's name with .css, next to it", () => {
  assert.equal(companionStylesheetPath("/lab/Oven Controller.sdg"), "/lab/Oven Controller.css");
  assert.equal(companionStylesheetPath("/lab/Old.qvi"), "/lab/Old.css");
  assert.equal(companionStylesheetPath("C:/lab/Upper.SDG"), "C:/lab/Upper.css");
  assert.equal(companionStylesheetPath("/lab/v1.2 Reader.sdg"), "/lab/v1.2 Reader.css");
});

async function withFolder(body) {
  const folder = await mkdtemp(path.join(tmpdir(), "solder-window-style-"));
  try {
    await body(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("a VI with no window style, or not saved yet, has none", async () => {
  await withFolder(async (folder) => {
    assert.equal(await readWindowStyle(path.join(folder, "Plain.sdg")), "");
    assert.equal(await readWindowStyle(null), "");
  });
});

test("the window style is read from the file next to the VI", async () => {
  await withFolder(async (folder) => {
    await writeFile(path.join(folder, "Styled.css"), ".sd-panel { --sd-accent: teal; }");
    assert.equal(await readWindowStyle(path.join(folder, "Styled.sdg")), ".sd-panel { --sd-accent: teal; }");
  });
});

/** The next text `watchWindowStyle` reports, or a failure after a while. */
function nextChange(viPath, action) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop();
      reject(new Error("no change reported"));
    }, 3000);
    const stop = watchWindowStyle(viPath, (text) => {
      clearTimeout(timeout);
      stop();
      resolve(text);
    });
    action();
  });
}

test("creating, changing and deleting the style are reported", async () => {
  await withFolder(async (folder) => {
    const vi = path.join(folder, "Live.sdg");
    const stylesheet = path.join(folder, "Live.css");
    assert.equal(await nextChange(vi, () => writeFile(stylesheet, "a {}")), "a {}");
    assert.equal(await nextChange(vi, () => writeFile(stylesheet, "b {}")), "b {}");
    assert.equal(await nextChange(vi, () => rm(stylesheet)), "");
  });
});

test("an unsaved VI is not watched", () => {
  const stop = watchWindowStyle(null, () => assert.fail("nothing to watch"));
  stop();
});

/** Just enough of a document for applyWindowStyle: a head that keeps its children in order. */
function fakePage() {
  const head = { children: [], append(element) { this.children = this.children.filter((child) => child !== element).concat(element); } };
  return {
    head,
    getElementById: (id) => head.children.find((child) => child.id === id) ?? null,
    createElement: (tag) => ({ tag, id: "", textContent: "" }),
  };
}

test("the window style goes after every other sheet, and replaces itself", () => {
  const page = fakePage();
  page.head.append({ tag: "link", id: "panel-style" });
  applyWindowStyle(page, "a {}");
  page.head.append({ tag: "link", id: "added-later" });
  applyWindowStyle(page, "b {}");
  const styles = page.head.children.filter((child) => child.tag === "style");
  assert.equal(styles.length, 1);
  assert.equal(page.head.children.at(-1), styles[0]);
  assert.equal(styles[0].textContent, "b {}");
  applyWindowStyle(page, undefined);
  assert.equal(styles[0].textContent, "");
});
