// Replace ▸ on a front-panel object (DT-092): the Controls palette opens as a submenu of the row, and picking an item
// replaces the object in place. The node stays (so its wires do), with its label, its representation when the new
// object has one, its value and its role of control or indicator. Measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-11-15-delete-replace.md §C and 2026-11-15-terminal-hot-zones.md §3.

import * as Gr from "../../../core/model/graph.mjs";
import * as CV from "../../../core/model/control-values.mjs";
import { NUMERICOS, convertirValor } from "../../../core/model/types.mjs";
import { paletteElements } from "./palette-elements.mjs";
import { ultimo } from "./labview-inventory.mjs";

/**
 * The menus of the panel objects that have Replace ▸. The graphs and the arrays are left out: their size, their plots
 * and their elements are state that this replacement does not carry (DT-092 asks for numerics first).
 */
export const PANEL_REPLACE_ROOTS = new Set([
  "context.numeric-panel-control", "context.boolean-control", "context.boolean-indicator", "context.enum-control", "context.enum-indicator",
  "context.ring-control", "context.ring-indicator", "context.path-control", "context.visa-control", "context.daq-task-name-control", "context.daq-name-control",
]);

/** The Controls palette, whose folders and items the submenu shows. */
const CONTROLS_PALETTE = "palette.controls";

const replaceRow = (root) => `${root}.replace`;

/** Is `id` an item picked in the submenu of Replace ▸ of the menu `root`? */
export const isReplacePick = (root, id) => PANEL_REPLACE_ROOTS.has(root) && id.startsWith(`${replaceRow(root)}.`);

/** The palette entry a submenu row stands for: its path under the Replace row is the palette's path under Controls. */
const paletteIdOfRow = (root, rowId) => `${CONTROLS_PALETTE}.${rowId.slice(replaceRow(root).length + 1)}`;

const roleOf = (tipo, cat) => (cat.bloque(tipo).out.length > 0 ? "control" : "indicator");

/**
 * The block of the same kind as `tipo` that has `role`: `bool-indicator` as a control is `bool-control`. A control stays
 * a control and an indicator an indicator whatever item is picked (measured: Replace by a Numeric Indicator left a
 * numeric control a control). Null for what has no such block (a graph is only an indicator in Solder yet).
 */
export function blockWithRole(tipo, role, cat) {
  const candidate = tipo.replace(/(^|-)(control|indicator)$/, `$1${role}`);
  return cat.tiene(candidate) && cat.bloque(candidate).panel && roleOf(candidate, cat) === role ? candidate : null;
}

/** The palette item `entry` as a panel object of `role`: its block and config, or null when Solder cannot make it. */
function pickableItem(entry, role, cat) {
  if (entry.estado !== "built" || !entry.bloque || !cat.tiene(entry.bloque) || !cat.bloque(entry.bloque).panel) return null;
  const tipo = blockWithRole(entry.bloque, role, cat);
  return tipo && { tipo, config: entry.config };
}

/**
 * The rows under `parentRow` for the elements of palette `paletteId`, and their submenus, added to `parts`. A folder with
 * content opens whatever its own verdict; what Solder lacks is a hole that explains itself through its palette entry
 * (DT-035), and an item the object's role cannot take is greyed.
 */
function addRows(parentRow, paletteId, ctx, inv, role, parts) {
  const rows = paletteElements(inv, paletteId).map((entry) => {
    const id = `${parentRow}.${ultimo(entry.id)}`;
    const isFolder = paletteElements(inv, entry.id).length > 0;
    if (isFolder) {
      addRows(id, entry.id, ctx, inv, role, parts);
      return { id, etiqueta: entry.etiqueta, estado: "built" };
    }
    if (entry.estado !== "built") {
      parts.redirigidos.set(id, entry.id);
      return { id, etiqueta: entry.etiqueta, estado: entry.estado };
    }
    if (!pickableItem(entry, role, ctx.cat)) parts.desactivados.add(id);
    return { id, etiqueta: entry.etiqueta, estado: "built" };
  });
  parts.submenus.set(parentRow, rows);
}

