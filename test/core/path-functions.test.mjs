// The path type and its functions in a compiled VI (DT-067), on one thread and on a pool, with the rules
// LabVIEW showed on Windows (labview-captures/reports/2026-10-26-path-type.md) whatever system runs the test.

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { EMPTY_PATH, NOT_A_PATH, PATH_KIND, pathFromText } from "../../core/model/paths.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const THREADS = 2;
const pool = createNodePool(THREADS);
after(() => pool.close());

const windowsPath = (text) => pathFromText(text, "windows");

async function run(vi, values = {}, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const valuesById = Object.fromEntries(Object.entries(values).map(([name, value]) => [vi.id[name], value]));
  const written = await ejecutar(compiled, valuesById, { pathRules: "windows", ...options });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

/** A path control into Build Path with the name "b\\c", then Strip Path, Path To String, Path Type and Path to Array of Strings. */
const pathPipeline = () =>
  buildVI(CAT, (b) => {
    b.node("base", "path-control");
    b.node("name", "str-const", { value: "b\\c" });
    b.node("build", "build-path");
    b.node("strip", "strip-path");
    b.node("toText", "path-to-string");
    b.node("kind", "path-type");
    b.node("toArray", "path-to-array-of-strings");
    b.node("built", "path-indicator");
    b.node("stripped", "path-indicator");
    b.node("strippedName", "str-indicator");
    b.node("text", "str-indicator");
    b.node("type", "indicator", { type: "u16" });
    b.node("components", "arr-indicator", { type: { array: "string" } });
    b.node("relative", "bool-indicator");
    b.wire("base.result", "build.base-path");
    b.wire("name.result", "build.name");
    b.wire("build.appended-path", "built.value");
    b.wire("build.appended-path", "strip.path");
    b.wire("strip.stripped-path", "stripped.value");
    b.wire("strip.name", "strippedName.value");
    b.wire("build.appended-path", "toText.path");
    b.wire("toText.string", "text.value");
    b.wire("build.appended-path", "kind.path");
    b.wire("kind.type", "type.value");
    b.wire("build.appended-path", "toArray.path");
    b.wire("toArray.components", "components.value");
    b.wire("toArray.relative", "relative.value");
  });

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`Build Path, Strip Path, Path To String, Path Type and Path to Array of Strings give LabVIEW's values ${where}`, async () => {
    const shown = await run(pathPipeline(), { base: windowsPath("C:\\a") }, options());
    assert.deepEqual(shown.built, windowsPath("C:\\a\\b\\c"));
    assert.deepEqual(shown.stripped, windowsPath("C:\\a\\b"));
    assert.equal(shown.strippedName, "c");
    assert.equal(shown.text, "C:\\a\\b\\c");
    assert.equal(shown.type, PATH_KIND.ABSOLUTE);
    assert.deepEqual(shown.components, ["C", "a", "b", "c"]);
    assert.equal(shown.relative, false);
  });
}

test("a path control left at its default is the empty path, which Build Path takes as a root", async () => {
  const shown = await run(pathPipeline());
  assert.equal(shown.text, "b:\\c");
});

test("a Not A Path base gives Not A Path, shown as <Not A Path>, of type 2", async () => {
  const shown = await run(pathPipeline(), { base: NOT_A_PATH });
  assert.deepEqual(shown.built, NOT_A_PATH);
  assert.equal(shown.text, "<Not A Path>");
  assert.equal(shown.type, PATH_KIND.NOT_A_PATH);
  assert.deepEqual(shown.components, []);
});

test("String To Path, the path constants and Array of Strings to Path reach their indicators", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("text", "str-const", { value: "C:/a/b" });
    b.node("toPath", "string-to-path");
    b.node("parsed", "path-indicator");
    b.node("constant", "path-constant", { value: windowsPath("..\\x") });
    b.node("constantShown", "path-indicator");
    b.node("empty", "empty-path-constant");
    b.node("emptyShown", "path-indicator");
    b.node("notAPath", "not-a-path-constant");
    b.node("notAPathShown", "path-indicator");
    b.node("parts", "arr-const", { type: { array: "string" }, value: ["a", "b"] });
    b.node("relative", "bool-const", { value: true });
    b.node("fromArray", "array-of-strings-to-path");
    b.node("joined", "path-indicator");
    b.wire("text.result", "toPath.string");
    b.wire("toPath.path", "parsed.value");
    b.wire("constant.result", "constantShown.value");
    b.wire("empty.result", "emptyShown.value");
    b.wire("notAPath.result", "notAPathShown.value");
    b.wire("parts.result", "fromArray.components");
    b.wire("relative.result", "fromArray.relative");
    b.wire("fromArray.path", "joined.value");
  });
  const shown = await run(vi);
  // "/" is an ordinary character on Windows (measured: "C:/a/b" → `C:\/a/b`).
  assert.deepEqual(shown.parsed, { kind: PATH_KIND.ABSOLUTE, components: ["C", "/a/b"] });
  assert.deepEqual(shown.constantShown, windowsPath("..\\x"));
  assert.deepEqual(shown.emptyShown, EMPTY_PATH);
  assert.deepEqual(shown.notAPathShown, NOT_A_PATH);
  assert.deepEqual(shown.joined, { kind: PATH_KIND.RELATIVE, components: ["a", "b"] });
});

