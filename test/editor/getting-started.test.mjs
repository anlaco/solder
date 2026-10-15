// The Getting Started window's page (DT-052): carousel, collapse button, filter, list, menu bar and
// the explanations of what is greyed. The state is pure and the view is a string, so none of it needs a browser.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { CAPTIONS, CAROUSEL_PAGES } from "../../editor/src/getting-started/carousel-pages.mjs";
import {
  MENU_COMMANDS, chooseFilter, fileName, pageState, pagerText, recentFileRows, releaseChannel, stepCarousel, toggleCollapsed, toggleFilterList, visibleFiles,
} from "../../editor/src/getting-started/getting-started-state.mjs";
import { gettingStartedWindow } from "../../editor/src/getting-started/getting-started-view.mjs";
import { CAROUSEL_PAGE_COUNT, RECENT_FILTERS } from "../../editor/src/getting-started/start-state.mjs";
import * as E from "../../editor/src/window/window-state.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const PREFIX = "window.getting-started";
const RECENT = ["/home/ana/vis/Two Calls.sdg", "/home/ana/vis/Add.sdg", "C:\\Users\\ana\\Notes.txt", "/home/ana/p/Bench.sdproj"];
const measure = (text) => text.length * 6;
const windowSize = { width: 837, height: 526 };
const draw = (state) => gettingStartedWindow(INV, state, measure, windowSize);
const start = (saved = {}) => pageState({ recentFiles: RECENT, carouselPage: 0, version: "0.3.0-alpha", ...saved });

test("the carousel has eight pages of its own and wraps both ways", () => {
  assert.equal(CAROUSEL_PAGES.length, CAROUSEL_PAGE_COUNT);
  for (const page of CAROUSEL_PAGES) assert.ok(page.heading && page.body && !/\bNI\b/.test(page.heading + page.body));
  let state = start({ carouselPage: CAROUSEL_PAGE_COUNT - 1 });
  assert.equal(pagerText(state), "8 / 8");
  state = stepCarousel(state, 1);
  assert.equal(pagerText(state), "1 / 8");
  state = stepCarousel(state, -1);
  assert.equal(pagerText(state), "8 / 8");
  assert.equal(pagerText(start({ carouselPage: 6 })), "7 / 8", "it starts on the page the main process says");
});

test("the carousel shows its page, and collapsing it keeps only the button, turned into <<", () => {
  const open = draw(start({ carouselPage: 2 }));
  assert.ok(open.includes(CAROUSEL_PAGES[2].heading) && open.includes("3 / 8"));
  const collapsed = draw(toggleCollapsed(start()));
  assert.ok(!collapsed.includes(CAROUSEL_PAGES[0].heading) && !collapsed.includes("gs-pager"));
  assert.ok(collapsed.includes('data-action="collapse"'));
  assert.notEqual(open.match(/<button class="gs-collapse"[\s\S]*?<\/button>/)[0], collapsed.match(/<button class="gs-collapse"[\s\S]*?<\/button>/)[0], "the arrows turn around");
  assert.equal(toggleCollapsed(toggleCollapsed(start())).collapsed, false);
});

