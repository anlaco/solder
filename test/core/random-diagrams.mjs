// Random numeric diagrams for the property tests of the compiler (compiler-properties.test.mjs): a description of a
// diagram drawn from a seed, the OVI built from it in one of several placements, and what it must give by the
// reference evaluator (numeric-oracle.mjs).

import * as Gr from "../../core/model/graph.mjs";
import { buildOVI } from "../helpers.mjs";
import { FUNCTIONS, controlValue, convert } from "./numeric-oracle.mjs";

const NUMERIC_TYPES = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "sgl", "number"];
const COMPARISONS = ["equal", "less", "greater-or-equal"];
const LOGICAL = ["and-op", "or-op", "xor-op"];
const NUMERIC_BLOCKS = Object.keys(FUNCTIONS).filter((block) => !COMPARISONS.includes(block) && block !== "select");

/** A repeatable source of random choices (the mulberry32 generator): the same seed draws the same diagram. */
export function randomSource(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
  const below = (count) => Math.floor(next() * count);
  return { below, pick: (list) => list[below(list.length)], chance: (probability) => next() < probability };
}

/**
 * A diagram of numeric functions: `controls`, each `{ name, type }`, and `nodes` in dataflow order, each
 * `{ name, block, inputs }` with `inputs` mapping a port to the output it is wired from, `{ from, port }`.
 */
export function randomDiagram(random, cat) {
  const controls = Array.from({ length: 2 + random.below(3) }, (_, index) => ({ name: `c${index}`, type: random.pick(NUMERIC_TYPES) }));
  const numbers = controls.map((control) => ({ from: control.name, port: "result" }));
  const booleans = [];
  const nodes = [];
  const nodeCount = 3 + random.below(8);
  for (let index = 0; index < nodeCount; index++) {
    const block = chooseBlock(random, booleans.length > 0);
    const ofBooleans = LOGICAL.includes(block) && booleans.length > 0 && random.chance(0.5);
    const ports = cat.puertos({ tipo: block });
    const inputs = Object.fromEntries(ports.in.map((port) => [port.name, random.pick(ofBooleans || port.type === "boolean" ? booleans : numbers)]));
    const name = `n${index}`;
    nodes.push({ name, block, inputs });
    const givesBooleans = COMPARISONS.includes(block) || ofBooleans;
    for (const port of ports.out) (givesBooleans ? booleans : numbers).push({ from: name, port: port.name });
  }
  return { controls, nodes };
}

function chooseBlock(random, hasBooleans) {
  if (random.chance(0.2)) return random.pick(COMPARISONS);
  if (hasBooleans && random.chance(0.2)) return "select";
  return random.pick(NUMERIC_BLOCKS);
}

/** Where a diagram is drawn: on the diagram itself or inside a structure that runs it once, with or without two Waits beside it. */
export const PLACEMENTS = [
  { name: "on the diagram", structure: null, waits: false },
  { name: "beside two Waits", structure: null, waits: true },
  { name: "in a For Loop", structure: "for-loop", waits: false },
  { name: "in a For Loop that is a subplan", structure: "for-loop", waits: true },
  { name: "in a Case", structure: "case-structure", waits: false },
  { name: "in a Case that is a subplan", structure: "case-structure", waits: true },
];

/** The frame of a Case with a Boolean selector that TRUE chooses. */
const TRUE_FRAME = 1;
const STRUCTURE = "structure";

/**
 * Builds the OVI of `diagram` in `placement`: a control for each of its controls and an indicator for every output of
 * every node, so that nothing it computes goes unseen. Gives `{ g, id, shown }`: `shown` lists each indicator's name
 * with the node and port it shows.
 */
