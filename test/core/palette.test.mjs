// Palettes from files (DT-086, step 1): a palette file is JSON with the structure of LabVIEW's .mnu, the parent
// names where its child goes, and an add-on provides only the child. Pure: the files are given as text.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Palette from "../../core/model/palette.mjs";

const daqPalette = (entries) => JSON.stringify({ palette: 1, title: "DAQ", entries });
const startTask = { kind: "item", name: "DAQ Start Task", path: "<ovilib>/DAQ/Start Task.sdg" };

/** A tiny inventory: Measurement I/O is a grey hole that names the file its content comes from. */
const inventory = () => ({
  version: 1,
  entradas: [
    { id: "palette.functions.programming", etiqueta: "Programming", estado: "built", prueba: "x" },
    { id: "palette.functions.measurement-io", etiqueta: "Measurement I/O", estado: "todo", labview: "Data acquisition.", necesita: "drivers-de-adquisicion", menu: "Categories/Measurement/daq.json" },
    { id: "palette.functions.mathematics", etiqueta: "Mathematics", estado: "todo", labview: "Maths.", necesita: "matematicas" },
  ],
});
const ids = (data) => data.entradas.map((entry) => entry.id);

test("a palette file needs its version, a title and entries of a known kind", () => {
  assert.equal(Palette.parsePalette(daqPalette([startTask])).palette.title, "DAQ");
  assert.match(Palette.parsePalette("{oops").problem, /not valid JSON/);
  assert.match(Palette.parsePalette(JSON.stringify({ palette: 2, title: "x", entries: [] })).problem, /version/);
  assert.match(Palette.parsePalette(JSON.stringify({ palette: 1, entries: [] })).problem, /title/);
  assert.match(Palette.parsePalette(daqPalette([{ kind: "magic", name: "x" }])).problem, /entry 1.*kind/);
  assert.match(Palette.parsePalette(daqPalette([{ kind: "item", name: " ", path: "a" }])).problem, /entry 1.*name/);
  assert.match(Palette.parsePalette(daqPalette([startTask, { kind: "item", name: "No path" }])).problem, /entry 2.*path/);
  assert.match(Palette.parsePalette(daqPalette([{ kind: "palette", name: "Up", path: "../x.json" }])).problem, /entry 1.*path/, "a palette cannot climb out of its folder");
});

test("an add-on's file fills the hole its parent names, turning the hole into a palette that is done", () => {
  const { inventory: merged, problems } = Palette.mergeAddonPalettes(inventory(), { "categories/measurement/daq.json": daqPalette([startTask]) });
  assert.deepEqual(problems, []);
  assert.deepEqual(ids(merged), ["palette.functions.programming", "palette.functions.measurement-io", "palette.functions.measurement-io.daq-start-task", "palette.functions.mathematics"]);
  const folder = merged.entradas[1];
  assert.equal(folder.estado, "built");
  assert.equal(folder.labview, undefined, "no longer a hole, so no explanation of a hole");
  assert.equal(folder.necesita, undefined);
  const item = merged.entradas[2];
  assert.deepEqual([item.etiqueta, item.estado, item.bloque, item.config], ["DAQ Start Task", "built", "subvi", { vi: "<ovilib>/DAQ/Start Task.sdg" }]);
  assert.match(item.prueba, /Categories\/Measurement\/daq\.json/, "says which file it comes from");
});

test("without the file the hole stays as it is, silently, as LabVIEW skips a missing child", () => {
  const { inventory: merged, problems } = Palette.mergeAddonPalettes(inventory(), {});
  assert.deepEqual(problems, []);
  assert.deepEqual(merged, inventory());
});

test("the file is found without regard to case, as DFDT's lowercase 'categories' needs", () => {
  const { inventory: merged } = Palette.mergeAddonPalettes(inventory(), { [Palette.paletteFileKey("CATEGORIES\\Measurement\\DAQ.json")]: daqPalette([startTask]) });
  assert.equal(merged.entradas[1].estado, "built");
});

test("sub-palettes are read from their own files, relative to the palette that names them; spacers are not entries", () => {
  const { inventory: merged, problems } = Palette.mergeAddonPalettes(inventory(), {
    "categories/measurement/daq.json": daqPalette([startTask, { kind: "spacer" }, { kind: "palette", name: "Advanced", path: "_daq/advanced.json" }, { kind: "palette", name: "Missing", path: "_daq/missing.json" }]),
    "categories/measurement/_daq/advanced.json": daqPalette([{ kind: "item", name: "DAQ Read", path: "<ovilib>/DAQ/Read.sdg" }]),
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(ids(merged).slice(1, 6), [
    "palette.functions.measurement-io",
    "palette.functions.measurement-io.daq-start-task",
    "palette.functions.measurement-io.advanced",
    "palette.functions.measurement-io.advanced.daq-read",
    "palette.functions.measurement-io.missing",
  ]);
  assert.equal(merged.entradas[5].estado, "built", "a sub-palette whose file is missing is still listed, empty: the parent names it");
});

test("a broken file is reported and the hole stays, and nothing else is touched", () => {
  const { inventory: merged, problems } = Palette.mergeAddonPalettes(inventory(), { "categories/measurement/daq.json": "{oops" });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /not valid JSON/);
  assert.deepEqual(merged, inventory());
});

test("two entries with the same name get different ids, and a palette that names itself does not loop", () => {
  const twice = daqPalette([startTask, startTask]);
  const { inventory: merged } = Palette.mergeAddonPalettes(inventory(), { "categories/measurement/daq.json": twice });
  assert.deepEqual(ids(merged).slice(2, 4), ["palette.functions.measurement-io.daq-start-task", "palette.functions.measurement-io.daq-start-task-2"]);
  const loop = daqPalette([{ kind: "palette", name: "Again", path: "daq.json" }]);
  const result = Palette.mergeAddonPalettes(inventory(), { "categories/measurement/daq.json": loop });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].problem, /itself|loop|cycle/i);
});

test("the input is not changed", () => {
  const original = inventory();
  Palette.mergeAddonPalettes(original, { "categories/measurement/daq.json": daqPalette([startTask]) });
  assert.deepEqual(original, inventory());
});