test("the filter has LabVIEW's four choices, checks the current one and filters the list", () => {
  let state = start();
  assert.equal(state.filter, "All Recent Files");
  assert.equal(visibleFiles(state).length, RECENT.length);
  state = toggleFilterList(state);
  const list = draw(state);
  for (const filter of RECENT_FILTERS) assert.ok(list.includes(`data-filter="${filter}"`));
  assert.match(list, /item-menu marcado" data-filter="All Recent Files"/);
  state = chooseFilter(state, "Recent VIs");
  assert.equal(state.filterOpen, false);
  assert.deepEqual(visibleFiles(state), RECENT.slice(0, 2));
  assert.deepEqual(visibleFiles(chooseFilter(state, "Recent Projects")), [RECENT[3]]);
  assert.deepEqual(visibleFiles(chooseFilter(state, "Other Recent Files")), [RECENT[2]]);
  assert.equal(chooseFilter(state, "Nonsense"), state);
});

test("the recent list shows file names, with the whole path as the tooltip, and nothing when empty", () => {
  assert.equal(fileName("/home/ana/vis/Two Calls.sdg"), "Two Calls.sdg");
  assert.equal(fileName("C:\\Users\\ana\\Notes.txt"), "Notes.txt");
  const html = draw(start());
  assert.match(html, /title="\/home\/ana\/vis\/Two Calls\.sdg"[^>]*>[\s\S]*?<span>Two Calls\.sdg<\/span>/);
  assert.ok(!html.includes("<span>/home/ana"), "the path is not shown, only named in the tooltip");
  assert.ok(html.includes('data-path="/home/ana/vis/Add.sdg"'), "a click opens the file by its path");
  const empty = draw(start({ recentFiles: [] }));
  assert.ok(!empty.includes("gs-recent\""), "an empty list has no rows");
});

test("the header says Solder, its version and its release channel", () => {
  assert.equal(releaseChannel("0.3.0-alpha"), "Alpha");
  assert.equal(releaseChannel("1.2.0-beta.2"), "Beta");
  assert.equal(releaseChannel("1.0.0"), "Release");
  const html = draw(start());
  assert.match(html, /Solder 0\.3\.0<\/span><span class="gs-channel">Alpha</);
  assert.ok(!/LabVIEW/.test(html), "no NI name in the page");
});

test("the captions are written about Solder", () => {
  const html = draw(start());
  for (const caption of CAPTIONS) assert.ok(html.includes(caption.heading) && html.includes(caption.body));
});

test("Getting Started greyed items explain themselves through the inventory", () => {
  const html = draw(start());
  const greyed = [...html.matchAll(/class="[^"]*\bhueco\b[^"]*" data-id="([^"]+)"/g)].map((match) => match[1]);
  for (const id of [`${PREFIX}.create-project`, `${PREFIX}.recent-project-templates.blank-project`, `${PREFIX}.carousel-link`, `${PREFIX}.caption-link`]) {
    assert.ok(greyed.includes(id), `${id} is greyed`);
  }
  for (const id of greyed) {
    const entry = INV.resolver(id);
    assert.ok(esHueco(entry), `${id} is greyed but the inventory calls it ${entry.estado}`);
    const { labview, solder } = INV.explicacion(entry);
    assert.ok(labview && solder, `${id} says what LabVIEW does and what Solder lacks`);
  }
  // Clicking one opens the explanation, as in the VI windows.
  const clicked = E.clic(start(), INV, `${PREFIX}.create-project`, { x: 60, y: 160 });
  assert.match(draw(clicked), /class="explicacion" data-explicacion="window\.getting-started\.create-project"[\s\S]*En Solder: falta/);
});

test("File menu rows run the commands of the window", () => {
  const rows = INV.hijos(`${PREFIX}.menu.file`);
  assert.deepEqual(rows.map((row) => row.etiqueta), ["New VI", "New...", "Open...", "Create Project...", "Open Project...", "Recent Projects", "Recent Files", "Exit"]);
  assert.deepEqual(rows.filter((row) => row.separado).map((row) => row.etiqueta), ["Create Project...", "Recent Projects", "Exit"]);
  assert.deepEqual(rows.map((row) => row.atajo ?? null), ["Ctrl+N", null, "Ctrl+O", null, null, null, null, "Ctrl+Q"]);
  const built = rows.filter((row) => !esHueco(row)).map((row) => ultimo(row.id));
  assert.deepEqual(built, ["new-vi", "open", "recent-files", "exit"]);
  assert.deepEqual(Object.keys(MENU_COMMANDS).sort(), ["exit", "new-vi", "open"], "every built row except Recent Files has a command");
  assert.deepEqual(INV.hijos(`${PREFIX}.menu`).map((menu) => menu.etiqueta), ["File", "Operate", "Tools", "Help"]);
  // The open menu draws every row, in order, with its shortcut.
  const state = E.abrirMenuBarra(start(), INV, `${PREFIX}.menu.file`, { x: 0, y: 20 });
  const html = draw(state);
  const order = rows.map((row) => html.indexOf(`>${row.etiqueta}<`));
  assert.ok(order.every((position, index) => position > 0 && (index === 0 || position > order[index - 1])));
  assert.ok(html.includes(">Ctrl+Q<"));
});

test("Recent Files lists the recent files by name and opens them", () => {
  const rows = recentFileRows(RECENT);
  assert.deepEqual(rows.map((row) => row.etiqueta), ["Two Calls.sdg", "Add.sdg", "Notes.txt", "Bench.sdproj"]);
  assert.deepEqual(rows.map((row) => row.filePath), RECENT, "each row knows the path to open");
  const recentFilesId = `${PREFIX}.menu.file.recent-files`;
  let state = E.abrirMenuBarra(start(), INV, `${PREFIX}.menu.file`, { x: 0, y: 20 });
  assert.ok(!draw(state).includes("Two Calls.sdg</span></div>") || !draw(state).includes("recent-files.file-0"), "the submenu is closed until its row opens");
  state = { ...state, menuBarra: { ...state.menuBarra, abierto: recentFilesId } };
  const html = draw(state);
  for (const row of rows) assert.ok(html.includes(`data-id="${row.id}"`));
  const empty = draw({ ...start({ recentFiles: [] }), menuBarra: { id: `${PREFIX}.menu.file`, x: 0, y: 20, abierto: null } });
  assert.match(empty, /item-menu desactivado" data-id="window\.getting-started\.menu\.file\.recent-files"/, "with no recent files the row is disabled");
});

test("every menu of the bar opens and each of its rows is built or greyed with a reason", () => {
  for (const menu of INV.hijos(`${PREFIX}.menu`)) {
    assert.ok(INV.tieneContenido(menu.id), `${menu.etiqueta} has rows`);
    for (const row of INV.hijos(menu.id)) {
      if (esHueco(row)) assert.ok(INV.explicacion(row).solder, `${row.id} explains why it is greyed`);
    }
  }
  const tools = INV.hijos(`${PREFIX}.menu.tools`).map((row) => row.etiqueta);
  assert.equal(tools.length, 23);
  assert.equal(tools.at(-1), "Options...");
  const help = INV.hijos(`${PREFIX}.menu.help`);
  assert.equal(help.find((row) => row.etiqueta === "Show Context Help").atajo, "Ctrl+H");
  assert.equal(help.at(-1).etiqueta, "About Solder...");
});

test("View Getting Started Window is a command of the VI windows", () => {
  assert.equal(INV.resolver("window.block-diagram.menu.view.getting-started-window").estado, "built");
  const source = readFileSync(`${RAIZ}/editor/src/window/editor-window.mjs`, "utf8");
  assert.match(source, /"getting-started-window": \(\) => window\.solder\?\.inicio\.mostrar\(\)/);
});