test("Build Path takes a path as its name, and a path never wires to a string (measured: the wire breaks)", async () => {
  const vi = buildVI(CAT, (b) => {
    b.node("base", "path-constant", { value: windowsPath("C:\\a") });
    b.node("name", "path-constant", { value: windowsPath("b") });
    b.node("build", "build-path");
    b.node("built", "path-indicator");
    b.wire("base.result", "build.base-path");
    b.wire("name.result", "build.name");
    b.wire("build.appended-path", "built.value");
  });
  assert.deepEqual((await run(vi)).built, windowsPath("C:\\a\\b"));

  const mixed = buildVI(CAT, (b) => {
    b.node("path", "path-constant");
    b.node("shown", "str-indicator");
  });
  const wired = Gr.conectarCruzando(mixed.g, CAT, { nodo: mixed.id.path, puerto: "result", dir: "out" }, { nodo: mixed.id.shown, puerto: "value", dir: "in" });
  const broken = wired.motivo || [...Gr.tipos(wired.g, CAT).cables.values()].some((cable) => cable.roto);
  assert.ok(broken, "a path wired to a string indicator must break");
});

test("a path is saved in the .sdg as its kind and components, never as text, and opens the same", async () => {
  const { aTexto, leer } = await import("../../core/model/qvi-format.mjs");
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const { leer: readJson } = await import("../helpers.mjs");
  const vi = buildVI(CAT, (b) => {
    b.node("constant", "path-constant", { value: windowsPath("C:\\data\\run 1.txt") });
    b.node("shown", "path-indicator");
    b.wire("constant.result", "shown.value");
  });
  const text = aTexto(vi.g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(readJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  assert.ok(text.includes('"components"') && !text.includes("C:\\\\data"), "the components are stored, not the Windows text");
  assert.equal(aTexto(leer(text, CAT), CAT), text, "saving what was opened gives the same text");
  assert.deepEqual((await run({ g: leer(text, CAT), id: vi.id })).shown, windowsPath("C:\\data\\run 1.txt"));
});

test("Equal?, Not Equal?, Empty String/Path? and Not A Number/Path/Refnum? on paths give LabVIEW's answers", async () => {
  const cases = [
    // first, second, equal (measured on Windows)
    ["C:\\a", "c:\\A", true],
    ["C:\\a", "C:\\a\\", true],
    ["<Not A Path>", "", false],
    ["C:/a", "C:\\a", false],
  ];
  for (const [first, second, equal] of cases) {
    const vi = buildVI(CAT, (b) => {
      b.node("first", "path-control");
      b.node("second", "path-control");
      b.node("equal", "equal");
      b.node("notEqual", "not-equal");
      b.node("isEqual", "bool-indicator");
      b.node("isNotEqual", "bool-indicator");
      b.wire("first.result", "equal.x");
      b.wire("second.result", "equal.y");
      b.wire("first.result", "notEqual.x");
      b.wire("second.result", "notEqual.y");
      b.wire("equal.result", "isEqual.value");
      b.wire("notEqual.result", "isNotEqual.value");
    });
    const shown = await run(vi, { first: windowsPath(first), second: windowsPath(second) });
    assert.deepEqual([shown.isEqual, shown.isNotEqual], [equal, !equal], `${first} = ${second}`);
  }
  for (const [text, empty, notAPath] of [["", true, false], ["<Not A Path>", false, true], [".", true, false], ["C:\\a", false, false]]) {
    const vi = buildVI(CAT, (b) => {
      b.node("path", "path-control");
      b.node("empty", "empty-string-path");
      b.node("nap", "not-a-number-path-refnum");
      b.node("isEmpty", "bool-indicator");
      b.node("isNotAPath", "bool-indicator");
      b.wire("path.result", "empty.string-path");
      b.wire("path.result", "nap.number");
      b.wire("empty.result", "isEmpty.value");
      b.wire("nap.result", "isNotAPath.value");
    });
    const shown = await run(vi, { path: windowsPath(text) });
    assert.deepEqual([shown.isEmpty, shown.isNotAPath], [empty, notAPath], JSON.stringify(text));
  }
});