export function buildDiagram(diagram, placement, cat) {
  const { structure, waits } = placement;
  const inside = structure ? STRUCTURE : undefined;
  const frame = structure === "case-structure" ? TRUE_FRAME : undefined;
  const isBoolean = booleanOutputs(diagram, cat);
  const shown = [];
  const outputTunnels = [];
  const vi = buildOVI(cat, (b) => {
    if (structure) runOnce(b, structure);
    // What a node inside reads a control from: the control's own output, or its input tunnel's.
    const controlOutput = new Map();
    for (const control of diagram.controls) {
      b.node(control.name, "control");
      controlOutput.set(control.name, structure ? `${throughInputTunnel(b, control.name)}.y` : `${control.name}.result`);
    }
    if (waits) twoWaits(b, inside, frame, "");
    if (structure === "case-structure") unchosenFrame(b, diagram, controlOutput, waits);
    for (const node of diagram.nodes) {
      b.node(node.name, node.block, null, inside, frame);
      for (const [port, source] of Object.entries(node.inputs)) b.wire(controlOutput.get(source.from) ?? `${source.from}.${source.port}`, `${node.name}.${port}`);
      for (const port of cat.puertos({ tipo: node.block }).out) {
        const indicator = `show ${node.name} ${port.name}`;
        b.node(indicator, isBoolean.has(`${node.name}.${port.name}`) ? "bool-indicator" : "indicator");
        shown.push({ indicator, node: node.name, port: port.name });
        if (!structure) b.wire(`${node.name}.${port.name}`, `${indicator}.value`);
        else outputTunnels.push(throughOutputTunnel(b, node.name, port.name, indicator, frame));
      }
    }
  });
  // A Case's output tunnel is wired in the TRUE frame only: the other one gives the default value.
  if (structure === "case-structure") for (const tunnel of outputTunnels) vi.g = Gr.fijarConfig(vi.g, vi.id[tunnel], { "use-default": true });
  for (const control of diagram.controls) vi.g = Gr.fijarRepresentacion(vi.g, vi.id[control.name], control.type);
  return { ...vi, shown };
}

/** The outputs of `diagram` that are Booleans, as "node.port". */
function booleanOutputs(diagram, cat) {
  const booleans = new Set();
  for (const node of diagram.nodes) {
    const ofBooleans = LOGICAL.includes(node.block) && Object.values(node.inputs).every((source) => booleans.has(`${source.from}.${source.port}`));
    if (COMPARISONS.includes(node.block) || ofBooleans) for (const port of cat.puertos({ tipo: node.block }).out) booleans.add(`${node.name}.${port.name}`);
  }
  return booleans;
}

/** The structure, set to run its contents once: a For Loop of one turn, or a Case whose selector is TRUE. */
function runOnce(b, structure) {
  b.loop(STRUCTURE, structure);
  if (structure === "for-loop") {
    b.node("one turn", "num-const", { value: 1 });
    b.wire("one turn.result", `${STRUCTURE}:N.count`);
  } else {
    b.node("chosen", "bool-const", { value: true });
    b.wire("chosen.result", `${STRUCTURE}:sel.selector`);
  }
}

function throughInputTunnel(b, control) {
  const tunnel = `in ${control}`;
  b.tunnel(tunnel, STRUCTURE, "in");
  b.wire(`${control}.result`, `${tunnel}.x`);
  return tunnel;
}

function throughOutputTunnel(b, node, port, indicator, frame) {
  const tunnel = `out ${node} ${port}`;
  b.tunnel(tunnel, STRUCTURE, "out");
  b.wire(`${node}.${port}`, `${tunnel}.${frame === undefined ? "x" : `x-${frame}`}`);
  b.wire(`${tunnel}.y`, `${indicator}.value`);
  return tunnel;
}

/**
 * Two Wait (ms) of 0 ms: two nodes that take time make the scope they are in run as clumps of its own (DT-040, DT-041).
 * `suffix` tells the pairs of two scopes apart.
 */
function twoWaits(b, inside, frame, suffix) {
  b.node(`no time${suffix}`, "num-const", { value: 0 }, inside, frame);
  for (const wait of [`first wait${suffix}`, `second wait${suffix}`]) {
    b.node(wait, "wait-ms", null, inside, frame);
    b.wire(`no time${suffix}.result`, `${wait}.ms`);
  }
}

