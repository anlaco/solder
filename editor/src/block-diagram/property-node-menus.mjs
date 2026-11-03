// The menus of the Property Node (DT-072 §7): the node's own (its header and its rows), Create ▸ Property Node ▸ on a
// panel control's terminal and on its panel object, and Create ▸ Property for Instr Class ▸ on a VISA resource name.
// The lists of properties come from the catalog (docs/schema/properties.json); a property not done yet is shown
// greyed and explains itself with the catalog's hole.
//
// Measured: labview-captures/reports/2026-10-30-panel-property-node.md (Q1, Q2: `m2`–`m9`, `hm`, `rm`, `cr`, `hm-cr`,
// `hm-pane`) and 2026-10-26-visa-property-node.md (§1, §3, §4). Pure functions over the diagram state of
// diagram-editing.mjs.

import { classOfPanelBlock, isImplicit } from "../../../core/model/property-node.mjs";
import { crearNodo, fijarConfig, tipos } from "../../../core/model/graph.mjs";
import { caja } from "./diagram-view.mjs";
import * as PN from "./property-nodes.mjs";
import { typePaletteLabel } from "./unbundle-by-name.mjs";

const nodeOf = (graph, id) => graph.nodos.find((node) => node.id === id);

// ——— Create ▸ Property Node ▸ and Create ▸ Property for Instr Class ▸ ———

/** The panel objects' menus (their Create ▸ makes the node on the diagram) and the terminals' menus. */
export const PANEL_OBJECT_ROOTS = new Set(["context.numeric-panel-control", "context.boolean-control", "context.boolean-indicator"]);
const CREATE_PROPERTY_NODE = "create.property-node";
const CREATE_INSTR_PROPERTY = "create.property-for-instr-class";

/** The class of the Property Node a menu's Create ▸ makes, by what the menu was opened on, or nothing. */
function createdClass(root, node) {
  if (!node) return null;
  if (node.tipo === "visa-control" || node.tipo === "visa-indicator" || node.tipo === "visa-resource-constant" || root === "context.visa-function-resource-terminal") return PN.INSTR_CLASS;
  return classOfPanelBlock(node.tipo) ?? null;
}

/** The list Create ▸ Property Node ▸ (or Property for Instr Class ▸, without Browse..., visa report §1) shows. */
function createMenu(d, ctx) {
  const root = d.menu.raiz;
  const node = nodeOf(d.g, d.menu.nodo);
  const className = createdClass(root, node);
  if (!className || !ctx?.cat.properties) return null;
  const parent = `${root}.${className === PN.INSTR_CLASS ? CREATE_INSTR_PROPERTY : CREATE_PROPERTY_NODE}`;
  return { parent, className, menu: PN.propertyMenu(ctx.cat, className, parent) };
}

/** What a property menu adds to the variants of the open menu: its rows, and its holes pointed at the catalog's. */
const menuVariants = (menu) => ({ submenus: menu.submenus, redirigidos: new Map([...menu.holes].map((id) => [id, PN.PROPERTY_HOLE])) });

export function createVariants(d, ctx) {
  if (!d.menu || PN.isPropertyNode(nodeOf(d.g, d.menu.nodo))) return {};
  const created = createMenu(d, ctx);
  return created ? menuVariants(created.menu) : {};
}

/**
 * Picking a property in Create ▸ Property Node ▸: on a terminal, the node hangs from the cursor until it is placed
 * (DT-072 §7); on a panel object it is put on the diagram at the right of the terminal (unverified: where LabVIEW
 * puts it was not measured). Returns the new state, or null if `id` is not such a row.
 */
