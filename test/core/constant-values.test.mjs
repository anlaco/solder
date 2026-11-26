// A value of the wrong kind in an `.ovi` is refused when the file is read, naming the object (issue #22). A file
// written by hand or by a tool held its String Constants' values as the block catalog spells a default,
// `{ "type": "string", "value": "X" }`, instead of `"X"`; the reader took it, the compiler failed with a JavaScript
// error ("Offset is outside the bounds of the DataView") and the editor's window closed without a word.

import test from "node:test";
import assert from "node:assert/strict";
import { ErrorQvi, leer } from "../../core/model/qvi-format.mjs";
import { CAT } from "../helpers.mjs";

/** An OVI of one While Loop that selects between two String Constants by a button, as the issue's file. */
const selectBetweenStrings = (trueValue, falseValue, stopValue = false) => ({
  solder: 1,
  "front-panel": [{ name: "button", role: "control", type: "boolean", default: false }],
  "block-diagram": {
    structures: [
      {
        name: "while_1",
        kind: "while-loop",
        body: {
          nodes: [
            { name: "stop", type: "bool-const", config: { default: stopValue } },
            { name: "button", type: "bool-control" },
            { name: "when-true", type: "str-const", config: { default: trueValue } },
            { name: "when-false", type: "str-const", config: { default: falseValue } },
            { name: "choose", type: "select" },
          ],
          wires: [
            { from: "stop.result", to: "while_1.condition" },
            { from: "button.result", to: "choose.s" },
            { from: "when-true.result", to: "choose.t" },
            { from: "when-false.result", to: "choose.f" },
          ],
        },
      },
    ],
  },
});

test("a String Constant whose value is not text is refused, naming it", () => {
  const file = selectBetweenStrings({ type: "string", value: "X" }, "");
  assert.throws(() => leer(file, CAT), (error) => error instanceof ErrorQvi && /"when-true"/.test(error.message) && /text/.test(error.message));
});

test("a Boolean Constant whose value is not true or false is refused, naming it", () => {
  const file = selectBetweenStrings("X", "", { type: "boolean", value: false });
  assert.throws(() => leer(file, CAT), (error) => error instanceof ErrorQvi && /"stop"/.test(error.message));
});

test("a Numeric Constant whose value is an object is refused, naming it", () => {
  const file = selectBetweenStrings("X", "");
  file["block-diagram"].structures[0].body.nodes.push({ name: "count", type: "const", config: { default: { type: "number", value: 42 } } });
  assert.throws(() => leer(file, CAT), (error) => error instanceof ErrorQvi && /"count"/.test(error.message));
});

test("a control on the panel whose default is not of its type is refused, naming it", () => {
  const file = selectBetweenStrings("X", "");
  file["front-panel"][0].default = { type: "boolean", value: false };
  assert.throws(() => leer(file, CAT), (error) => error instanceof ErrorQvi && /"button"/.test(error.message));
});

test("the same OVI with its values written as Solder writes them is read", () => {
  assert.doesNotThrow(() => leer(selectBetweenStrings("X", ""), CAT));
});
