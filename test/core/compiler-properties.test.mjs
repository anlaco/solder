// Properties of the compiler, over diagrams drawn at random (random-diagrams.mjs): whatever the diagram and whatever
// the panel holds, the compiled OVI shows what the reference evaluator computes (numeric-oracle.mjs), and it shows the
// same wherever the diagram is drawn: on the diagram, in a loop, in a Case, split into clumps or not. The examples of
// the other tests check the cases someone thought of; these check the ones nobody did.
//
// The seeds are fixed, so a run is repeatable: a failure names its seed, which SOLDER_PROPERTY_SEED runs alone.
// SOLDER_PROPERTY_DIAGRAMS=2000 tries that many diagrams instead of the few of every run.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { CAT } from "../helpers.mjs";
import { asShown, interestingValues } from "./numeric-oracle.mjs";
import { FINAL, PLACEMENTS, buildDiagram, buildIteratedDiagram, expectedAfterTurns, expectedValues, randomDiagram, randomSource, resolveTypes } from "./random-diagrams.mjs";

const FIRST_SEED = 1;
// Enough to pass in a few seconds with the rest of the tests; SOLDER_PROPERTY_DIAGRAMS asks for a longer hunt.
const DIAGRAMS = Number(process.env.SOLDER_PROPERTY_DIAGRAMS ?? 60);
const PANELS_PER_DIAGRAM = 4;
const onlySeed = process.env.SOLDER_PROPERTY_SEED ? Number(process.env.SOLDER_PROPERTY_SEED) : null;
const seeds = onlySeed === null ? Array.from({ length: DIAGRAMS }, (_, index) => FIRST_SEED + index) : [onlySeed];

/** A way to say a diagram in a failure message: each node with what it is wired from. */
const describe = (diagram) =>
  [...diagram.controls.map((control) => `${control.name}: ${control.type}`), ...diagram.nodes.map((node) => `${node.name} = ${node.block}(${Object.entries(node.inputs).map(([port, source]) => `${port}: ${source.from}.${source.port}`).join(", ")})`)].join("; ");

/** Panel values for the controls of `diagram`, each drawn from the interesting ones of its type. */
const randomPanel = (diagram, random) => Object.fromEntries(diagram.controls.map((control) => [control.name, random.pick(interestingValues(control.type))]));

const sayPanel = (panel) => JSON.stringify(panel, (_, value) => (typeof value === "bigint" ? `${value}n` : Number.isNaN(value) ? "NaN" : value));

const sameValue = (actual, expected) => Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected));

/** Compiles `diagram` in `placement` and checks what it shows for each panel; false when its types do not resolve. */
async function checkPlacement(diagram, placement, panels, context) {
  const built = buildDiagram(diagram, placement, CAT);
  const types = resolveTypes(built, CAT);
  if (!types) return false;
  const compiled = compilar(built.g, CAT);
  assert.ok(!compiled.errores, `${context}, ${placement.name}: ${JSON.stringify(compiled.errores)}`);
  for (const panel of panels) {
    const written = await ejecutar(compiled, Object.fromEntries(Object.entries(panel).map(([control, value]) => [built.id[control], value])));
    const expected = expectedValues(diagram, built, types, panel, CAT);
    for (const { indicator, node, port } of built.shown) {
      const [actual, wanted] = [written[built.id[indicator]], asShown(expected[indicator])];
      assert.ok(sameValue(actual, wanted), `${context}, ${placement.name}: ${node}.${port} is ${actual}, not ${wanted}, with ${sayPanel(panel)}`);
    }
  }
  return true;
}

test("a random numeric diagram shows what the reference evaluator computes, wherever it is drawn", async () => {
  let checked = 0;
  for (const seed of seeds) {
    const random = randomSource(seed);
    const diagram = randomDiagram(random, CAT);
    const panels = Array.from({ length: PANELS_PER_DIAGRAM }, () => randomPanel(diagram, random));
    const context = `seed ${seed} (${describe(diagram)})`;
    for (const placement of PLACEMENTS) if (await checkPlacement(diagram, placement, panels, context)) checked++;
  }
  // Most diagrams must be valid ones: a generator that drew only broken wires would check nothing.
  assert.ok(onlySeed !== null || checked >= (seeds.length * PLACEMENTS.length) / 2, `only ${checked} placements had types that resolve`);
});

const TURNS = [0, 1, 2, 3, 6];

/**
 * Compiles `diagram` fed back through a shift register, or a Feedback Node of `feedbackDelay` (DT-109), and checks what
 * it shows after `turns` turns; false when its types do not resolve.
 */
async function checkTurns(diagram, turns, waits, panel, context, memory = {}) {
  const built = buildIteratedDiagram(diagram, turns, waits, CAT, memory);
  const types = resolveTypes(built, CAT);
  if (!types) return false;
  const where = `${context}, ${turns} turns${waits ? " of a subplan" : ""}${memory.feedbackDelay ? `, through a Feedback Node of delay ${memory.feedbackDelay}` : ""}`;
  const compiled = compilar(built.g, CAT);
  assert.ok(!compiled.errores, `${where}: ${JSON.stringify(compiled.errores)}`);
  const written = await ejecutar(compiled, Object.fromEntries(Object.entries(panel).map(([control, value]) => [built.id[control], value])));
  const expected = expectedAfterTurns(diagram, built, types, panel, turns, CAT, memory);
  for (const indicator of [FINAL, ...built.shown.map((output) => output.indicator)]) {
    const [actual, wanted] = [written[built.id[indicator]], asShown(expected[indicator])];
    assert.ok(sameValue(actual, wanted), `${where}: "${indicator}" is ${actual}, not ${wanted}, with ${sayPanel(panel)}`);
  }
  return true;
}

test("a random diagram fed back through a shift register gives, after N turns, the evaluator applied N times", async () => {
  let checked = 0;
  for (const seed of seeds) {
    const random = randomSource(seed);
    const diagram = randomDiagram(random, CAT);
    const panel = randomPanel(diagram, random);
    const context = `seed ${seed} (${describe(diagram)})`;
    for (const waits of [false, true]) if (await checkTurns(diagram, random.pick(TURNS), waits, panel, context)) checked++;
  }
  assert.ok(onlySeed !== null || checked >= seeds.length, `only ${checked} loops had types that resolve`);
});

const FEEDBACK_DELAYS = [1, 2, 3];

test("a random diagram fed back through a Feedback Node gives, after N turns, the evaluator applied through its delay", async () => {
  let checked = 0;
  for (const seed of seeds) {
    const random = randomSource(seed);
    const diagram = randomDiagram(random, CAT);
    const panel = randomPanel(diagram, random);
    const context = `seed ${seed} (${describe(diagram)})`;
    const memory = { feedbackDelay: random.pick(FEEDBACK_DELAYS) };
    for (const waits of [false, true]) if (await checkTurns(diagram, random.pick(TURNS), waits, panel, context, memory)) checked++;
  }
  assert.ok(onlySeed !== null || checked >= seeds.length, `only ${checked} loops had types that resolve`);
});
