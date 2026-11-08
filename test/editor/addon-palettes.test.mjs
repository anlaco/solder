// An add-on's palette in the editor (DT-086, step 1): the hole Measurement I/O names its file, and when an add-on brings
// it the palette opens and its element is placeable, drawn by the code that draws every palette.

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeAddonPalettes } from "../../core/model/palette.mjs";
import { cargarInventario, esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { paleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { INV } from "../helpers.mjs";

const AQUI = { x: 10, y: 20 };
const MEASUREMENT = "palette.functions.measurement-io";
const DAQ_FOLDER = `${MEASUREMENT}.daq-data-acquisition`;
const START_TASK = `${DAQ_FOLDER}.daq-start-task`;
// As LabVIEW's Measurement I/O holds a sub-palette ("DAQmx - Data Acquisition") and the functions are inside it.
const MEASUREMENT_FILE = JSON.stringify({ palette: 1, title: "Measurement I/O", entries: [{ kind: "palette", name: "DAQ - Data Acquisition", path: "_daq/daq.json" }] });
const DAQ_FILE = JSON.stringify({ palette: 1, title: "DAQ", entries: [{ kind: "item", name: "DAQ Start Task", path: "<ovilib>/DAQ/Start Task.sdg" }] });
const withPalette = () => ({ ...inicial(), paleta: paletaNueva("palette.functions", 40, 30) });

const withAddon = () => {
  const { inventory, problems } = mergeAddonPalettes(INV.datos, { "categories/measurement/daq.json": MEASUREMENT_FILE, "categories/measurement/_daq/daq.json": DAQ_FILE });
  assert.deepEqual(problems, []);
  return cargarInventario(inventory);
};

test("without an add-on, Measurement I/O stays a grey hole that explains what it needs", () => {
  assert.ok(esHueco(INV.entrada(MEASUREMENT)));
  assert.equal(INV.hijos(MEASUREMENT).length, 0);
  assert.match(INV.explicacion(INV.entrada(MEASUREMENT)).solder, /^Missing: /);
});

test("with an add-on's palette, Measurement I/O is done, its sub-palette opens, and its element is placeable", () => {
  const inventory = withAddon();
  assert.equal(esHueco(inventory.entrada(MEASUREMENT)), false);
  assert.deepEqual(inventory.hijos(MEASUREMENT).map((entry) => entry.id), [DAQ_FOLDER]);
  assert.deepEqual(inventory.hijos(DAQ_FOLDER).map((entry) => entry.id), [START_TASK]);

  // A top-level category unfolds inside the palette itself and shows its folders.
  let state = clic(withPalette(), inventory, MEASUREMENT, AQUI);
  assert.ok(state.paleta.desplegadas.includes(MEASUREMENT), "the category unfolds");
  assert.ok(paleta(inventory, state.paleta).includes(`class="carpeta" data-id="${DAQ_FOLDER}"`), "its sub-palette is a folder that is not greyed");

  state = clic(state, inventory, DAQ_FOLDER, AQUI, 0);
  assert.deepEqual(state.paleta.cascada.map((open) => open.id), [DAQ_FOLDER], "the folder opens its subpalette");
  assert.ok(subpaletas(inventory, state.paleta).includes(`class="icono-funcion" data-id="${START_TASK}"`), "the element is placeable, not greyed");

  // The editor looks icons up by name and an add-on cannot add to that table: without a fallback the element would be an
  // invisible hole that can be clicked (found by trying it in the running editor, 2026-11-08).
  const sub = subpaletas(inventory, state.paleta);
  const elementHtml = sub.slice(sub.indexOf(`data-id="${START_TASK}"`));
  assert.ok(elementHtml.slice(0, elementHtml.indexOf("</div>")).includes("<svg"), "the element is drawn with an icon: the standard OVI icon");

  const entry = inventory.entrada(START_TASK);
  assert.equal(entry.bloque, "subvi", "it places a subOVI");
  assert.equal(entry.config.vi, "<ovilib>/DAQ/Start Task.sdg", "the OVI is named by its symbolic path, so the .sdg opens on any machine");
});

test("the rest of the inventory is unchanged by an add-on's palette", () => {
  const before = INV.entradas.filter((entry) => entry.id !== MEASUREMENT);
  const after = withAddon().entradas.filter((entry) => entry.id !== MEASUREMENT && !entry.id.startsWith(`${MEASUREMENT}.`));
  assert.deepEqual(after, before);
});
