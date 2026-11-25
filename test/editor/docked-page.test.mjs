// DT-101 §3, §7: a page hides its own menus and toolbar only when it is in the docked window itself. A window that stays
// floating in the docked view (the control editor) keeps them: on 2026-11-25 it opened with none, docked view on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { connectDockedPage } from "../../editor/src/common/docked-page.mjs";

/** A body whose `docked` class is recorded, and a layout API whose view is docked and whose page is `pageDocked`. */
function fakePage(pageDocked) {
  const classes = new Set();
  globalThis.document = { body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } }, querySelectorAll: () => [] };
  const listeners = [];
  const layoutApi = {
    get: async () => "docked",
    isPageDocked: async () => pageDocked.value,
    onChanged: (callback) => listeners.push(callback),
    onRun: () => {},
    sendModel: () => {},
  };
  return { classes, layoutApi, switchTo: async (layout) => Promise.all(listeners.map((callback) => callback(layout))) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a page that stays floating in the docked view keeps its menus; a docked one hides them", async () => {
  const floating = { value: false };
  const page = fakePage(floating);
  connectDockedPage({ layoutApi: page.layoutApi, buildModel: () => ({}), runMenuRow: () => {}, repaint: () => {} });
  await settle();
  assert.equal(page.classes.has("docked"), false, "the control editor's window, the docked view on");
  floating.value = true;
  await page.switchTo("docked");
  await settle();
  assert.equal(page.classes.has("docked"), true, "a page moved into the docked window");
  delete globalThis.document;
});