export function createCommand(d, id, ctx, pickUp) {
  const created = createMenu(d, ctx);
  const propertyId = created?.menu.properties.get(id);
  if (!propertyId) return null;
  const node = nodeOf(d.g, d.menu.nodo);
  const config = created.className === PN.INSTR_CLASS ? PN.instrConfig(propertyId) : PN.implicitConfig(created.className, node.name, propertyId);
  if (!PANEL_OBJECT_ROOTS.has(d.menu.raiz)) return pickUp({ ...d, menu: null }, PN.PROPERTY_NODE, config);
  return { ...d, g: placedBesideTerminal(d.g, ctx, node, config), menu: null };
}

/** How far right of the terminal's box a node made from the panel lands (unverified). */
const BESIDE_TERMINAL = 20;

function placedBesideTerminal(graph, ctx, terminal, config) {
  const box = caja(terminal, ctx);
  const created = crearNodo(graph, ctx.cat, PN.PROPERTY_NODE, box.x + box.ancho + BESIDE_TERMINAL, box.y);
  return fijarConfig(created.g, created.id, config);
}

// ——— The node's own menu ———

/** The rows of a row that depend on it: which row the menu is on (-1 on the header). */
const menuRow = (d) => PN.rowOfPort(d.menu.puerto);

/** The type of a row's terminal, from the resolved types of the diagram. */
function rowTerminalType(d, ctx, node, row) {
  const resolved = tipos(d.g, ctx.cat);
  const key = `${node.id}.${PN.portOfRow(row)}`;
  return resolved.salidas.get(key) ?? resolved.entradas.get(key);
}

function selectPropertyMenu(d, ctx, node, row) {
  const parent = `${d.menu.raiz}.select-property`;
  const current = PN.rowsOf(node)[row]?.property;
  // Select Property ▸ of an Instr node has Browse... first, as the implicit node's (visa report §3, `sp`).
  return PN.propertyMenu(ctx.cat, node.config.class, parent, { browse: true, current });
}

/** The controls Link to ▸ Pane ▸ lists, by the id of their rows. */
function paneMenu(d, node) {
  const parent = `${d.menu.raiz}.link-to.pane`;
  const objects = PN.linkablePanelObjects(d.g, classOfPanelBlock);
  const rows = objects.map((object, index) => ({ id: `${parent}.${object.name}`, etiqueta: object.label, estado: "built", ...(index === 0 ? { separado: true } : {}) }));
  // "Pane" links the node to the pane itself, whose class is not in the catalog yet: the inventory explains it.
  return { parent, rows: [{ id: `${parent}.pane`, etiqueta: "Pane", estado: "todo" }, ...rows], objects };
}

/**
 * The rows of the node's menu that depend on where it was opened and on the node: on the header the rows of a row
 * are hidden and the separators move (`hm` against `rm`); Help For names the row's property; Change To Write reads
 * Change To Read on a writing row and is greyed when the property cannot turn; Remove Element is greyed with one
 * row; the palette row is the type's; Select Property ▸ and Link to ▸ Pane ▸ are filled in.
 */
