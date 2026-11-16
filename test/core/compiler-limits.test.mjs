// The size limits of core/compiler/ (DT-089 §4, CLAUDE.md rule 9): no file over about 400 lines, no function over
// about 30. What was over them when the split ended (2026-11-16) is listed with its size then, as a ratchet: it may
// shrink, never grow, and nothing new joins it. A function or file that gets under its limit is taken off the list.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { RAIZ } from "../helpers.mjs";

const COMPILER = path.join(RAIZ, "core/compiler");
const FILE_LIMIT = 400;
const FUNCTION_LIMIT = 30;

/** Files over the limit at the end of the split, with their lines then. node-table.mjs is a table, but its inline emitters are code. */
const LONG_FILES = { "node-table.mjs": 597, "pool-scheduler.mjs": 638, "stackless.mjs": 494 };

/** Functions over the limit at the end of the split, by `file::name`, with their lines then. */
const LONG_FUNCTIONS = {
  "case-structure.mjs::emitirCase": 157,
  "compile-ovi.mjs::compileOVI": 187,
  "compiler.mjs::assemble": 77,
  "expression-parser.mjs::analizar": 102,
  "expression-parser.mjs::atomo": 36,
  "linear-memory.mjs::funcionesMemoria": 225,
  "loop-structures.mjs::emitirEstructura": 143,
  "memory-ops.mjs::copyValueTo": 32,
  "node-emission.mjs::contexto": 56,
  "node-emission.mjs::emitirNodo": 48,
  "nodes/arrays.mjs::buildArray2d": 35,
  "nodes/arrays.mjs::indexArray2d": 40,
  "nodes/call-library.mjs::callLibrary": 76,
  "nodes/property-node.mjs::propertyNode": 45,
  "pool-scheduler.mjs::schedulerData": 52,
  "pool-scheduler.mjs::schedulerFunctions": 445,
  "stackless.mjs::emitSequence": 42,
  "stackless.mjs::emitStructure": 39,
  "stackless.mjs::liveAfterParkCalls": 33,
  "stackless.mjs::rewriteFunction": 323,
  "wasm-encoder.mjs::codificar": 50,
};

/**
 * A part of compileOVI (`createLoopStructures(ovi)`…) only holds that part's functions, which are measured one by one;
 * the factory itself is not.
 */
const isPartFactory = (name, line) => /^create[A-Z]\w*$/.test(name) && /\(ovi\)/.test(line);

const DECLARATION = /^(\s*)(?:export )?(?:async )?function (\w+)|^(\s*)(?:export )?const (\w+) = \((?:[^()]|\([^)]*\))*\) => \{\s*$|^(\s*)(?:export )?const (\w+) = \w+ => \{\s*$/;

/** Every compiler source, as a path relative to core/compiler/. */
const sources = () => readdirSync(COMPILER, { recursive: true }).map(String).filter((file) => file.endsWith(".mjs")).map((file) => file.replaceAll("\\", "/"));

/** Each function of a source with its length: from its declaration to the closing brace at its indentation. */
function functionLengths(lines) {
  const lengths = [];
  lines.forEach((line, start) => {
    const match = DECLARATION.exec(line);
    if (!match) return;
    const indentation = match[1] ?? match[3] ?? match[5];
    const name = match[2] ?? match[4] ?? match[6];
    const end = lines.findIndex((other, index) => index > start && other.startsWith(`${indentation}}`));
    if (end > start && !isPartFactory(name, line)) lengths.push({ name, lines: end - start + 1 });
  });
  return lengths;
}

test("no compiler file grows past about 400 lines, and the long ones listed do not grow", () => {
  for (const file of sources()) {
    const text = readFileSync(path.join(COMPILER, file), "utf8");
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const allowed = LONG_FILES[file] ?? FILE_LIMIT;
    assert.ok(lines <= allowed, `${file} has ${lines} lines, over its limit of ${allowed}`);
  }
});

test("no compiler function grows past about 30 lines, and the long ones listed do not grow", () => {
  for (const file of sources()) {
    for (const { name, lines } of functionLengths(readFileSync(path.join(COMPILER, file), "utf8").split("\n"))) {
      const allowed = LONG_FUNCTIONS[`${file}::${name}`] ?? FUNCTION_LIMIT;
      assert.ok(lines <= allowed, `${file}: ${name} has ${lines} lines, over its limit of ${allowed}`);
    }
  }
});

test("the lists name only what is still there and still over the limit", () => {
  for (const [file, lines] of Object.entries(LONG_FILES)) assert.ok(lines > FILE_LIMIT && sources().includes(file), file);
  const measured = new Map(sources().flatMap((file) => functionLengths(readFileSync(path.join(COMPILER, file), "utf8").split("\n")).map(({ name, lines }) => [`${file}::${name}`, lines])));
  for (const key of Object.keys(LONG_FUNCTIONS)) {
    assert.ok(measured.has(key), `${key} is listed but no longer exists`);
    assert.ok(measured.get(key) > FUNCTION_LIMIT, `${key} is under the limit now: take it off the list`);
  }
});
