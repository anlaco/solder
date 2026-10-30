// What the Front Panel answers a Property Node while an OVI runs (DT-072 §6), and how it shows it, as measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-10-30-panel-property-node-behavior.md).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as PP from "../../editor/src/front-panel/panel-properties.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };

/** A panel with one numeric control placed at (100, 100), and its node id. */
function panelWithControl() {
  let p = P.coger(P.inicial(), "control");
  p = P.moverA(p, CTX, { x: 100, y: 100 });
  p = P.confirmar(P.pulsar(p, CTX, FONDO, { x: 100, y: 100 }));
  return { p, id: p.g.nodos[0].id };
}

test("a control starts visible, enabled, without the key focus and without a caption", () => {
  const { p, id } = panelWithControl();
  const state = PP.emptyRunState();
  assert.equal(PP.readProperty(p.g, state, id, "Visible"), true);
  assert.equal(PP.readProperty(p.g, state, id, "Disabled"), PP.DISABLED.enabled);
  assert.equal(PP.readProperty(p.g, state, id, "Key Focus"), false);
  assert.equal(PP.readProperty(p.g, state, id, "Label:Text"), "Numeric");
  assert.equal(PP.readProperty(p.g, state, id, "Has Caption"), false);
  assert.deepEqual(PP.readProperty(p.g, state, id, "Caption:Text"), { error: 1320 });
});

test("Visible, Disabled and Key Focus keep what a Property Node writes", () => {
  const { p, id } = panelWithControl();
  let state = PP.emptyRunState();
  state = PP.writeProperty(p.g, state, id, "Visible", false).runState;
  state = PP.writeProperty(p.g, state, id, "Disabled", 2).runState;
  state = PP.writeProperty(p.g, state, id, "Key Focus", true).runState;
  assert.equal(PP.readProperty(p.g, state, id, "Visible"), false);
  assert.equal(PP.readProperty(p.g, state, id, "Disabled"), PP.DISABLED.grayed);
  assert.equal(PP.readProperty(p.g, state, id, "Key Focus"), true);
  assert.equal(PP.isOperable(state, id), false);
});

test("Position is the object's place and moves it; Bounds is its box", () => {
  const { p, id } = panelWithControl();
  const node = p.g.nodos[0];
  const box = P.caja(node);
  assert.deepEqual(PP.readProperty(p.g, PP.emptyRunState(), id, "Position"), { Left: node.panel.x, Top: node.panel.y });
  assert.deepEqual(PP.readProperty(p.g, PP.emptyRunState(), id, "Bounds"), { Width: box.ancho, Height: box.alto });
  const moved = PP.writeProperty(p.g, PP.emptyRunState(), id, "Position", { Left: 300, Top: 40 }).graph;
  assert.deepEqual(PP.readProperty(moved, PP.emptyRunState(), id, "Position"), { Left: 300, Top: 40 });
});

test("a hidden control is not drawn, nor its label; Disabled 2 greys both, Disabled 1 only stops it", () => {
  const { p, id } = panelWithControl();
  const drawn = (runProps) => P.contenido({ ...p, runProps }, CTX);
  assert.match(drawn(PP.emptyRunState()), new RegExp(`data-nodo="${id}"`));
  const hidden = PP.writeProperty(p.g, PP.emptyRunState(), id, "Visible", false).runState;
  assert.doesNotMatch(drawn(hidden), new RegExp(`data-nodo="${id}"`));
  assert.doesNotMatch(drawn(hidden), /sd-label/);
  const grayed = drawn(PP.writeProperty(p.g, PP.emptyRunState(), id, "Disabled", 2).runState);
  assert.match(grayed, /class="[^"]*sd-disabled sd-grayed[^"]*"/);
  assert.match(grayed, /etiqueta sd-label sd-grayed/);
  const disabled = drawn(PP.writeProperty(p.g, PP.emptyRunState(), id, "Disabled", 1).runState);
  assert.match(disabled, /sd-disabled/);
  assert.doesNotMatch(disabled, /sd-grayed/);
});
