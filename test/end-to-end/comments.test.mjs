// DT-100 §6: any object of an .ovi, .octl, .sdp or .sdproj may hold a `comment`, which survives a round trip on its
// object and changes nothing compiled ("How it is verified" in DT-100).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { putComments, takeComments } from "../../core/model/file-comments.mjs";
import { borrar, crearNodo, meter } from "../../core/model/graph.mjs";
import { readPolymorphic, writePolymorphic } from "../../core/model/polymorphic.mjs";
import { readProject, withoutWindow, writeProject } from "../../core/model/project.mjs";
import { moveItem } from "../../core/model/project-tree.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { readTypeDefinition, typeDefinitionText } from "../../core/model/type-definition.mjs";
import { projectFileText } from "../../editor/electron/project-registry.mjs";
import { CAT, RAIZ, leer as readJson } from "../helpers.mjs";

const validator = (schema) => new Ajv2020({ allErrors: true, strict: false }).compile(readJson(schema));
const asText = (file) => `${JSON.stringify(file, null, 2)}\n`;
const exampleText = (relative) => readFileSync(path.join(RAIZ, "examples", relative), "utf8");

/** The file with a different comment on every object it holds, as the first key of each. */
function commentEverything(file) {
  let count = 0;
  return putComments(file, () => `comment ${++count}`);
}

/** How many comments a file holds. */
const commentCount = (file) => takeComments(file).comments.length;

const EXAMPLES = ["oven-controller/Oven Controller.ovi", "error-no-error/ErrorNoError.ovi", "instrument-protocol/Parse Reply.ovi"];

for (const example of EXAMPLES) {
  test(`${path.basename(example)} with a comment on every object saves back to the same text, valid against its schema`, () => {
    const canonical = JSON.parse(aTexto(leer(exampleText(example), CAT), CAT));
    const commented = commentEverything(canonical);
    assert.ok(commentCount(commented) > 50, "the example holds many objects");
    const validate = validator("docs/schema/qvi.schema.json");
    assert.ok(validate(commented), JSON.stringify(validate.errors?.slice(0, 3)));
    assert.equal(aTexto(leer(asText(commented), CAT), CAT), asText(commented));
  });

  test(`${path.basename(example)} compiles to the same module with and without comments`, () => {
    const plain = leer(exampleText(example), CAT);
    const commented = leer(asText(commentEverything(JSON.parse(aTexto(plain, CAT)))), CAT);
    const [withoutComments, withComments] = [compilar(plain, CAT), compilar(commented, CAT)];
    assert.equal(withoutComments.errores, undefined);
    assert.deepEqual(Buffer.from(withComments.bytes), Buffer.from(withoutComments.bytes));
  });
}

test("no reader passes a comment on: the graph holds none in a node's configuration or label", () => {
  const g = leer(asText(commentEverything(JSON.parse(aTexto(leer(exampleText(EXAMPLES[0]), CAT), CAT)))), CAT);
  const visible = JSON.stringify(g.nodos.map(({ comments: _own, ...node }) => node));
  assert.ok(!visible.includes('"comment"'), "only `comments` of a node holds them");
});

