// The Application Instance box at the bottom left of an OVI window, as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-24-typedef-mark-and-footer.md Q3, Q4).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as V from "../../editor/src/window/window-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import { APPLICATION_INSTANCE_MENU_ROOT, openApplicationInstanceMenu } from "../../editor/src/common/application-instance-menu.mjs";
import { INV } from "../helpers.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const INSTANCE = "NewVI14.sdproj/My Computer";

test("the Application Instance box shows only in a project and its menu has LabVIEW's two rows", () => {
  for (const kind of ["front-panel", "block-diagram"]) {
    // Q3: an OVI in no project shows nothing in the strip, no sample text.
    assert.doesNotMatch(V.ventana(INV, kind, { paleta: null }, {}), /class="[^"]*instancia/, kind);
    // Q4: in a project, its instance, as a box that is no placeholder.
    const box = V.ventana(INV, kind, { paleta: null }, { applicationInstance: INSTANCE }).match(/<div class="([^"]*instancia[^"]*)"[^>]*>([^<]*)<\/div>/);
    assert.equal(box[2], INSTANCE, kind);
    assert.doesNotMatch(box[1], /hueco/, `${kind}: built, not greyed`);
  }
  // Its right-click menu: Main Application Instance, then the OVI's own instance, greyed.
  const opened = openApplicationInstanceMenu({ g: { nodos: [], cables: [] } }, 30, 700, INSTANCE);
  const variants = ED.variantes(opened, null, INV);
  const rows = INV.hijos(APPLICATION_INSTANCE_MENU_ROOT).filter((entry) => !variants.ocultos?.has(entry.id));
  assert.deepEqual(rows.map((entry) => variants.rotulos.get(entry.id) ?? entry.etiqueta), ["Main Application Instance", INSTANCE]);
  assert.ok(variants.desactivados.has(`${APPLICATION_INSTANCE_MENU_ROOT}.current`));
  assert.ok(rows.every((entry) => !entry.separado), "no separator");
  // The page opens it from the box, before the canvas's own menus.
  const page = source("editor/src/window/editor-window.mjs");
  assert.match(page, /if \(ev\.target\.closest\("\.instancia"\)\) return applicationInstanceMenu\(ev\);/);
  // The box: 1 px black border, the text 2 px after it and about 8 px before the right one.
  assert.match(source("editor/src/styles.css"), /\.instancia \{[^}]*border: 1px solid var\(--status-instance-border\);[^}]*padding: 0 8px 0 2px;/);
  assert.match(source("editor/src/themes/old-school.css"), /--status-instance-border: #000000;/);
  // Q3, Q4: the strip is 16 px under its 1 px line, and the box covers both: 17 px.
  assert.equal(V.MEDIDAS.altoEstado, 16);
});
