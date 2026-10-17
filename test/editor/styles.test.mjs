// Rule 57, on the styling side: what tells a placeholder apart from an element
// disabled by context lives in styles.css and applies only to placeholders.
// That it is visible at a glance is checked by eye, not here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { oldSchoolToken } from "./old-school-theme.mjs";

const css = readFileSync(new URL("../../editor/src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, cuerpo]) => ({
  selectores: sel.split(",").map((s) => s.trim()),
  cuerpo,
}));
const selectoresCon = (cumple) => reglas.filter(cumple).flatMap((r) => r.selectores);
const color = (selector) => reglas.find((r) => r.selectores.includes(selector))?.cuerpo.match(/(?:^|;|\s)color:\s*([^;]+)/)?.[1].trim();

test("un hueco no se confunde con un desactivado por contexto", () => {
  const cursiva = selectoresCon((r) => /font-style:\s*italic/.test(r.cuerpo));
  const esquina = selectoresCon((r) => r.selectores.some((s) => s.endsWith("::after")) && /linear-gradient\(225deg/.test(r.cuerpo));
  assert.ok(cursiva.length > 0 && cursiva.every((s) => s.includes(".hueco")), `cursiva fuera de un hueco: ${cursiva}`);
  assert.ok(esquina.length > 0 && esquina.every((s) => s.includes(".hueco")), `esquina doblada fuera de un hueco: ${esquina}`);
  assert.ok(![...cursiva, ...esquina].some((s) => s.includes(".desactivado")));
  assert.ok(color(".desactivado"), "falta el aspecto de lo desactivado por contexto");
  assert.notEqual(color(".hueco"), color(".desactivado"));
});

// Measured at 1:1 on LabVIEW's menus and lists (cluster/w13.png, w14.png): a #a0a0a0 border and
// separators of a #a0a0a0 line over a white one. The stylesheet asks for tokens; Old School gives them the measured values.
test("menus and drop-down lists have LabVIEW's border and separators", () => {
  const body = (selector) => reglas.find((r) => r.selectores.includes(selector))?.cuerpo ?? "";
  assert.match(body(".menu-contextual"), /border:\s*1px solid var\(--menu-border\)/);
  assert.match(body(".separador-menu"), /height:\s*2px;\s*background:\s*var\(--menu-separator-dark\);\s*border-bottom:\s*1px solid var\(--menu-separator-light\)/);
  assert.equal(oldSchoolToken("--menu-border"), "#a0a0a0");
  assert.equal(oldSchoolToken("--menu-separator-dark"), "#a0a0a0");
  assert.equal(oldSchoolToken("--menu-separator-light"), "#fff");
});

// Colors measured in LabVIEW and quoted in the comments of the stylesheets and the views: the tokens that carry them.
test("Old School keeps the values measured in LabVIEW", () => {
  const measured = {
    "--getting-started-text": "#161617", // labview-captures/reports/2026-10-15-getting-started.md
    "--getting-started-panel-border": "#aeb0b3",
    "--getting-started-list-border": "#abadb0",
    "--getting-started-strip-background": "#f1f1f2",
    "--debug-label-background": "#ccffff", // debugging/REPORT.md §1, 31-zoom-sheet.png
    "--debug-label-border": "#333333",
    "--probe-background": "#ffff66", // §3, 55c
    "--breakpoint-color": "#cc0000", // §4, 71d and 73b
    "--structure-tint": "#f5f5fc", // reports/2026-10-16-warnings-frame-stops.md §B
    "--debug-band-number": "#a3a3d6",
    "--debug-band-boolean": "#a3bca3",
    "--chrome-background": "#f0f0f0",
    "--panel-background": "#e2e2e2",
    "--diagram-background": "#fff",
    "--node-fill": "#ffffcc",
    "--node-border": "#2b2b22",
    "--time-node-border": "#4c4c3d",
  };
  for (const [token, value] of Object.entries(measured)) assert.equal(oldSchoolToken(token), value, token);
});
