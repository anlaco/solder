// Format Into String and Scan From String compiled and run (spec/04 Rule 21j):
// the rows go to the host through memory and come back with their types.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { CAT } from "../helpers.mjs";

function build(steps) {
  const vi = { g: Gr.nuevo(), id: {} };
  steps({
    node(name, block, config) {
      const r = Gr.crearNodo(vi.g, CAT, block, 0, 0);
      vi.g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
      vi.id[name] = r.id;
    },
    wire(from, to) {
      const split = (end) => [end.slice(0, end.lastIndexOf(".")), end.slice(end.lastIndexOf(".") + 1)];
      const [[n1, p1], [n2, p2]] = [split(from), split(to)];
      const r = Gr.conectar(vi.g, CAT, { nodo: vi.id[n1], puerto: p1, dir: "out" }, { nodo: vi.id[n2], puerto: p2, dir: "in" });
      assert.ok(!r.motivo, `${from} → ${to}: ${r.motivo}`);
      vi.g = r.g;
    },
  });
  return vi;
}

async function run(vi, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([k, x]) => [x, k]));
  const written = await ejecutar(compiled, {}, options);
  return Object.fromEntries(Object.entries(written).map(([k, x]) => [byId[k], x]));
}

test("Format Into String formats a number, an integer and a string row", async () => {
  const vi = build((b) => {
    b.node("fmt", "str-const", { value: "x=%d, y=%.2f, %s!" });
    b.node("x", "num-const", { type: "i32", value: 3 });
    b.node("y", "const", { value: 2.256 });
    b.node("name", "str-const", { value: "año" });
    b.node("f", "format-into-string", { inputs: 3 });
    b.node("out", "str-indicator");
    b.node("err", "cluster-indicator", { type: { cluster: [{ name: "status", type: "boolean" }, { name: "code", type: "i32" }, { name: "source", type: "string" }] }, style: "error-out" });
    b.wire("fmt.result", "f.format-string");
    b.wire("x.result", "f.input-0");
    b.wire("y.result", "f.input-1");
    b.wire("name.result", "f.input-2");
    b.wire("f.resulting-string", "out.value");
    b.wire("f.error-out", "err.value");
  });
  const r = await run(vi);
  assert.equal(r.out, "x=3, y=2.26, año!");
  assert.deepEqual(r.err, { status: false, code: 0, source: "" });
});

test("Format Into String gives error 84 with too many specifiers, and an empty result", async () => {
  const vi = build((b) => {
    b.node("fmt", "str-const", { value: "%d %d" });
    b.node("x", "const", { value: 1 });
    b.node("f", "format-into-string");
    b.node("out", "str-indicator");
    b.node("err", "cluster-indicator", { type: { cluster: [{ name: "status", type: "boolean" }, { name: "code", type: "i32" }, { name: "source", type: "string" }] }, style: "error-out" });
    b.wire("fmt.result", "f.format-string");
    b.wire("x.result", "f.input-0");
    b.wire("f.resulting-string", "out.value");
    b.wire("f.error-out", "err.value");
  });
  const r = await run(vi);
  assert.deepEqual([r.out, r.err.status, r.err.code, r.err.source], ["", true, 84, "Format Into String"]);
});

test("Scan From String reads into outputs of the defaults' types", async () => {
  const vi = build((b) => {
    b.node("input", "str-const", { value: "7 2.5 hola resto" });
    b.node("fmt", "str-const", { value: "%d %f %s" });
    b.node("d0", "num-const", { type: "i32", value: 0 });
    b.node("d1", "const", { value: 0 });
    b.node("d2", "str-const", { value: "" });
    b.node("s", "scan-from-string", { inputs: 3 });
    b.node("o0", "indicator", { type: "i32" });
    b.node("o1", "indicator");
    b.node("o2", "str-indicator");
    b.node("rest", "str-indicator");
    b.node("offset", "indicator", { type: "u32" });
    b.wire("input.result", "s.input-string");
    b.wire("fmt.result", "s.format-string");
    b.wire("d0.result", "s.default-0");
    b.wire("d1.result", "s.default-1");
    b.wire("d2.result", "s.default-2");
    for (const [from, to] of [["s.output-0", "o0.value"], ["s.output-1", "o1.value"], ["s.output-2", "o2.value"], ["s.remaining-string", "rest.value"], ["s.offset-past-scan", "offset.value"]]) b.wire(from, to);
  });
  assert.deepEqual(await run(vi), { o0: 7, o1: 2.5, o2: "hola", rest: " resto", offset: 10 });
});

test("an empty format follows the system decimal separator", async () => {
  const vi = build((b) => {
    b.node("x", "const", { value: 3 });
    b.node("f", "format-into-string");
    b.node("out", "str-indicator");
    b.wire("x.result", "f.input-0");
    b.wire("f.resulting-string", "out.value");
  });
  assert.deepEqual(await run(vi, { separador: "," }), { out: "3,000000" });
});

// labview-captures/format-scan/47b-scan-error-in-true-defaults.png: outputs give their defaults.
test("with an error in, Scan From String gives each output its default and passes the error", async () => {
  const errorType = { cluster: [{ name: "status", type: "boolean" }, { name: "code", type: "i32" }, { name: "source", type: "string" }] };
  const vi = build((b) => {
    b.node("input", "str-const", { value: "42" });
    b.node("fmt", "str-const", { value: "%d" });
    b.node("d0", "const", { value: 9 });
    b.node("e", "error-cluster-constant", { value: { status: true, code: 5, source: "src" } });
    b.node("s", "scan-from-string");
    b.node("o0", "indicator");
    b.node("rest", "str-indicator");
    b.node("err", "cluster-indicator", { type: errorType, style: "error-out" });
    for (const [from, to] of [["input.result", "s.input-string"], ["fmt.result", "s.format-string"], ["d0.result", "s.default-0"], ["e.result", "s.error-in"], ["s.output-0", "o0.value"], ["s.remaining-string", "rest.value"], ["s.error-out", "err.value"]]) b.wire(from, to);
  });
  assert.deepEqual(await run(vi), { o0: 9, rest: "", err: { status: true, code: 5, source: "src" } });
});
