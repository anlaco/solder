// Rule 57, on the styling side: what tells a placeholder apart from an element
// disabled by context lives in styles.css and applies only to placeholders.
// That it is visible at a glance is checked by eye, not here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

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
// separators of a #a0a0a0 line over a white one.
test("menus and drop-down lists have LabVIEW's border and separators", () => {
  const body = (selector) => reglas.find((r) => r.selectores.includes(selector))?.cuerpo ?? "";
  assert.match(body(".menu-contextual"), /border:\s*1px solid #a0a0a0/);
  assert.match(body(".separador-menu"), /height:\s*2px;\s*background:\s*#a0a0a0;\s*border-bottom:\s*1px solid #fff/);
});
