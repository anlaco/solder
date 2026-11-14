// The DAQ add-on's palette (DT-086, DT-087): Measurement I/O ▸ DAQ - Data Acquisition, LabVIEW's DAQmx - Data Acquisition
// palette with DAQ for DAQmx, read from the add-on's own palette files. Its 6 × 4 grid and the place of every cell were
// measured (labview-captures/reports/2026-11-06-daqmx-palette.md); what Solder has places it, the rest is greyed with its
// reason, and LabVIEW's empty cells stay empty.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { mergeAddonPalettes } from "../../core/model/palette.mjs";
import { cargarInventario, esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { celdasSubpaleta } from "../../editor/src/window/window-view.mjs";
import { INV, RAIZ } from "../helpers.mjs";

const MENUS = path.join(RAIZ, "addons/daq/1/menus");
const DAQ_PALETTE = "palette.functions.measurement-io.daq-data-acquisition";
const ADVANCED_TASK_OPTIONS = `${DAQ_PALETTE}.daq-advanced-task-options`;

/** The add-on's palette files, as the editor's main process reads them from its `menus/` folder. */
function addonMenuFiles(folder, relative = "") {
  return Object.assign({}, ...readdirSync(path.join(folder, relative), { withFileTypes: true }).map((entry) => {
    const inside = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? addonMenuFiles(folder, inside) : { [inside]: readFileSync(path.join(folder, inside), "utf8") };
  }));
}

function withDaqAddon() {
  const { inventory, problems } = mergeAddonPalettes(INV.datos, addonMenuFiles(MENUS));
  assert.deepEqual(problems, []);
  return cargarInventario(inventory);
}

/** Each cell's [row, column] and whether it is built, by its name. */
const cellsOf = (inventory, id) =>
  Object.fromEntries(celdasSubpaleta(inventory, id).sitios.map(({ e, fila, columna }) => [e.etiqueta, [fila, columna, esHueco(e) ? "greyed" : "built"]]));

test("DAQ - Data Acquisition has LabVIEW's 6 × 4 grid: its cells in place, its empty cells empty, what is not built greyed", () => {
  const inventory = withDaqAddon();
  assert.equal(celdasSubpaleta(inventory, DAQ_PALETTE).columnas, 6);
  assert.deepEqual(cellsOf(inventory, DAQ_PALETTE), {
    "DAQ Task Name": [0, 0, "built"],
    "DAQ Global Channel": [0, 1, "built"],
    "DAQ Create Virtual Channel": [0, 2, "built"],
    "DAQ Read": [0, 3, "built"],
    "DAQ Write": [0, 4, "greyed"],
    "DAQ Wait Until Done": [0, 5, "built"],
    "DAQ Timing": [1, 1, "built"],
    "DAQ Trigger": [1, 2, "greyed"],
    "DAQ Start Task": [1, 3, "built"],
    "DAQ Stop Task": [1, 4, "built"],
    "DAQ Clear Task": [1, 5, "built"],
    "DAQ Channel Property Node": [2, 0, "greyed"],
    "DAQ Timing Property Node": [2, 1, "greyed"],
    "DAQ Trigger Property Node": [2, 2, "greyed"],
    "DAQ Read Property Node": [2, 3, "greyed"],
    "DAQ Write Property Node": [2, 4, "greyed"],
    "DAQ Assistant": [3, 0, "greyed"],
    "DAQ Real-Time": [3, 1, "greyed"],
    "DAQ Device Configuration": [3, 3, "greyed"],
    "DAQ Advanced Task Options": [3, 4, "built"],
    "DAQ Advanced": [3, 5, "greyed"],
  });
});

test("a greyed cell says what it needs, and Create Task is in Advanced Task Options, 4 columns, as LabVIEW's", () => {
  const inventory = withDaqAddon();
  const write = inventory.hijos(DAQ_PALETTE).find((entry) => entry.etiqueta === "DAQ Write");
  assert.match(inventory.explicacion(write).solder, /^Missing: the DAQ writes/);
  assert.ok(inventory.explicacion(write).labview);
  assert.equal(celdasSubpaleta(inventory, ADVANCED_TASK_OPTIONS).columnas, 4);
  const cells = cellsOf(inventory, ADVANCED_TASK_OPTIONS);
  assert.deepEqual(cells["DAQ Create Task"], [0, 0, "built"]);
  assert.deepEqual(cells["DAQ Signals"], [2, 3, "greyed"], "after an empty cell, as measured");
});

test("each built cell places the plugin's OVI, polymorphic with its selector shown, or the DAQ name constant of its kind", () => {
  const inventory = withDaqAddon();
  const byName = Object.fromEntries(inventory.hijos(DAQ_PALETTE).map((entry) => [entry.etiqueta, entry]));
  assert.deepEqual([byName["DAQ Read"].bloque, byName["DAQ Read"].config.vi, byName["DAQ Read"].config.selector], ["subvi", "<ovilib>/DAQ/DAQ Read.sdp", true]);
  assert.deepEqual(byName["DAQ Task Name"].config, { type: { "daq-name": "task" }, value: "" });
  assert.equal(byName["DAQ Global Channel"].config.type["daq-name"], "global-channel");
  for (const entry of inventory.hijos(DAQ_PALETTE).filter((candidate) => candidate.bloque === "subvi")) {
    const file = entry.config.vi.replace("<ovilib>", path.join(RAIZ, "addons/daq/1/ovi.lib"));
    assert.doesNotThrow(() => readFileSync(file), `${ultimo(entry.id)}: ${entry.config.vi} is in the add-on`);
  }
});
