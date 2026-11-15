// The right-click menus of the DAQ name controls and indicators on the panel, and the list of their arrow button
// (DT-076 §5). Every measure comes from labview-captures/reports/2026-11-15-daqname-menus.md (Q1, Q2); the captures are
// local evidence and are not committed.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { DAQ_NAME_KINDS, daqName } from "../../core/model/daq-name.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { DAQ_NAME_DROPDOWN_MENU, DAQ_NAME_PANEL_MENUS } from "../../editor/src/common/daq-name-menus.mjs";
import { esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { CAT, INV } from "../helpers.mjs";
import { hover, menuRows, shown } from "./menu-rows.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

/** A panel with one DAQ name of `kind`, as a control or an indicator. */
function panelObject(block, kind) {
  const created = Gr.crearEnPanel(Gr.nuevo(), CAT, block, 60, 60, "DAQ Name", { type: daqName(kind) });
  return { g: created.g, id: created.g.nodos[0].id, node: created.g.nodos[0] };
}

const openPanelMenu = ({ g, id, node }) => ED.abrirMenu({ ...ED.inicial(), g }, P.menuDe(node), id, 0, 0);

// Q1: Task Name control (173 x 400), Physical Channel control (173 x 343), Task Name indicator (173 x 381).
const COMMON_TOP = ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array", "---", "Make Type Def.", "---", "Description and Tip...", "---", "Create", "Replace", "Data Operations", "Advanced",
  "Fit Control to Pane", "Scale Object with Pane", "---", "I/O Name Filtering..."];
const TASK_ROWS = [...COMMON_TOP, "New DAQ Task", "Edit DAQ Task", "Generate Code", "---", "Select Item...", "---", "Properties"];
const OTHER_ROWS = [...COMMON_TOP, "---", "Select Item...", "---", "Properties"];

test("a DAQ task name control and indicator have the panel menu of LabVIEW's Task Name", () => {
  const control = panelObject("daq-name-control", "task");
  const opened = openPanelMenu(control);
  assert.equal(opened.menu.raiz, DAQ_NAME_PANEL_MENUS.task);
  assert.deepEqual(shown(menuRows(opened)), TASK_ROWS);
  // Q1's submenus, in order, with Visible Items ticking the Label and the Menu Button (not the Caption).
  const checked = (parent) => menuRows(hover(opened, parent), parent).map((row) => [row.label, row.checked]);
  assert.deepEqual(checked("context.daq-task-name-control.visible-items"), [["Label", true], ["Caption", false], ["Menu Button", true]]);
  assert.deepEqual(shown(menuRows(hover(opened, "context.daq-task-name-control.create"), "context.daq-task-name-control.create")),
    ["Local Variable", "Reference", "Property Node", "Invoke Node", "Cluster from Selection"]);
  assert.deepEqual(shown(menuRows(hover(opened, "context.daq-task-name-control.data-operations"), "context.daq-task-name-control.data-operations")),
    ["Reinitialize to Default Value", "Make Current Value Default", "---", "Cut Data", "Copy Data", "Paste Data"]);
  assert.deepEqual(shown(menuRows(hover(opened, "context.daq-task-name-control.advanced"), "context.daq-task-name-control.advanced")),
    ["Key Navigation...", "Synchronous Display", "Customize...", "Run-Time Shortcut Menu", "---", "Hide Control", "Enabled State"]);
  assert.deepEqual(shown(menuRows(hover(opened, "context.daq-task-name-control.new-daq-task"), "context.daq-task-name-control.new-daq-task")), ["Project...", "Device Manager..."]);

  // The indicator (Q1): Change to Control, no Generate Code, Hide Indicator, and a Menu Button that is greyed and unticked.
  const indicator = openPanelMenu(panelObject("daq-name-indicator", "task"));
  assert.deepEqual(shown(menuRows(indicator)).filter((label) => label !== "---"), TASK_ROWS.filter((label) => label !== "---" && label !== "Generate Code").map((label) => (label === "Change to Indicator" ? "Change to Control" : label)));
  const visible = menuRows(hover(indicator, "context.daq-task-name-control.visible-items"), "context.daq-task-name-control.visible-items");
  assert.deepEqual(visible.map((row) => [row.label, row.checked, row.greyed]), [["Label", false, true], ["Caption", false, true], ["Menu Button", false, true]].map(([label, , greyed], at) => [label, at === 0, greyed]));
  assert.deepEqual(menuRows(hover(indicator, "context.daq-task-name-control.advanced"), "context.daq-task-name-control.advanced").at(-2).label, "Hide Indicator");
});

