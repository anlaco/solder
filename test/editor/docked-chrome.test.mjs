// The docked window's one menu bar and toolbar (DT-101 §7): the menus a docked page sends, from the same inventory as
// LabVIEW's drawn menus, and what hides each page's own.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { menuBarModel, rowLabel } from "../../editor/src/common/native-menu-model.mjs";
import { INV } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../editor/${file}`, import.meta.url), "utf8");

test("a Front Panel's native menu bar has LabVIEW's titles in order, with their rows and shortcuts", () => {
  const menus = menuBarModel(INV, "window.front-panel");
  assert.deepEqual(menus.map((title) => title.label), ["File", "Edit", "View", "Project", "Operate", "Tools", "Window", "Help"]);
  const newOVI = menus[0].rows.find((row) => row.id === "window.front-panel.menu.file.new-vi");
  assert.deepEqual([newOVI.label, newOVI.shortcut, newOVI.enabled, newOVI.rows], ["New OVI", "Ctrl+N", true, null]);
  assert.equal(menus[0].rows.length, INV.hijos("window.front-panel.menu.file").length);
});

test("the rows follow the drawn menu's variants: hidden, renamed, greyed and ticked", () => {
  const edit = "window.front-panel.menu.edit";
  const [first, second, third] = INV.hijos(edit);
  const variant = { ocultos: new Set([first.id]), rotulos: new Map([[second.id, "Undo Wire"]]), desactivados: new Set([second.id]) };
  const menus = menuBarModel(INV, "window.front-panel", { variantOf: (id) => (id === edit ? variant : {}), marksOf: (id) => new Set(id === edit ? [third.id] : []) });
  const rows = menus.find((title) => title.id === edit).rows;
  assert.ok(!rows.some((row) => row.id === first.id), "hidden");
  assert.deepEqual([rows[0].label, rows[0].enabled], ["Undo Wire", false]);
  assert.equal(rows[1].checked, true);
});

test("a row not done yet keeps its place and says so, as a native menu cannot draw it in italics", () => {
  const hole = { label: "Find...", hole: true };
  assert.equal(rowLabel(hole), "Find...   (not yet)");
  assert.equal(rowLabel({ label: "Open...", hole: false }), "Open...");
  const anyHole = menuBarModel(INV, "window.block-diagram").flatMap((title) => title.rows).find((row) => row.hole);
  assert.ok(anyHole, "LabVIEW's menus still have rows Solder has not built");
});

test("docked, each page hides its own menus and toolbar, and the docked window shows them once", () => {
  assert.match(source("src/styles.css"), /body\.docked \.ventana > \.cabecera \{ display: none; \}/);
  assert.match(source("src/project-explorer/project-explorer.css"), /body\.docked \.pe-menubar, body\.docked \.pe-toolbar \{ display: none; \}/);
  // The OVI window and the explorer send their menus and toolbar after every paint, and run what comes back.
  assert.match(source("src/window/editor-window.mjs"), /docking\?\.afterPaint\(\);/);
  assert.match(source("src/project-explorer/project-explorer.mjs"), /docking\?\.afterPaint\(\);/);
  // The clicked row of the menu bar and the one chosen in the native menu take the same path.
  assert.match(source("src/window/editor-window.mjs"), /return runBarMenuRow\(filaBarra\.dataset\.id, ancla\(filaBarra\)\);/);
});

test("docked or floating, a page is laid out when its content area has its real size, not at the window's resize", () => {
  // On Linux "resize" comes before the content area's new size (measured 2026-11-19 under Mutter); "bounds-changed" with it.
  for (const file of ["electron/dock-window.mjs", "electron/page-window.mjs"]) {
    const code = source(file);
    assert.match(code, /contentView\.on\("bounds-changed"/, file);
    assert.doesNotMatch(code, /getContentSize\(\)|on\("resize"/, file);
  }
  const dock = source("electron/dock-window.mjs");
  const layout = dock.slice(dock.indexOf("function layout()"), dock.indexOf("function activePage()"));
  assert.ok(layout.indexOf("showActiveChrome();") < layout.indexOf("contentView.getBounds()"), "the menu bar goes on before measuring");
  assert.match(dock, /modelChanged: \(\) => layout\(\),/);
  assert.match(dock, /\["show", "restore", "maximize", "unmaximize"\]\) frame\.on\(event, \(\) => layout\(\)\)/);
});

test("a docked page is never resized to its own hidden window: there the dock places it", () => {
  const page = source("electron/page-window.mjs");
  const fit = page.slice(page.indexOf("  fitToFrame() {"), page.indexOf("  frameClosing(event) {"));
  assert.match(fit, /if \(this\.dock\) return;/);
});

test("quitting, the docked window and each page's own window close at once instead of handing it to a later tick", () => {
  // app.quit() closes every window in a loop that does not return; a close prevented there is retried forever (the editor
  // hung on quitting, docked, on 2026-11-19, the main process at 100 % inside app.quit()).
  const page = source("electron/page-window.mjs");
  const closing = page.slice(page.indexOf("  frameClosing(event) {"), page.indexOf("  setTitle(title) {"));
  assert.ok(closing.indexOf("if (quitting) return this.destroy();") >= 0 && closing.indexOf("if (quitting)") < closing.indexOf("event.preventDefault()"));
  assert.match(page, /app\.on\("before-quit", \(\) => \(quitting = true\)\);/);
  const dock = source("electron/dock-window.mjs");
  const close = dock.slice(dock.indexOf('frame.on("close"'), dock.indexOf("    return frame;\n  }"));
  assert.ok(close.indexOf("if (isAppQuitting()) return;") >= 0 && close.indexOf("isAppQuitting") < close.indexOf("event.preventDefault()"));
});

test("docked, a new OVI's Block Diagram is never put on screen before its Front Panel", () => {
  // Showing both put the diagram on screen 11–15 ms before the panel (reports/2026-11-21-visual-faults-fixed-editor.md).
  const main = source("electron/main.mjs");
  assert.match(main, /open\.windows\["block-diagram"\]\.showBehind\(\);\n    panel\.show\(\);/);
  const page = source("electron/page-window.mjs");
  const behind = page.slice(page.indexOf("  showBehind() {"), page.indexOf("  hide() {"));
  assert.match(behind, /this\.wanted = true;\n    if \(!this\.dock\) this\.frame\.show\(\);\n  \}/, "docked, only marked shown: the dock is not asked to show it");
});