/**
 * The frame of the Case that does not run: it reads every input tunnel too, as the chosen one does, so that what the
 * compiler emits for one frame's readers cannot be what the other frame's rely on.
 */
function unchosenFrame(b, diagram, controlOutput, waits) {
  const frame = 1 - TRUE_FRAME;
  if (waits) twoWaits(b, STRUCTURE, frame, " unchosen");
  for (const control of diagram.controls) {
    b.node(`unchosen ${control.name}`, "increment", null, STRUCTURE, frame);
    b.wire(controlOutput.get(control.name), `unchosen ${control.name}.x`);
  }
}

/**
 * Gives every indicator the representation of the output it shows and returns the resolved types, or null when the
 * diagram has a broken wire (two types that no function of the catalog takes together).
 */
export function resolveTypes(built, cat) {
  const before = Gr.tipos(built.g, cat);
  for (const { indicator, node, port } of built.shown) {
    const type = before.salidas.get(`${built.id[node]}.${port}`);
    if (typeof type !== "string") return null;
    if (type !== "boolean") built.g = Gr.fijarRepresentacion(built.g, built.id[indicator], type);
  }
  const types = Gr.tipos(built.g, cat);
  return [...types.cables.values()].some((wire) => wire.roto) ? null : types;
}

/** Every output of `diagram` for the control values `controlValues` (by control name, already in each control's type), as "node.port" → value, with its types. */
function evaluate(diagram, built, types, controlValues, cat) {
  const values = new Map();
  const typeOf = new Map();
  for (const control of diagram.controls) {
    values.set(`${control.name}.result`, controlValues[control.name]);
    typeOf.set(`${control.name}.result`, control.type);
  }
  for (const node of diagram.nodes) {
    const ports = cat.puertos({ tipo: node.block });
    const inputTypes = Object.fromEntries(ports.in.map((port) => [port.name, types.entradas.get(`${built.id[node.name]}.${port.name}`)]));
    const outputTypes = Object.fromEntries(ports.out.map((port) => [port.name, types.salidas.get(`${built.id[node.name]}.${port.name}`)]));
    const inputs = Object.fromEntries(Object.entries(node.inputs).map(([port, source]) => {
      const wired = `${source.from}.${source.port}`;
      return [port, convert(values.get(wired), typeOf.get(wired), inputTypes[port])];
    }));
    const outputs = FUNCTIONS[node.block](inputs, inputTypes, outputTypes);
    for (const port of ports.out) {
      values.set(`${node.name}.${port.name}`, outputs[port.name]);
      typeOf.set(`${node.name}.${port.name}`, outputTypes[port.name]);
    }
  }
  return { values, typeOf };
}

const inControlTypes = (diagram, panel) => Object.fromEntries(diagram.controls.map((control) => [control.name, controlValue(control.type, panel[control.name])]));

/** What `diagram` must show for the panel values `panel` (by control name), by indicator name: the reference evaluator's answer. */
export function expectedValues(diagram, built, types, panel, cat) {
  const { values } = evaluate(diagram, built, types, inControlTypes(diagram, panel), cat);
  return Object.fromEntries(built.shown.map(({ indicator, node, port }) => [indicator, values.get(`${node}.${port}`)]));
}

// ——— A diagram run turn after turn, its first control fed back through a shift register ———

const CONVERSION_TO = { i8: "to-byte-integer", i16: "to-word-integer", i32: "to-long-integer", i64: "to-quad-integer", u8: "to-unsigned-byte-integer", u16: "to-unsigned-word-integer", u32: "to-unsigned-long-integer", u64: "to-unsigned-quad-integer", sgl: "to-single-precision-float", number: "to-double-precision-float" };
export const FINAL = "final";

