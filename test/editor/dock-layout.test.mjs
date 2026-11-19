// Solder's docked view (DT-101): the docked window's layout, its tabs, the preference and the switch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Dock from "../../editor/electron/dock-layout.mjs";
import { dockBarHtml } from "../../editor/src/dock/dock-bar-view.mjs";
import { LAYOUT_ADVICE, layoutSwitchHtml, nextLayout } from "../../editor/src/project-explorer/layout-switch.mjs";

const SIZE = { width: 1200, height: 800 };
const { FRONT_PANEL: FP, BLOCK_DIAGRAM: BD } = Dock;

test("docked, one toolbar row across the top; under it the explorer on the left and the active OVI under its tabs", () => {
  const bounds = Dock.dockBounds(SIZE, { hasExplorer: true, split: false });
  const [left, top] = [Dock.LEFT_COLUMN_WIDTH, Dock.TOOLBAR_HEIGHT];
  assert.deepEqual(bounds.toolbar, { x: 0, y: 0, width: 1200, height: top });
  assert.deepEqual(bounds.explorer, { x: 0, y: top, width: left, height: 800 - top });
  assert.deepEqual(bounds.tabBar, { x: left, y: top, width: 1200 - left, height: Dock.TAB_BAR_HEIGHT });
  const middle = { x: left, y: top + Dock.TAB_BAR_HEIGHT, width: 1200 - left, height: 800 - top - Dock.TAB_BAR_HEIGHT };
  assert.deepEqual([bounds[FP], bounds[BD]], [middle, middle], "unsplit, one of the two is shown in the whole middle");
});

test("Ctrl+T splits the middle in half: the Front Panel left, the Block Diagram right", () => {
  const bounds = Dock.dockBounds(SIZE, { hasExplorer: true, split: true });
  const middleWidth = 1200 - Dock.LEFT_COLUMN_WIDTH;
  assert.equal(bounds[FP].x, Dock.LEFT_COLUMN_WIDTH);
  assert.equal(bounds[FP].width + bounds[BD].width, middleWidth);
  assert.equal(bounds[BD].x, bounds[FP].x + bounds[FP].width);
});

test("with no project open the middle takes the whole width; a narrow window keeps half for the middle", () => {
  assert.equal(Dock.dockBounds(SIZE, { hasExplorer: false, split: false }).explorer, null);
  assert.equal(Dock.dockBounds(SIZE, { hasExplorer: false, split: false })[FP].x, 0);
  assert.equal(Dock.dockBounds({ width: 400, height: 300 }, { hasExplorer: true, split: false }).explorer.width, 200);
});

test("tabs: opening adds one at the end and brings it forward; closing activates the next, or the one before", () => {
  let dock = Dock.emptyDock();
  for (const id of ["a", "b", "c"]) dock = Dock.activateTab(dock, id);
  assert.deepEqual([dock.tabs, dock.active], [["a", "b", "c"], "c"]);
  dock = Dock.activateTab(dock, "a");
  assert.deepEqual([dock.tabs, dock.active], [["a", "b", "c"], "a"], "an open OVI is brought forward, not added again");
  dock = Dock.closeTab(dock, "a");
  assert.equal(dock.active, "b", "the tab after it");
  dock = Dock.closeTab(Dock.activateTab(dock, "c"), "c");
  assert.equal(dock.active, "b", "the last one closed: the one before");
  assert.equal(Dock.closeTab(dock, "b").active, null);
});

test("Ctrl+E shows the active OVI's other window; split, both are on screen", () => {
  let dock = Dock.activateTab(Dock.emptyDock(), "a");
  assert.ok(Dock.isOnScreen(dock, "a", FP) && !Dock.isOnScreen(dock, "a", BD), "a new tab shows its Front Panel");
  dock = Dock.toggleShown(dock);
  assert.ok(Dock.isOnScreen(dock, "a", BD) && !Dock.isOnScreen(dock, "a", FP));
  dock = Dock.toggleSplit(dock);
  assert.ok(Dock.isOnScreen(dock, "a", FP) && Dock.isOnScreen(dock, "a", BD));
  dock = Dock.activateTab(dock, "b");
  assert.ok(!Dock.isOnScreen(dock, "a", FP), "only the active OVI is on screen");
  assert.equal(Dock.activateTab(dock, "a").shown.a, BD, "each tab remembers which window it showed");
});

