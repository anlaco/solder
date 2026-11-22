// The control editor's window (DT-104, stage a1): the inventory's `window.control-editor` prefix with the rows measured
// in LabVIEW (labview-captures/reports/2026-11-22-control-editor-window.md), the registry's CONTROL kind that opens it,
// and the rules of its window: it saves its `.octl`'s text, and the Ctrl shortcuts whose rows are holes or never do
// nothing in it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CONTROL_WINDOW_KIND, ENTRY_KINDS, createRegistry, hasOviWindows, oviName, recordChange, windowKindsOf, windowTitle } from "../../editor/electron/ovi-registry.mjs";
import { shortcutBlocked } from "../../editor/src/common/labview-inventory.mjs";
import { menuBarModel } from "../../editor/src/common/native-menu-model.mjs";
import { controlEditorGraph, controlEditorText } from "../../core/model/control-editor.mjs";
import { kindOfText, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { CAT, INV } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const PAGE = "editor/src/window/editor-window.mjs";
const MAIN = "editor/electron/main.mjs";

test("the control editor window is declared with LabVIEW's eight menu titles and the measured File rows", () => {
  assert.equal(INV.entrada("window.control-editor").estado, "built");
  const menus = menuBarModel(INV, "window.control-editor");
  assert.deepEqual(menus.map((title) => title.label), ["File", "Edit", "View", "Project", "Operate", "Tools", "Window", "Help"]);

  const file = menus[0];
  const rows = Object.fromEntries(file.rows.map((row) => [row.id, row]));
  // The rows measured that wait for their stage: Apply Changes (stage b), Save (stage a3), Control Properties.
  for (const id of ["apply-changes", "save", "control-properties"]) assert.equal(rows[`window.control-editor.menu.file.${id}`].hole, true, id);
  assert.equal(rows["window.control-editor.menu.file.control-properties"].shortcut, "Ctrl+I");
  assert.equal(rows["window.control-editor.menu.file.apply-changes"].separatorBefore, true);
  // The rows the page already runs, as in the OVI windows.
  assert.equal(rows["window.control-editor.menu.file.close"].hole, false);
  assert.equal(rows["window.control-editor.menu.file.close"].shortcut, "Ctrl+W");
  assert.equal(rows["window.control-editor.menu.file.exit"].hole, false);

  // Operate: Run and Stop are never (the control editor runs nothing, measured); Change to Customize Mode waits.
  const operate = Object.fromEntries(menus.find((title) => title.id === "window.control-editor.menu.operate").rows.map((row) => [row.id, row]));
  assert.equal(INV.entrada("window.control-editor.menu.operate.run").estado, "never");
  assert.equal(INV.entrada("window.control-editor.menu.operate.stop").estado, "never");
  assert.equal(operate["window.control-editor.menu.operate.change-to-customize-mode"].hole, true);
  assert.equal(operate["window.control-editor.menu.operate.change-to-customize-mode"].shortcut, "Ctrl+M");

  // Window: Show Parts Window waits; Show Block Diagram is never (Ctrl+E does nothing, measured).
  const windowMenu = Object.fromEntries(menus.find((title) => title.id === "window.control-editor.menu.window").rows.map((row) => [row.id, row]));
  assert.equal(windowMenu["window.control-editor.menu.window.show-parts-window"].hole, true);
  assert.equal(INV.entrada("window.control-editor.menu.window.show-block-diagram").estado, "never");
});

test("the control editor's toolbar has the Control Type ring with its three kinds and no Run", () => {
  const ids = INV.hijos("window.control-editor.toolbar").map((row) => row.id);
  assert.ok(ids.includes("window.control-editor.toolbar.control-type"));
  assert.ok(!ids.some((id) => ["run", "run-continuously", "abort-execution", "pause"].includes(id.split(".").pop())), "no Run, Abort or Pause (measured)");
  assert.equal(INV.entrada("window.control-editor.toolbar.control-type").estado, "built");
  assert.deepEqual(INV.hijos("window.control-editor.toolbar.control-type").map((row) => row.etiqueta), ["Control", "Type Def.", "Strict Type Def."]);
});

test("a control entry has the one control editor window, its own Control N count and its Type Def title", () => {
  const registry = createRegistry();
  const control = registry.open({ kind: ENTRY_KINDS.CONTROL }).entry;
  const ovi = registry.open().entry;
  assert.equal(oviName(control), "Control 1");
  assert.equal(oviName(ovi), "Untitled 1", "the OVI's count does not follow the control's");
  assert.deepEqual(windowKindsOf(control), [CONTROL_WINDOW_KIND]);
  assert.equal(windowTitle(control, CONTROL_WINDOW_KIND), "Control 1 Type Def *", "an untitled control is unsaved at once (measured: Control 5 Type Def *)");
  recordChange(control, "a");
  recordChange(control, "b");
  assert.equal(windowTitle(control, CONTROL_WINDOW_KIND), "Control 1 Type Def *", "unsaved changes, as any window");
  // The title carries the kind the entry was opened with; the ring changes it only on reopening (measured).
  control.controlKind = "strict-type-def";
  assert.equal(windowTitle(control, CONTROL_WINDOW_KIND), "Control 1 Strict Type Def *");
  const fromDisk = registry.open({ kind: ENTRY_KINDS.CONTROL, path: "/ctls/Point.octl", initialText: "{}" }).entry;
  assert.equal(windowTitle(fromDisk, CONTROL_WINDOW_KIND), "Point.octl Type Def");
});

test("an octl's kind is read from its text for the title", () => {
  const text = typeDefinitionText("strict-type-def", { tipo: "control", label: { text: "Gain" }, config: { type: "i32", value: 7 }, x: 31, y: 109 });
  assert.equal(kindOfText(text), "strict-type-def");
  assert.equal(kindOfText(typeDefinitionText("control", { tipo: "control", x: 0, y: 0 })), "control");
  assert.equal(kindOfText("not json"), null);
  assert.equal(kindOfText('{"solder": 8}'), null);
});

test("the text the control editor saves reopens as the same .octl", () => {
  // guardarOVI sends the .octl's text in the control editor, not an OVI's: an OVI's text would corrupt the file
  // (kindOfText would read null and reopening would fail).
  const page = source(PAGE);
  assert.match(page, /esEditorControl \? controlEditorText\(controlKind, grafo\(\), cat, controlComments\) : Q\.aTexto\(grafo\(\), cat\)/, "guardarOVI sends the .octl's text");
  const object = { tipo: "control", label: { text: "Gain" }, config: { type: "i32", value: 7 }, x: 31, y: 109 };
  for (const kind of ["control", "type-def", "strict-type-def"]) {
    const saved = controlEditorText(kind, controlEditorGraph(typeDefinitionText(kind, object), CAT).g, CAT);
    assert.equal(kindOfText(saved), kind, `the saved text keeps its kind as ${kind}`);
    const reopened = controlEditorGraph(saved, CAT);
    assert.equal(reopened.kind, kind);
    assert.equal(controlEditorText(reopened.kind, reopened.g, CAT), saved, "reopening and saving again is stable");
  }
});

test("the Ctrl shortcuts whose rows in the control editor are holes or never do nothing there", () => {
  for (const key of ["e", "s", "i", "r", "t"]) assert.equal(shortcutBlocked(INV, "window.control-editor", key), true, `Ctrl+${key.toUpperCase()} is blocked`);
  for (const key of ["w", "o", "n", "q"]) assert.equal(shortcutBlocked(INV, "window.control-editor", key), false, `Ctrl+${key.toUpperCase()} still runs`);
  // The OVI windows keep their shortcuts: their rows are built, and Run's Ctrl+R is not declared there at all.
  for (const key of ["s", "i", "e", "t", "r", "w"]) assert.equal(shortcutBlocked(INV, "window.front-panel", key), false, `front-panel Ctrl+${key.toUpperCase()}`);
  const page = source(PAGE);
  assert.match(page, /!shortcutBlocked\(inv, prefijo, ev\.key\)/, "the menu-command shortcuts ask the inventory");
  assert.match(page, /!shortcutBlocked\(inv, prefijo, "r"\)/, "Run's Ctrl+R asks the inventory");
});

test("Ctrl+E and Ctrl+T do nothing for a control's one window in the main process", () => {
  const registry = createRegistry();
  assert.equal(hasOviWindows(registry.open({ kind: ENTRY_KINDS.CONTROL }).entry), false);
  assert.equal(hasOviWindows(registry.open().entry), true);
  const main = source(MAIN);
  assert.match(main, /ovi:toggle-window[\s\S]*?if \(!hasOviWindows\(open\.entry\)\) return;/, "Ctrl+E returns at once for a control");
  assert.match(main, /ovi:tile[\s\S]*?if \(hasOviWindows\(open\.entry\)\) tileWindows\(open\);/, "Ctrl+T returns at once for a control");
  // The guard takes the registry's entry, never the window record that holds it: that record has no `kind`, so asking
  // it would answer false for every OVI and Ctrl+T would stop tiling them all.
  const calls = [...main.matchAll(/hasOviWindows\(([^)]*)\)/g)].map((call) => call[1]).filter((argument) => argument !== "");
  assert.ok(calls.length >= 2, "both shortcuts ask");
  for (const argument of calls) assert.match(argument, /\.entry$/, `hasOviWindows(${argument}) is asked of an entry`);
  assert.equal(hasOviWindows({ entry: registry.open().entry, windows: {} }), false, "a window record is not an entry");
});

test("the ring does not change the window's title until reopening, and saving does not either", () => {
  // Measured: with the ring set to Strict Type Def. the title stays "Control 1 Type Def *"; it follows on reopening.
  const page = source(PAGE);
  const ring = page.slice(page.indexOf("function finishControlTypeMenu"), page.indexOf("\n}", page.indexOf("function finishControlTypeMenu")));
  assert.ok(!ring.includes("showOVINameInPageTitle"), "the page's title keeps the kind it was opened with");
  const main = source(MAIN);
  const writeControl = main.slice(main.indexOf("async function writeControl"), main.indexOf("async function restyle"));
  assert.ok(!writeControl.includes("controlKind"), "saving does not change the title's kind");
  assert.match(main, /controlSaveProposal = \(currentPath, name\) => currentPath \?\? `\$\{name\}\$\{CONTROL_FILE_EXTENSION\}`/, "Save As proposes a .octl, not a .ovi");
});