test("the other DAQ names have the panel menu of a Physical Channel", () => {
  // Only the Physical Channel was opened: the other kinds having its rows is unverified (inventory, labview text of the root).
  for (const kind of DAQ_NAME_KINDS.filter((candidate) => candidate !== "task")) {
    const opened = openPanelMenu(panelObject("daq-name-control", kind));
    assert.equal(opened.menu.raiz, DAQ_NAME_PANEL_MENUS.other, kind);
    assert.deepEqual(shown(menuRows(opened)).filter((label) => label !== "---"), OTHER_ROWS.filter((label) => label !== "---"), kind);
  }
  const channel = openPanelMenu(panelObject("daq-name-control", "physical-channel"));
  assert.ok(!menuRows(channel).some((row) => /Task|Generate Code/.test(row.label)), "no task rows");
  const indicator = openPanelMenu(panelObject("daq-name-indicator", "physical-channel"));
  assert.equal(menuRows(indicator).find((row) => /^Change to/.test(row.label)).label, "Change to Control");
  // Key Navigation..., Synchronous Display and Enabled State are greyed in LabVIEW on a Task Name and enabled on a Physical
  // Channel (Q1, "Surprises"): in Solder both are greyed, and the inventory tells the two apart.
  const advanced = ["key-navigation", "synchronous-display", "enabled-state"].map((row) => INV.entrada(`context.daq-name-control.advanced.${row}`).labview);
  const taskAdvanced = ["key-navigation", "synchronous-display", "enabled-state"].map((row) => INV.entrada(`context.daq-task-name-control.advanced.${row}`).labview);
  advanced.forEach((text) => assert.doesNotMatch(text, /greyed in LabVIEW/));
  taskAdvanced.forEach((text) => assert.match(text, /greyed in LabVIEW on a Task Name/));
});

test("every greyed row of the DAQ name panel menus says what is missing", () => {
  const holes = INV.entradas.filter((entry) => /^context\.daq-(task-)?name-control\./.test(entry.id) && !entry.id.endsWith("-terminal") && esHueco(entry));
  assert.ok(holes.length > 40);
  for (const hole of holes) {
    const { labview, solder } = INV.explicacion(hole);
    assert.ok(labview && /^Missing: /.test(solder), hole.id);
  }
  assert.match(INV.explicacion(INV.entrada("context.daq-task-name-control.edit-daq-task")).solder, /task configuration tool/);
  assert.match(INV.explicacion(INV.entrada("context.daq-task-name-control.new-daq-task")).solder, /task configuration tool/);
});

test("Change to Indicator and Data Operations work from the panel menu of a DAQ name", () => {
  for (const [kind, root] of [["task", DAQ_NAME_PANEL_MENUS.task], ["physical-channel", DAQ_NAME_PANEL_MENUS.other]]) {
    const control = panelObject("daq-name-control", kind);
    const toIndicator = ED.orden(openPanelMenu(control), `${root}.change-to-indicator`, CTX);
    const indicator = toIndicator.g.nodos[0];
    assert.equal(indicator.tipo, "daq-name-indicator", kind);
    assert.deepEqual(indicator.config.type, daqName(kind), "the kind stays");
    assert.equal(P.menuDe(indicator), root, "the same menu, which now says Change to Control");
    const back = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: toIndicator.g }, root, control.id, 0, 0), `${root}.change-to-indicator`, CTX);
    assert.equal(back.g.nodos[0].tipo, "daq-name-control", `${kind}: and back`);

    let { g } = control;
    g = CV.setCurrentValue(g, control.id, "Dev1/ai3");
    const made = ED.orden(ED.abrirMenu({ ...ED.inicial(), g }, root, control.id, 0, 0), `${root}.data-operations.make-current-value-default`, CTX);
    assert.equal(made.g.nodos[0].config.value, "Dev1/ai3", `${kind}: the current value is the default`);
    const reinitialized = ED.orden(ED.abrirMenu({ ...ED.inicial(), g: CV.setCurrentValue(made.g, control.id, "other") }, root, control.id, 0, 0), `${root}.data-operations.reinitialize-to-default-value`, CTX);
    assert.equal(CV.currentValue(reinitialized.g.nodos[0]), "Dev1/ai3", `${kind}: reinitialized`);
  }
});

// ——— The arrow button (Q2) ———

test("the arrow of a DAQ name control opens a list with a greyed Browse...", () => {
  // Q2: a Task Name's popup has the one row; a Physical Channel's goes on with a separator and the channels the driver names
  // (Dev1/ai0 ...). Solder's editor cannot ask the DAQ engine for them (its devices are listed in Rust only), so both lists
  // are the greyed Browse..., and the inventory says why.
  const control = panelObject("daq-name-control", "physical-channel");
  const html = P.contenido({ ...P.inicial(), g: control.g }, CTX);
  assert.match(html, /<span class="sd-dropdown" role="button" aria-haspopup="menu" aria-label="DAQ names" data-daq-dropdown><\/span>/, "the button answers to the window");
  assert.equal(INV.entrada(DAQ_NAME_DROPDOWN_MENU).estado, "built");
  const opened = ED.abrirMenu({ ...ED.inicial(), g: control.g }, DAQ_NAME_DROPDOWN_MENU, control.id, 200, 300);
  const rows = menuRows(opened);
  assert.deepEqual(rows.map((row) => [row.label, row.greyed]), [["Browse...", true]]);
  assert.match(INV.explicacion(INV.entrada(`${DAQ_NAME_DROPDOWN_MENU}.browse`)).solder, /^Missing: .*DAQ driver/);
  const indicator = panelObject("daq-name-indicator", "task");
  assert.doesNotMatch(P.contenido({ ...P.inicial(), g: indicator.g }, CTX), /data-daq-dropdown/, "only the control has the button");
});