/**
 * What the open menu changes for Replace ▸. On the panel the row opens the Controls palette; the diagram terminal's menu
 * has no Replace (measured), though an enum's terminal shares the panel enum's menu, so there the row is hidden.
 * `inv` and `ctx` are needed for the submenu; without them the row is plain.
 */
export function replaceVariants(d, inv, ctx) {
  const root = d.menu?.raiz;
  if (!PANEL_REPLACE_ROOTS.has(root)) return {};
  if (d.menu.canvas !== "panel") return { ocultos: new Set([replaceRow(root)]) };
  const node = d.g.nodos.find((candidate) => candidate.id === d.menu.nodo);
  if (!inv || !ctx || !node) return {};
  const parts = { submenus: new Map(), redirigidos: new Map(), desactivados: new Set() };
  addRows(replaceRow(root), CONTROLS_PALETTE, ctx, inv, roleOf(node.tipo, ctx.cat), parts);
  return parts;
}

// ——— The replacement ———

/** The kind of data a panel object holds, for deciding whether its value survives: numerics, booleans, strings... */
function familyOf(node) {
  if (node.tipo === "control" || node.tipo === "indicator") return typeof node.config?.type === "string" && node.config.type in NUMERICOS ? "numeric" : null;
  return node.tipo.replace(/-(control|indicator)$/, "");
}

const sameType = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The config and values `fresh` (the new object as the palette makes it) has once it takes what `old` held. A numeric
 * keeps its representation, and its values convert to it (an I32 stays an I32 under a Knob or a Text Ring, measured).
 * Another kind of object keeps its value when it is of the same kind and type. Any other change gives the new object's
 * default value (unverified: only numerics were measured).
 */
function carried(old, fresh) {
  const family = familyOf(old);
  if (!family || family !== familyOf(fresh)) return { config: fresh.config };
  if (family === "numeric") {
    const type = old.config.type;
    const convert = (value) => convertirValor(value, type);
    return { config: { ...fresh.config, type, value: convert(CV.defaultValue(old)) }, ...(CV.hasCurrentValue(old) && { currentValue: convert(old.currentValue) }) };
  }
  if (!sameType(old.config?.type, fresh.config?.type)) return { config: fresh.config };
  return { config: { ...fresh.config, value: old.config?.value }, ...(CV.hasCurrentValue(old) && { currentValue: old.currentValue }) };
}

/**
 * The graph with panel object `id` replaced by the palette item that submenu row `rowId` of menu `root` stands for: the
 * same node, with its label and its place (the size is the new object's; keeping the old top-left is unverified: LabVIEW
 * moved it by a few pixels). A change of data type leaves the wires that no longer fit broken, as the types resolve.
 * Null when the row is not an item Solder can make for this object.
 */
export function replacedObject(graph, id, root, rowId, ctx, inv) {
  const old = graph.nodos.find((node) => node.id === id);
  const entry = inv.entrada(paletteIdOfRow(root, rowId));
  const item = old && entry && pickableItem(entry, roleOf(old.tipo, ctx.cat), ctx.cat);
  if (!item) return null;
  // The palette's own recipe (defaults, styles, mechanical actions) builds the new object on a scratch graph.
  const { g: scratch, id: freshId } = Gr.crearEnPanel(graph, ctx.cat, item.tipo, 0, 0, old.label?.text ?? "", item.config);
  const fresh = scratch.nodos.find((node) => node.id === freshId);
  const { currentValue: _dropped, config: _oldConfig, ...kept } = old;
  const replacement = { ...kept, tipo: fresh.tipo, ...carried(old, fresh) };
  return { ...graph, nodos: graph.nodos.map((node) => (node.id === id ? replacement : node)) };
}