test("a node's comment goes with the node: deleted with it, and not given to a new node that takes its name", () => {
  const file = JSON.parse(aTexto(leer(exampleText(EXAMPLES[1]), CAT), CAT));
  const node = file["block-diagram"].nodes.find((candidate) => candidate.name === "bundle-by-name_1");
  const commented = { ...file, "block-diagram": { ...file["block-diagram"], nodes: file["block-diagram"].nodes.map((candidate) => (candidate === node ? { comment: "builds the error", ...candidate } : candidate)) } };
  let g = leer(asText(commented), CAT);
  assert.match(aTexto(g, CAT), /"comment": "builds the error",\n\s+"name": "bundle-by-name_1"/);
  const bundle = g.nodos.find((candidate) => candidate.name === "bundle-by-name_1");
  const moved = meter(g, CAT, [bundle.id], g.nodos.find((candidate) => candidate.name === "case-structure_1").id, 1);
  const frame = JSON.parse(aTexto(moved, CAT))["block-diagram"].structures[0].frames[1].body.nodes;
  assert.equal(frame.find((candidate) => candidate.name === "bundle-by-name_1").comment, "builds the error", "moved into a frame, it keeps its comment");
  g = borrar(g, [g.nodos.find((candidate) => candidate.name === "bundle-by-name_1").id]);
  g = crearNodo(g, CAT, "bundle-by-name", 10, 10).g;
  assert.ok(g.nodos.some((candidate) => candidate.name === "bundle-by-name_1"), "the new node takes the freed name");
  assert.doesNotMatch(aTexto(g, CAT), /builds the error/);
});

test("a comment inside a value is data: a cluster's field may be called comment", () => {
  const file = { comment: "the file's", "front-panel": [{ name: "c", default: { comment: "a field's value" } }] };
  const { file: stripped, comments } = takeComments(file);
  assert.deepEqual(stripped["front-panel"][0].default, { comment: "a field's value" });
  assert.equal(comments.length, 1);
});

test("an .octl's comments survive a round trip, valid against its schema", () => {
  const text = asText({ comment: "the point every OVI shares", solder: 9, "type-definition": "type-def", object: { comment: "x first", kind: "cluster-control", label: "Point", elements: [{ comment: "the abscissa", kind: "control", label: "x", type: "number", default: 0, x: 4, y: 19 }], x: 10, y: 10 } });
  const validate = validator("docs/schema/octl.schema.json");
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  const { kind, object, comments } = readTypeDefinition(text, CAT);
  assert.equal(object.config?.comment, undefined, "the object read holds no comment");
  assert.equal(typeDefinitionText(kind, object, comments), text);
});

test("a .sdp's comments survive a round trip, and an instance's follows it when the list is reordered", () => {
  const text = asText({ comment: "one OVI per type", "solder-polymorphic": 2, instances: [{ comment: "integers", ovi: "Add I32.ovi" }, { ovi: "Add DBL.ovi" }], "show-selector-by-default": false, "adapt-to-data-type": true, "draw-icon": "polymorphic" });
  const validate = validator("docs/schema/sdp.schema.json");
  assert.ok(validate(JSON.parse(text)), JSON.stringify(validate.errors));
  const polymorphic = readPolymorphic(text);
  assert.equal(writePolymorphic(polymorphic), text);
  const reordered = JSON.parse(writePolymorphic({ ...polymorphic, instances: [...polymorphic.instances].reverse() }));
  assert.deepEqual(reordered.instances.map((instance) => instance.comment), [undefined, "integers"]);
});

test("a .sdproj's comments survive a round trip and the editor's save, and an item's goes with it when it is moved", () => {
  const file = {
    comment: "the oven's project",
    "solder-project": 2,
    items: [{ name: "My Computer", kind: "my-computer", items: [{ name: "Sub", kind: "folder", items: [] }, { comment: "the main OVI", name: "main.ovi", kind: "ovi", path: "main.ovi" }, { name: "Dependencies", kind: "dependencies" }, { name: "Build Specifications", kind: "build" }] }],
    window: { comment: "a small window", x: 1, y: 2, width: 300, height: 400 },
  };
  const validate = validator("docs/schema/sdproj.schema.json");
  assert.ok(validate(file), JSON.stringify(validate.errors));
  const project = readProject(asText(file));
  assert.equal(writeProject(project), asText(file));
  const body = writeProject(withoutWindow(project));
  assert.equal(projectFileText(body, project.window), asText(file), "the editor's body and save keep them");
  const moved = moveItem(project, [0, 1], [0, 0]);
  assert.equal(moved.items[0].items[0].items[0].comment, "the main OVI");
});
