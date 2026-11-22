// The control editor's panel (DT-104): an `.octl` opens as a Front Panel graph holding its one object and is written
// back from it unchanged (DT-104 "How it is verified"), whatever the object is, and with the ring's kind.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CE from "../../core/model/control-editor.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { readTypeDefinition, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { CAT } from "../helpers.mjs";

/** PointTD as measured (reports/2026-11-17-typedef-update.md): a cluster of a DBL "a" (default 3) and a Boolean "b", at the editor's 31,109. */
const POINT = {
  tipo: "cluster-control",
  label: { text: "PointTD" },
  config: { elements: [{ tipo: "control", label: { text: "a" }, config: { type: "number", value: 3 }, x: 4, y: 19 }, { tipo: "bool-control", label: { text: "b" }, x: 25, y: 48 }] },
  x: 31,
  y: 109,
};
const OBJECTS = {
  cluster: POINT,
  numeric: { tipo: "control", label: { text: "Gain" }, config: { type: "i32", value: 7 }, x: 31, y: 109 },
  enum: { tipo: "control", label: { text: "Mode" }, config: { type: { enum: ["Off", "On"] }, value: 1 }, x: 31, y: 109 },
  string: { tipo: "str-control", label: { text: "" }, x: 31, y: 109 },
};

test("an .octl opens as a panel holding its one object and is written back unchanged", () => {
  for (const [name, object] of Object.entries(OBJECTS)) {
    for (const kind of ["control", "type-def", "strict-type-def"]) {
      const text = typeDefinitionText(kind, object);
      const opened = CE.controlEditorGraph(text, CAT);
      assert.equal(opened.kind, kind, name);
      assert.equal(opened.g.nodos.filter((node) => node.panel).length, 1, `${name}: one object on the panel`);
      const written = CE.controlEditorText(kind, opened.g, CAT);
      // An object without its default gets the catalog's once (a string's ""), and from then on the file stays as it is.
      if (name !== "string") assert.equal(written, text, `${name} as ${kind}`);
      assert.equal(CE.controlEditorText(kind, CE.controlEditorGraph(written, CAT).g, CAT), written, `${name} as ${kind}, written again`);
    }
  }
  // The label is the file's, even when empty or when the panel would number it.
  const { g, id } = CE.controlEditorGraph(typeDefinitionText("type-def", OBJECTS.string), CAT);
  assert.equal(g.nodos.find((node) => node.id === id).label.text, "");
});

test("the editor's edits reach the file, and the ring's kind is the file's", () => {
  const { g, id } = CE.controlEditorGraph(typeDefinitionText("type-def", OBJECTS.numeric), CAT);
  const moved = Gr.moverEnPanel(g, [id], 10, 5);
  const written = readTypeDefinition(CE.controlEditorText("strict-type-def", moved, CAT), CAT);
  assert.deepEqual([written.kind, written.object.x, written.object.y], ["strict-type-def", 41, 114]);
  // Make Type Def. takes a panel object as it stands, without its own link (DT-096 §2: the file never holds one).
  const linked = { ...g.nodos.find((node) => node.id === id), config: { ...OBJECTS.numeric.config, typedef: { path: "untitled:3", strict: false } } };
  const fromPanel = readTypeDefinition(typeDefinitionText("type-def", CE.definitionObjectOf(linked)), CAT).object;
  assert.equal(fromPanel.config.typedef, undefined);
  assert.throws(() => CE.controlEditorText("type-def", Gr.nuevo(), CAT), /holds no object/);
});