test("the preference is floating unless the file says docked, and is written back as it is read", () => {
  assert.equal(Dock.readPreferences(null).layout, Dock.LAYOUTS.FLOATING, "no file yet");
  assert.equal(Dock.readPreferences("{ not json").layout, Dock.LAYOUTS.FLOATING, "a broken file");
  assert.equal(Dock.readPreferences('{"layout":"sideways"}').layout, Dock.LAYOUTS.FLOATING);
  assert.equal(Dock.readPreferences(Dock.preferencesText({ layout: Dock.LAYOUTS.DOCKED })).layout, Dock.LAYOUTS.DOCKED);
});

test("the bar shows the FP / BD switch, the split button and one tab per OVI with its close button", () => {
  const html = dockBarHtml({ tabs: [{ id: "1", label: "main.ovi *", active: true }, { id: "2", label: "a<b>.ovi", active: false }], shown: BD, split: false });
  assert.match(html, /data-dock-kind="front-panel"[^>]*aria-pressed="false"/);
  assert.match(html, /data-dock-kind="block-diagram"[^>]*aria-pressed="true"/);
  assert.match(html, /data-dock-split[^>]*Ctrl\+T/);
  assert.equal((html.match(/data-dock-tab=/g) ?? []).length, 2);
  assert.match(html, /class="dock-tab active"[^>]*data-dock-tab="1"/);
  assert.match(html, /a&lt;b&gt;\.ovi/, "a name is escaped");
  const empty = dockBarHtml({ tabs: [], shown: null, split: false });
  assert.match(empty, /No OVI open/);
  assert.equal((empty.match(/ disabled>/g) ?? []).length, 3, "the switch and the split button wait for an OVI");
});

test("the Project Explorer's switch says it is experimental, in red, and gives the developer's advice", () => {
  const off = layoutSwitchHtml("floating");
  assert.match(off, /role="switch" aria-checked="false"/);
  assert.match(off, /class="pe-experimental">Experimental</);
  assert.ok(off.includes(`title="${LAYOUT_ADVICE}"`));
  assert.match(LAYOUT_ADVICE, /come from LabVIEW, use the floating windows; if you start from scratch, use the docked view/);
  assert.match(layoutSwitchHtml("docked"), /aria-checked="true"/);
  assert.equal(nextLayout("floating"), "docked");
  assert.equal(nextLayout("docked"), "floating");
});

test("found in the editor: what kept the docked view from starting, showing its switch or filling its bar", () => {
  const source = (file) => readFileSync(new URL(`../../editor/${file}`, import.meta.url), "utf8");
  // `screen` can only be asked once the application is ready, and the layout manager is made when main.mjs loads.
  assert.match(source("electron/layout-manager.mjs"), /bounds: dockBounds, /);
  assert.match(source("electron/dock-window.mjs"), /\.\.\.options\.bounds\(\)/);
  // LabVIEW's toolbar is wider than the explorer and clipped: the switch has a strip of its own under the tree.
  const view = source("src/project-explorer/project-explorer-view.mjs");
  assert.doesNotMatch(view, /pe-toolbar[^\n]*layoutSwitchHtml/);
  assert.match(view, /\$\{tree\(state\)\}\s*\$\{layoutSwitchHtml\(state\.layout\)\}/);
  // The bar asks for its state once it listens; a page leaving the dock is drawn again in its own window.
  assert.match(source("src/dock/dock-bar.mjs"), /layout\.requestState\(\);\n$/);
  // Electron crashed when a page's window was destroyed in the task its "Save changes?" box returned: a tick later.
  assert.match(source("electron/page-window.mjs"), /this\.emit\("closed"\);[\s\S]*setTimeout\(\(\) => \{\s*dock\?\.detach\(this\);[\s\S]*this\.frame\.destroy\(\);\s*\}, 0\);/);
  // A dialog given a page instead of a window came out as an empty box with one Ok button.
  assert.match(source("electron/main.mjs"), /const owner = dialogOwner\(primaryWindow\(open\)\);\n\s+if \(!force && !\(await canDiscard\(open, owner\)\)\)/);
  assert.doesNotMatch(source("electron/main.mjs"), /writeOVI\(open, primaryWindow\(open\)/);
  assert.match(source("electron/project-manager.mjs"), /confirmDiscard\(entry, dialogOwner\(windowOf\(entry\)\)\)/);
  assert.match(source("electron/page-window.mjs"), /addChildView\(this\.view\);\s*\/\/[^\n]*\n\s*this\.view\.setVisible\(true\)/);
});