export function nodeVariants(d, ctx) {
  const node = nodeOf(d.g, d.menu.nodo);
  const root = d.menu.raiz;
  const row = menuRow(d);
  const at = (name) => `${root}.${name}`;
  const variants = { ocultos: new Set(), desactivados: new Set(), rotulos: new Map(), separadores: new Map(), submenus: new Map(), redirigidos: new Map() };
  if (PN.allWrite(node)) variants.rotulos.set(at("change-all-to-write"), "Change All To Read");
  if (row < 0) {
    PN.ROW_ONLY_ROWS.forEach((name) => variants.ocultos.add(at(name)));
    variants.separadores.set(at(isImplicit(node) ? "application-control-palette" : "visa-palette"), true);
    variants.separadores.set(at("replace"), false);
    // The implicit header's Create ▸ has no rows for a terminal: it starts with Property for ... Class (`hm-cr`).
    // An Instr header's was not measured: its Constant, Control and Indicator are greyed, as on any node's body.
    if (isImplicit(node)) {
      ["constant", "control", "indicator", "channel-writer"].forEach((name) => variants.ocultos.add(at(`create.${name}`)));
      variants.separadores.set(at("create.property-for-class"), false);
    }
  } else {
    const rowEntry = PN.rowsOf(node)[row];
    const property = PN.rowProperty(node, ctx.cat, row);
    if (property?.done) variants.rotulos.set(at("help-for-property"), `Help For ${rowEntry.property}`);
    else variants.ocultos.add(at("help-for-property"));
    if (rowEntry.write) variants.rotulos.set(at("change-to-write"), "Change To Read");
    if (!PN.canFlip(node, ctx.cat, row)) variants.desactivados.add(at("change-to-write"));
    if (PN.rowsOf(node).length <= 1) variants.desactivados.add(at("remove-element"));
    const palette = property?.done ? typePaletteLabel(rowTerminalType(d, ctx, node, row)) : null;
    if (palette) variants.rotulos.set(at("type-palette"), palette);
    else variants.ocultos.add(at("type-palette"));
    if (!property?.done) ["constant", "control", "indicator"].forEach((name) => variants.desactivados.add(at(`create.${name}`)));
    const select = selectPropertyMenu(d, ctx, node, row);
    for (const [parent, rows] of select.submenus) variants.submenus.set(parent, rows);
    for (const hole of select.holes) variants.redirigidos.set(hole, PN.PROPERTY_HOLE);
  }
  if (isImplicit(node)) {
    const pane = paneMenu(d, node);
    variants.submenus.set(pane.parent, pane.rows);
  }
  return variants;
}

/** The rows ticked: Short Names, Ignore Errors inside Node when on, the row's property, and the linked control. */
export function marks(d, ctx) {
  const node = nodeOf(d.g, d.menu.nodo);
  const root = d.menu.raiz;
  const ticked = new Set([`${root}.name-format.short-names`]);
  if (node.config?.["ignore-errors"]) ticked.add(`${root}.ignore-errors-inside-node`);
  const row = menuRow(d);
  if (row >= 0) for (const mark of selectPropertyMenu(d, ctx, node, row).marks) ticked.add(mark);
  if (isImplicit(node)) {
    ticked.add(`${root}.link-to.pane`);
    ticked.add(`${root}.link-to.pane.${node.config.link}`);
  }
  return ticked;
}

/**
 * The commands of the node's menu. Each changes the graph once, so each is one step of undo; a change of the rows
 * keeps the node's centre. Returns the new state, or null if `id` is not one of them.
 */
export function nodeCommand(d, id, ctx) {
  const node = nodeOf(d.g, d.menu.nodo);
  const root = d.menu.raiz;
  const row = menuRow(d);
  const edited = (graph) => ({ ...d, g: PN.keepCentre(d.g, graph, ctx.cat, ctx.medir, node.id), menu: null });
  if (id === `${root}.change-all-to-write`) return edited(PN.flipAllRows(d.g, ctx.cat, node.id));
  if (id === `${root}.ignore-errors-inside-node`) return edited(PN.toggleIgnoreErrors(d.g, node.id));
  if (id.startsWith(`${root}.link-to.pane.`)) {
    const object = paneMenu(d, node).objects.find((candidate) => id === `${root}.link-to.pane.${candidate.name}`);
    return object ? edited(PN.linkTo(d.g, node.id, object.name, object.class)) : null;
  }
  if (row < 0) return null;
  if (id === `${root}.change-to-write`) return edited(PN.flipRow(d.g, ctx.cat, node.id, row));
  if (id === `${root}.add-element`) return edited(PN.addRow(d.g, node.id, row));
  if (id === `${root}.remove-element`) return edited(PN.removeRow(d.g, node.id, row));
  const propertyId = id.startsWith(`${root}.select-property.`) && selectPropertyMenu(d, ctx, node, row).properties.get(id);
  if (propertyId) return edited(PN.selectProperty(d.g, ctx.cat, node.id, row, propertyId));
  return null;
}