/** The numeric output of `diagram` that is fed back: its last one, or its first control when every node gives Booleans. */
function fedBack(diagram, cat) {
  const booleans = booleanOutputs(diagram, cat);
  const numeric = diagram.nodes.flatMap((node) => cat.puertos({ tipo: node.block }).out.map((port) => `${node.name}.${port.name}`)).filter((output) => !booleans.has(output));
  return numeric.at(-1) ?? `${diagram.controls[0].name}.result`;
}

/**
 * Builds `diagram` inside a For Loop of `turns` turns. Its first control starts a shift register, which the nodes read
 * in its place; each turn leaves in the register one of the diagram's outputs, converted to the control's type. The
 * indicator FINAL shows the register when the loop ends, and one indicator per output shows its last turn's value.
 */
export function buildIteratedDiagram(diagram, turns, waits, cat) {
  const [first, ...others] = diagram.controls;
  const isBoolean = booleanOutputs(diagram, cat);
  const shown = [];
  const vi = buildOVI(cat, (b) => {
    b.loop(STRUCTURE, "for-loop");
    b.node("turns", "num-const", { value: turns });
    b.wire("turns.result", `${STRUCTURE}:N.count`);
    b.shiftRegister("register", STRUCTURE);
    b.node(first.name, "control");
    b.wire(`${first.name}.result`, "register.left.init");
    const controlOutput = new Map([[first.name, "register.left.value"]]);
    for (const control of others) {
      b.node(control.name, "control");
      controlOutput.set(control.name, `${throughInputTunnel(b, control.name)}.y`);
    }
    if (waits) twoWaits(b, STRUCTURE, undefined, "");
    for (const node of diagram.nodes) {
      b.node(node.name, node.block, null, STRUCTURE);
      for (const [port, source] of Object.entries(node.inputs)) b.wire(controlOutput.get(source.from) ?? `${source.from}.${source.port}`, `${node.name}.${port}`);
      for (const port of cat.puertos({ tipo: node.block }).out) {
        const indicator = `show ${node.name} ${port.name}`;
        b.node(indicator, isBoolean.has(`${node.name}.${port.name}`) ? "bool-indicator" : "indicator");
        shown.push({ indicator, node: node.name, port: port.name });
        throughOutputTunnel(b, node.name, port.name, indicator, undefined);
      }
    }
    b.node("to the register", CONVERSION_TO[first.type], null, STRUCTURE);
    b.wire(controlOutput.get(fedBack(diagram, cat).split(".")[0]) ?? fedBack(diagram, cat), "to the register.number");
    b.wire("to the register.result", "register.right.value");
    b.node(FINAL, "indicator");
    b.wire("register.right.result", `${FINAL}.value`);
  });
  for (const control of diagram.controls) vi.g = Gr.fijarRepresentacion(vi.g, vi.id[control.name], control.type);
  vi.g = Gr.fijarRepresentacion(vi.g, vi.id[FINAL], first.type);
  return { ...vi, shown };
}

/** The default value of `type`: what an output tunnel gives when its loop runs no turn. */
const defaultOf = (type) => (type === "boolean" ? false : NUMERIC_TYPES.includes(type) && type !== "sgl" && type !== "number" ? 0n : 0);

/** What the OVI of buildIteratedDiagram must show after `turns` turns, by indicator name. */
export function expectedAfterTurns(diagram, built, types, panel, turns, cat) {
  const controlValues = inControlTypes(diagram, panel);
  const first = diagram.controls[0];
  const output = fedBack(diagram, cat);
  let last = null;
  for (let turn = 0; turn < turns; turn++) {
    last = evaluate(diagram, built, types, controlValues, cat);
    controlValues[first.name] = convert(last.values.get(output), last.typeOf.get(output), first.type);
  }
  const shownValue = ({ node, port }) => (last ? last.values.get(`${node}.${port}`) : defaultOf(types.salidas.get(`${built.id[node]}.${port}`)));
  return { [FINAL]: controlValues[first.name], ...Object.fromEntries(built.shown.map((output_) => [output_.indicator, shownValue(output_)])) };
}
