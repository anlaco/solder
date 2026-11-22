// An OVI window's Window and Project menus (DT-099 stage d), measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-22-vi-window-menu.md): their rows, the project rows greyed outside a project, the list
// of windows with the most recently active first, and what Show Project, Save Project and Close Project ask of the main
// process. The menus are pure (editor/src/window/project-menus.mjs); the wiring is checked in the sources.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { listedIndexOf } from "../../editor/src/common/window-list-menu.mjs";
import { windowListRows } from "../../editor/electron/project-window-list.mjs";
import * as PM from "../../editor/src/window/project-menus.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const source = (file) => readFileSync(path.join(RAIZ, file), "utf8");
/** A menu's rows as "| " before the first of a group, the label, the shortcut and "(g)" when not built or greyed. */
function rows(menuId, variant = {}) {
  const entries = variant.submenus?.get(menuId) ?? INV.hijos(menuId);
  return entries.map((entry) => {
    const group = entry.separado || variant.separadores?.get(entry.id) ? "| " : "";
    const greyed = entry.estado !== "built" || variant.desactivados?.has(entry.id) ? " (g)" : "";
    return `${group}${entry.etiqueta}${entry.atajo ? ` ${entry.atajo}` : ""}${greyed}`;
  });
}

test("the OVI windows' Window menu has LabVIEW's rows, Show Project only in a project, and lists the windows", () => {
  const panelMenu = PM.windowMenuId("front-panel");
  // Q1: outside a project Show Project is greyed; Tile Up and Down, Full Size and All Windows... are not built yet.
  const outside = PM.projectMenuVariant(INV, "front-panel", panelMenu, { inProject: false });
  assert.deepEqual(rows(panelMenu, outside), ["Show Block Diagram Ctrl+E", "Show Project (g)", "| Tile Left and Right Ctrl+T", "Tile Up and Down (g)", "Full Size Ctrl+/ (g)", "| All Windows... Ctrl+Shift+W (g)"]);
  assert.deepEqual(rows(PM.windowMenuId("block-diagram")).slice(0, 2), ["Show Front Panel Ctrl+E", "Show Project"]);
  // Q2: in a project it is enabled, and the open windows come before All Windows..., the Project Explorers as a group of their own.
  const listed = windowListRows({
    oviWindows: [{ key: "ovi:1:front-panel", title: "Untitled 1 Front Panel on NewVI14.sdproj/My Computer" }, { key: "ovi:1:block-diagram", title: "Untitled 1 Block Diagram on NewVI14.sdproj/My Computer" }],
    explorers: [{ key: "project:1", title: "NewVI14.sdproj * - Project Explorer", activation: 1 }],
  });
  const inside = PM.projectMenuVariant(INV, "front-panel", panelMenu, { inProject: true, windowRows: listed });
  assert.deepEqual(rows(panelMenu, inside), [
    "Show Block Diagram Ctrl+E", "Show Project", "| Tile Left and Right Ctrl+T", "Tile Up and Down (g)", "Full Size Ctrl+/ (g)",
    "| 1 Untitled 1 Front Panel on NewVI14.sdproj/My Computer", "2 Untitled 1 Block Diagram on NewVI14.sdproj/My Computer",
    "| 3 NewVI14.sdproj * - Project Explorer", "| All Windows... Ctrl+Shift+W (g)",
  ]);
  assert.equal(listedIndexOf(inside.submenus.get(panelMenu)[6].id), 1, "a listed row knows which window it stands for");
  // The rows run the window's commands; a listed row brings its window forward.
  const page = source("editor/src/window/editor-window.mjs");
  for (const row of ["show-block-diagram", "show-front-panel"]) assert.match(page, new RegExp(`"${row}": \\(\\) => \\(confirmarEscritura\\(\\), window\\.solder\\?\\.alternarVentana\\(\\)\\)`));
  assert.match(page, /const listed = windowRows\[listedIndexOf\(id\)\];\n  if \(listed\) \{[\s\S]*?activateWindow\(listed\.key\)/);
  // Most recently active window first (Q1: the window the menu is opened from comes first).
  assert.match(source("editor/electron/main.mjs"), /const oviWindowList = \(\) =>[\s\S]*?\.sort\(\(first, second\) => second\.activation - first\.activation\)/);
  // The window that asks for the list is the active one, even when no focus event came (found under Xvfb, reports/2026-11-22-ovi-project-menus-editor-try.md).
  assert.match(source("editor/electron/project-manager.mjs"), /"project:window-list", \(event\) => \{[\s\S]*?else host\.windowActivated\(event\.sender\.id\);\n      return currentWindowList\(\);/);
  assert.match(source("editor/electron/main.mjs"), /function noteWindowActivated\(contentsId\)[\s\S]*?open\.activations\[kind\] = \+\+windowActivations;/);
});

test("the OVI windows' Project menu has LabVIEW's rows, and outside a project only Create and Open are enabled", () => {
  const projectMenu = "window.block-diagram.menu.project";
  // Q3: the same rows on both windows; the not-built ones are greyed as holes, the measured greyed ones among them.
  const inside = PM.projectMenuVariant(INV, "block-diagram", projectMenu, { inProject: true });
  assert.deepEqual(rows(projectMenu, inside), [
    "Create Project...", "Open Project...", "Save Project", "Close Project", "| Add To Project (g)", "| Package Dependencies... (g)",
    "| Filter View (g)", "Show Item Paths (g)", "File Information (g)", "Resolve Conflicts... (g)", "| Project Environment Settings... (g)", "| Properties (g)",
  ]);
  assert.deepEqual(rows(`${projectMenu}.add-to-project`), ["New OVI (g)", "New... (g)", "| File... (g)", "Folder (Snapshot)... (g)", "Folder (Auto-populating)... (g)", "Hyperlink... (g)"]);
  assert.deepEqual(rows("window.front-panel.menu.project"), rows(projectMenu));
  const outside = PM.projectMenuVariant(INV, "block-diagram", projectMenu, { inProject: false });
  assert.deepEqual(rows(projectMenu, outside).filter((row) => !row.endsWith("(g)")), ["Create Project...", "Open Project..."]);
  // File ▸ Save Project and Close Project follow the same rule.
  const file = PM.projectMenuVariant(INV, "front-panel", "window.front-panel.menu.file", { inProject: false });
  assert.deepEqual([...file.desactivados], ["window.front-panel.menu.file.save-project", "window.front-panel.menu.file.close-project"]);
  assert.equal(PM.projectMenuVariant(INV, "front-panel", "window.front-panel.menu.file", { inProject: true }).desactivados.size, 0);
  // They ask the main process, which acts on the OVI's project: Show Project brings its explorer forward, restored (Q2).
  assert.deepEqual(PM.PROJECT_COMMANDS, { "show-project": "show", "save-project": "save", "close-project": "close" });
  const main = source("editor/electron/main.mjs");
  assert.match(main, /ipcMain\.on\("ovi:project-command"[\s\S]*?projects\.runForProject\(projectId, command, ownerOf\(event\)\)/);
  assert.match(main, /inProject: entry\.project !== undefined/);
  assert.match(main, /window\.webContents\.send\("ovi:in-project", open\.entry\.project !== undefined\)/);
  const manager = source("editor/electron/project-manager.mjs");
  assert.match(manager, /if \(command === "show"\) return bringToFront\(entry\);/);
  // A second Save Project while the first one asks does nothing (found under Xvfb: four questions piled up).
  assert.match(manager, /async function saveProject\(entry, owner\) \{\n    if \(saving\.has\(entry\.id\)\) return false;/);
  assert.match(manager, /function showWindow\(window\) \{\n    if \(window\.isMinimized\(\)\) window\.restore\(\);/);
});
